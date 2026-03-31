/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.testing;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.util.Map;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Starts a real Kafka broker for Quarkus tests and exposes it via this module's raw {@code
 * bootstrap.servers} configuration key so {@code TaktXClient} connects to the container instead of
 * the local default broker.
 */
public final class KafkaTestResource implements QuarkusTestResourceLifecycleManager {

  private static final DockerImageName KAFKA_IMAGE =
      DockerImageName.parse("apache/kafka-native:3.8.0");

  private KafkaContainer kafkaContainer;

  @Override
  public Map<String, String> start() {
    kafkaContainer = new KafkaContainer(KAFKA_IMAGE);
    kafkaContainer.start();

    String bootstrapServers = kafkaContainer.getBootstrapServers();
    return Map.of(
        "bootstrap.servers", bootstrapServers,
        "BOOTSTRAP_SERVERS", bootstrapServers);
  }

  @Override
  public void stop() {
    if (kafkaContainer != null) {
      kafkaContainer.stop();
      kafkaContainer = null;
    }
  }
}
