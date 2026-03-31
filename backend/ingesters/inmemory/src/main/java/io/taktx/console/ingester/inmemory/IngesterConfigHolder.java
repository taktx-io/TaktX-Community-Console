/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;

/**
 * Thread-safe in-memory holder for the runtime configuration pushed by Platform Service via {@code
 * POST /internal/config}.
 *
 * <p>The ingester only caches the fields it directly acts on:
 *
 * <ul>
 *   <li>{@code signingEnabled} — controls Ed25519 signature verification on incoming
 *       instance-update records. When {@code true}, records without a valid {@code
 *       X-TaktX-Signature} header are rejected.
 * </ul>
 *
 * {@code trustedKeyIds}) are forwarded to the engine via the {@code taktx-configuration} Kafka
 * topic and are not retained here.
 *
 * <p>On startup the holder is empty and defaults to {@code signingEnabled=false}. Once Platform
 * Service pushes a config record, the value is updated in place. A callback (registered by {@link
 * Ingester}) is invoked after each update so that signing/license alignment can be re-evaluated
 * without requiring a restart.
 */
@ApplicationScoped
@Slf4j
public class IngesterConfigHolder {

  private final AtomicBoolean signingEnabled = new AtomicBoolean(false);

  /**
   * Optional callback invoked after each config update. {@link Ingester} registers its {@code
   * checkSigningAlignment()} method here so alignment is re-evaluated on every push.
   */
  private volatile Runnable onConfigUpdated = null;

  /**
   * Registers a callback to be invoked after each call to {@link #update(boolean)}.
   *
   * @param callback the runnable to invoke; replaces any previously registered callback
   */
  public void setOnConfigUpdated(Runnable callback) {
    this.onConfigUpdated = callback;
  }

  /**
   * Updates the cached {@code signingEnabled} flag. Called by {@code NamespaceConfigResource} on
   * every config push from Platform Service.
   *
   * @param signingEnabled {@code true} to enforce Ed25519 signature verification
   */
  public void update(boolean signingEnabled) {
    boolean previous = this.signingEnabled.getAndSet(signingEnabled);
    if (previous != signingEnabled) {
      log.info("Runtime config updated: signingEnabled={}", signingEnabled);
    }

    Runnable cb = onConfigUpdated;
    if (cb != null) {
      cb.run();
    }
  }

  /**
   * Returns {@code true} if Ed25519 event signature verification is currently enabled.
   *
   * <p>Defaults to {@code false} until Platform Service pushes a config record.
   */
  public boolean isSigningEnabled() {
    return signingEnabled.get();
  }
}
