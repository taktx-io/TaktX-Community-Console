/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Duration;
import java.util.Properties;
import lombok.Getter;
import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
@Getter
public class IngesterStartupConfig {

  private static final String REPLAY_KAFKA_PREFIX = "taktx.ingester.instance-update.kafka.";

  @ConfigProperty(name = "bootstrap.servers")
  String bootstrapServers;

  @ConfigProperty(name = "taktx.engine.tenant-id")
  String tenantId;

  @ConfigProperty(name = "taktx.engine.namespace")
  String namespace;

  @ConfigProperty(name = "taktx.client.groupId.instanceupdate")
  String instanceUpdateGroupId;

  @ConfigProperty(name = "taktx.ingester.instance-update.start-position", defaultValue = "RESUME")
  InstanceUpdateStartPosition startPosition;

  @ConfigProperty(
      name = "taktx.ingester.instance-update.clear-store-before-replay",
      defaultValue = "true")
  boolean clearStoreBeforeReplay;

  @ConfigProperty(name = "taktx.ingester.retention.enabled", defaultValue = "true")
  boolean retentionEnabled;

  @ConfigProperty(name = "taktx.ingester.retention.check-interval", defaultValue = "PT30S")
  Duration retentionCheckInterval;

  @ConfigProperty(name = "taktx.ingester.retention.heap-target-watermark", defaultValue = "0.65")
  double retentionHeapTargetWatermark;

  @ConfigProperty(name = "taktx.ingester.retention.heap-high-watermark", defaultValue = "0.80")
  double retentionHeapHighWatermark;

  @ConfigProperty(name = "taktx.ingester.retention.min-terminal-instances", defaultValue = "5000")
  int retentionMinTerminalInstances;

  @ConfigProperty(name = "taktx.ingester.retention.max-terminal-instances", defaultValue = "25000")
  int retentionMaxTerminalInstances;

  @ConfigProperty(name = "taktx.ingester.retention.min-flow-node-updates", defaultValue = "150000")
  long retentionMinFlowNodeUpdates;

  @ConfigProperty(name = "taktx.ingester.retention.max-flow-node-updates", defaultValue = "750000")
  long retentionMaxFlowNodeUpdates;

  @ConfigProperty(name = "taktx.ingester.retention.min-retained-bytes", defaultValue = "268435456")
  long retentionMinRetainedBytes;

  @ConfigProperty(name = "taktx.ingester.retention.max-retained-bytes", defaultValue = "1073741824")
  long retentionMaxRetainedBytes;

  @ConfigProperty(name = "taktx.ingester.retention.evict-batch-size", defaultValue = "250")
  int retentionEvictBatchSize;

  @ConfigProperty(name = "taktx.ingester.retention.min-terminal-age", defaultValue = "PT5M")
  Duration retentionMinTerminalAge;

  @Inject Config config;

  public Properties replayConsumerBaseProperties() {
    Properties properties = new Properties();
    properties.put("bootstrap.servers", bootstrapServers);
    properties.put("taktx.engine.tenant-id", tenantId);
    properties.put("taktx.engine.namespace", namespace);

    for (String propertyName : config.getPropertyNames()) {
      if (propertyName.startsWith(REPLAY_KAFKA_PREFIX)) {
        String kafkaPropertyName = propertyName.substring(REPLAY_KAFKA_PREFIX.length());
        properties.put(kafkaPropertyName, config.getValue(propertyName, String.class));
      }
    }

    return properties;
  }
}
