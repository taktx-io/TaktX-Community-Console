/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.license;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.slf4j.Slf4j;

/**
 * Thread-safe in-memory holder for the license text pushed by Platform Service.
 *
 * <p>The ingester does not include the License3j library — it stores the raw signed license text
 * and exposes simple flags that are parsed and cached on each update. Platform Service has already
 * verified the signature; the ingester trusts the push channel (internal-only port).
 *
 * <p>On startup the holder is empty. Once Platform Service pushes a license via {@code POST
 * /internal/license}, the holder is populated. Until then, {@link #isEventSigningEnabled()} returns
 * {@code false} and other limits return {@code null} (unlimited / community defaults).
 */
@ApplicationScoped
@Slf4j
public class InMemoryLicenseHolder {

  private final AtomicReference<ParsedLicense> current = new AtomicReference<>(null);

  /**
   * Optional callback invoked after each license update. {@link
   * io.taktx.console.ingester.inmemory.Ingester} registers its {@code checkSigningAlignment()}
   * method here so that signing/license alignment is re-evaluated on every push without requiring
   * an ingester restart.
   */
  private volatile Runnable onLicenseUpdated = null;

  /**
   * Registers a callback to be invoked after each call to {@link #update(String)}.
   *
   * @param callback the runnable to invoke; replaces any previously registered callback
   */
  public void setSigningAlignmentCallback(Runnable callback) {
    this.onLicenseUpdated = callback;
  }

  /**
   * Update the cached license. Called by {@link
   * io.taktx.console.ingester.inmemory.resources.LicenseResource} on every push from Platform
   * Service.
   *
   * <p>The raw text is parsed eagerly so that flag lookups are O(1) at runtime.
   *
   * @param licenseText raw License3j-signed license file content
   */
  public void update(String licenseText) {
    ParsedLicense parsed = ParsedLicense.parse(licenseText);
    current.set(parsed);
    log.info(
        "License updated: type={} eventSigning={} maxWorkers={} storageTier={}",
        parsed.licenseType(),
        parsed.eventSigningEnabled(),
        parsed.maxWorkers() != null ? parsed.maxWorkers() : "unlimited",
        parsed.runwayStorageTier());

    // Notify Ingester so it can re-evaluate signing/license alignment immediately,
    // without requiring a restart (e.g. after a license upgrade that enables eventSigning).
    Runnable cb = onLicenseUpdated;
    if (cb != null) {
      cb.run();
    }
  }

  /** Returns {@code true} if the active license has {@code eventSigning=true}. */
  public boolean isEventSigningEnabled() {
    ParsedLicense p = current.get();
    return p != null && p.eventSigningEnabled();
  }

  /**
   * Returns the maximum number of job workers allowed, or {@code null} if no license has been
   * received (community default: unlimited until Platform Service pushes a license).
   */
  public Integer getMaxWorkers() {
    ParsedLicense p = current.get();
    return p != null ? p.maxWorkers() : null;
  }

  /** Returns the runway storage tier, or {@code "inmemory"} if no license has been received. */
  public String getRunwayStorageTier() {
    ParsedLicense p = current.get();
    return p != null ? p.runwayStorageTier() : "inmemory";
  }

  /** Returns {@code true} once Platform Service has pushed a license. */
  public boolean isLoaded() {
    return current.get() != null;
  }

  // ─── Simple line-by-line parser ───────────────────────────────────────────
  // License3j produces key=value lines in the plain-text section of the license.
  // We only need a handful of fields; the signature block (-----BEGIN LICENSE-----
  // / -----END LICENSE-----) is ignored here — Platform Service already verified it.

  private record ParsedLicense(
      String licenseType,
      boolean eventSigningEnabled,
      Integer maxWorkers,
      String runwayStorageTier) {

    static ParsedLicense parse(String licenseText) {
      String licenseType = "FREE";
      boolean eventSigning = false;
      Integer maxWorkers = null;
      String storageTier = "inmemory";

      if (licenseText != null) {
        for (String line : licenseText.split("\\r?\\n")) {
          String trimmed = line.trim();
          if (trimmed.startsWith("licenseType=")) {
            licenseType = trimmed.substring("licenseType=".length()).trim();
          } else if (trimmed.startsWith("eventSigning=")) {
            eventSigning =
                "true".equalsIgnoreCase(trimmed.substring("eventSigning=".length()).trim());
          } else if (trimmed.startsWith("maxWorkers=")) {
            try {
              maxWorkers = Integer.parseInt(trimmed.substring("maxWorkers=".length()).trim());
            } catch (NumberFormatException ignored) {
              // leave null (unlimited)
            }
          } else if (trimmed.startsWith("runwayStorageTier=")) {
            storageTier = trimmed.substring("runwayStorageTier=".length()).trim();
          }
        }
      }

      return new ParsedLicense(licenseType, eventSigning, maxWorkers, storageTier);
    }
  }
}
