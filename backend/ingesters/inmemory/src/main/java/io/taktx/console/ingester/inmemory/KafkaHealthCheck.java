/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.taktx.client.TaktXClient;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

/**
 * MicroProfile Health check that verifies Kafka connectivity via the TaktX client.
 *
 * <p>Exposed at {@code GET /q/health} (included in the overall readiness check). The platform
 * service uses this endpoint to determine both ingester reachability and Kafka health in a single
 * call — no separate Kafka client dependency needed in the platform service.
 *
 * <p>The check name {@code "kafka"} is used by the platform service health parser to distinguish
 * this check from other health checks in the response.
 */
@Readiness
@ApplicationScoped
@Slf4j
public class KafkaHealthCheck implements HealthCheck {

  @Inject TaktXClient taktXClient;

  @Override
  public HealthCheckResponse call() {
    try {
      // Call getDeployedProcessDefinitions() purely as a connectivity probe.
      // A live Kafka connection is required for this to succeed.
      var definitions = taktXClient.getProcessDefinitionConsumer().getDeployedProcessDefinitions();
      log.debug("Kafka health check: UP ({} definitions loaded)", definitions.size());
      return HealthCheckResponse.named("kafka").up().build();
    } catch (Exception e) {
      log.warn("Kafka health check: DOWN — {}", e.getMessage());
      return HealthCheckResponse.named("kafka").down().withData("error", e.getMessage()).build();
    }
  }
}
