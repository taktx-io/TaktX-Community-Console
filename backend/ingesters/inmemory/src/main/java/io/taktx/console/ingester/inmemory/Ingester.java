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
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

@ApplicationScoped
@Startup
public class Ingester {

  private static final Logger log = Logger.getLogger(Ingester.class);

  @Inject InstanceUpdateRegistry registry;
  @Inject IngesterConfigHolder configHolder;
  @Inject InstanceUpdateConsumerManager consumerManager;

  void onStart(@Observes @Priority(2000) StartupEvent ev) {
    try {
      consumerManager.start(
          instanceUpdateRecords -> registry.handleInstanceUpdates(instanceUpdateRecords));
    } catch (Exception e) {
      log.error("Failed to register instance update consumer", e);
    }
  }
}
