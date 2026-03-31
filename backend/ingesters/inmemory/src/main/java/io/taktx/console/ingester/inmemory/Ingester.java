/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.quarkus.runtime.Startup;
import io.quarkus.runtime.StartupEvent;
import io.taktx.client.TaktXClient;
import io.taktx.console.ingester.inmemory.license.InMemoryLicenseHolder;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

@ApplicationScoped
@Startup
public class Ingester {

  private static final Logger log = Logger.getLogger(Ingester.class);

  @Inject TaktXClient taktXClient;
  @Inject InstanceUpdateRegistry registry;
  @Inject InMemoryLicenseHolder licenseHolder;
  @Inject IngesterConfigHolder configHolder;

  void onStart(@Observes @Priority(2000) StartupEvent ev) {
    // TAKTX_SIGNING_ENABLED has been removed. signingEnabled is now driven by the
    // runtime config pushed from Platform Service via POST /internal/config and
    // stored in IngesterConfigHolder. Default is false until Platform Service pushes.
    checkSigningAlignment();

    // Re-evaluate alignment after every license push (e.g. eventSigning flag changes)
    licenseHolder.setSigningAlignmentCallback(this::checkSigningAlignment);

    // Re-evaluate alignment after every config push (e.g. operator enables signing via UI)
    configHolder.setOnConfigUpdated(this::checkSigningAlignment);

    try {
      taktXClient.registerInstanceUpdateConsumer(
          "ingester-inmemory",
          instanceUpdateRecords -> registry.handleInstanceUpdates(instanceUpdateRecords));
    } catch (Exception e) {
      log.error("Failed to register instance update consumer", e);
    }
  }

  /**
   * Evaluates the alignment between the runtime {@code signingEnabled} flag (operator intent,
   * pushed from Platform Service via {@link IngesterConfigHolder}) and the {@code eventSigning}
   * license flag (license permission). Called at startup and after every license or config push.
   *
   * <p>Three cases:
   *
   * <ol>
   *   <li>{@code signingEnabled=true, eventSigning=true} — correct, log confirmation.
   *   <li>{@code signingEnabled=true, eventSigning=false} — enforcement is active but the license
   *       does not permit it. Log a warning; signing enforcement still runs (operator controls the
   *       switch, not the license). Operator should either disable signing or upgrade the license.
   *   <li>{@code signingEnabled=false, eventSigning=true} — license allows signing but the operator
   *       has not enabled it. Log a hint so the operator knows they can enable it.
   * </ol>
   */
  void checkSigningAlignment() {
    boolean signingEnabled = configHolder.isSigningEnabled();

    if (!signingEnabled) {
      if (licenseHolder.isLoaded() && licenseHolder.isEventSigningEnabled()) {
        log.info(
            "ℹ️  Ed25519 event signing is permitted by the active license but"
                + " signingEnabled=false in namespace config — signing enforcement is off."
                + " Enable signing via the Platform Service namespace settings to activate it.");
      }
      // signingEnabled=false, eventSigning=false (or no license yet) — nothing to report.
      return;
    }

    // signingEnabled=true from here
    if (!licenseHolder.isLoaded()) {
      log.warn(
          "⚠️  signingEnabled=true but no license has been received yet."
              + " Unsigned instance-update records will be rejected."
              + " Ensure Platform Service pushes the license before engine events arrive.");
    } else if (!licenseHolder.isEventSigningEnabled()) {
      log.warn(
          "⚠️  signingEnabled=true but the active license has eventSigning=false."
              + " Signing enforcement is active — unsigned records will be rejected."
              + " Either disable signing in the namespace config or upgrade the license to enable"
              + " event signing.");
    } else {
      log.info("✅ Ed25519 event signing enforcement enabled and licensed.");
    }
  }
}
