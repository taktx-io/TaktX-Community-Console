/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.taktx.Topics;
import io.taktx.client.InstanceUpdateRecord;
import io.taktx.client.TaktXClient;
import io.taktx.client.serdes.InstanceUpdateJsonDeserializer;
import io.taktx.dto.InstanceUpdateDTO;
import io.taktx.util.TaktPropertiesHelper;
import io.taktx.util.TaktUUIDDeserializer;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.RecordDeserializationException;
import org.apache.kafka.common.errors.WakeupException;

@Slf4j
@ApplicationScoped
public class InstanceUpdateConsumerManager {

  private final ExecutorService replayExecutor =
      Executors.newSingleThreadExecutor(
          runnable -> {
            Thread thread = new Thread(runnable, "instance-update-replay-consumer");
            thread.setDaemon(true);
            return thread;
          });

  @Inject TaktXClient taktXClient;
  @Inject IngesterStartupConfig startupConfig;
  @Inject IngestionStore ingestionStore;

  private final AtomicBoolean replayRunning = new AtomicBoolean(false);
  private volatile KafkaConsumer<UUID, InstanceUpdateDTO> replayConsumer;

  public void start(Consumer<List<InstanceUpdateRecord>> consumer) {
    if (startupConfig.getStartPosition() == InstanceUpdateStartPosition.RESUME) {
      log.info("Starting instance-update consumer in RESUME mode");
      taktXClient.registerInstanceUpdateConsumer("ingester-inmemory", consumer);
      return;
    }

    if (startupConfig.isClearStoreBeforeReplay()) {
      ingestionStore.clear();
      log.info("Cleared ingestion store before replay startup");
    }

    startReplayConsumer(consumer);
  }

  private void startReplayConsumer(Consumer<List<InstanceUpdateRecord>> consumer) {
    if (!replayRunning.compareAndSet(false, true)) {
      log.warn("Replay consumer already running; ignoring duplicate start request");
      return;
    }

    replayExecutor.submit(() -> runReplayConsumer(consumer));
  }

  private void runReplayConsumer(Consumer<List<InstanceUpdateRecord>> consumerHandler) {
    TaktPropertiesHelper helper =
        new TaktPropertiesHelper(startupConfig.replayConsumerBaseProperties());
    Properties consumerProperties =
        helper.getKafkaConsumerProperties(
            startupConfig.getInstanceUpdateGroupId(),
            TaktUUIDDeserializer.class,
            InstanceUpdateJsonDeserializer.class,
            "earliest");
    String topicName = helper.getPrefixedTopicName(Topics.INSTANCE_UPDATE_TOPIC.getTopicName());

    log.info(
        "Starting instance-update replay consumer from EARLIEST for topic={} groupId={}",
        topicName,
        startupConfig.getInstanceUpdateGroupId());

    try (KafkaConsumer<UUID, InstanceUpdateDTO> consumer =
        new KafkaConsumer<>(consumerProperties)) {
      replayConsumer = consumer;
      consumer.subscribe(Collections.singletonList(topicName));
      seekToBeginningAfterAssignment(consumer, topicName);

      while (replayRunning.get()) {
        ConsumerRecords<UUID, InstanceUpdateDTO> records = pollSafely(consumer);
        if (records == null || records.isEmpty()) {
          continue;
        }

        List<InstanceUpdateRecord> batch = new ArrayList<>(records.count());
        for (ConsumerRecord<UUID, InstanceUpdateDTO> record : records) {
          if (record.value() == null) {
            log.error(
                "Null InstanceUpdateDTO value on topic={} partition={} offset={} — skipping record",
                record.topic(),
                record.partition(),
                record.offset());
            continue;
          }

          batch.add(
              new InstanceUpdateRecord(
                  record.timestamp(),
                  record.key(),
                  record.value(),
                  record.partition(),
                  record.offset()));
        }

        if (!batch.isEmpty()) {
          consumerHandler.accept(batch);
        }
      }
    } catch (WakeupException e) {
      if (replayRunning.get()) {
        log.error("Replay consumer interrupted unexpectedly", e);
      }
    } catch (Exception e) {
      log.error("Replay consumer failed", e);
    } finally {
      replayConsumer = null;
      replayRunning.set(false);
    }
  }

  private ConsumerRecords<UUID, InstanceUpdateDTO> pollSafely(
      KafkaConsumer<UUID, InstanceUpdateDTO> consumer) {
    try {
      return consumer.poll(Duration.ofMillis(100));
    } catch (RecordDeserializationException e) {
      TopicPartition topicPartition = e.topicPartition();
      log.error(
          "Failed to deserialise InstanceUpdateDTO on topic={} partition={} offset={} — seeking past poison record: {}",
          topicPartition.topic(),
          topicPartition.partition(),
          e.offset(),
          e.getMessage());
      consumer.seek(topicPartition, e.offset() + 1);
      return null;
    }
  }

  private void seekToBeginningAfterAssignment(
      KafkaConsumer<UUID, InstanceUpdateDTO> consumer, String topicName) {
    int attempts = 0;
    while (consumer.assignment().isEmpty() && replayRunning.get() && attempts < 50) {
      consumer.poll(Duration.ofMillis(100));
      attempts++;
    }

    if (consumer.assignment().isEmpty()) {
      log.warn(
          "Replay consumer did not receive partition assignment for topic={} before timeout",
          topicName);
      return;
    }

    consumer.seekToBeginning(consumer.assignment());
    log.info(
        "Replay consumer assigned {} partition(s) and positioned at beginning",
        consumer.assignment().size());
  }

  @PreDestroy
  void stop() {
    replayRunning.set(false);
    KafkaConsumer<UUID, InstanceUpdateDTO> consumer = replayConsumer;
    if (consumer != null) {
      consumer.wakeup();
    }
    replayExecutor.shutdownNow();
    try {
      if (!replayExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
        log.warn("Replay consumer executor did not terminate cleanly within timeout");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
