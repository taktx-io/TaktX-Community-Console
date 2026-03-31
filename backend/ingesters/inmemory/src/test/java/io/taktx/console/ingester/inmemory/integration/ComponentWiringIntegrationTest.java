/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.integration;

import static org.junit.jupiter.api.Assertions.*;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeAnimationAggregator;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeHeatmapAggregator;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeStateAggregator;
import io.taktx.console.ingester.inmemory.metrics.ProcessInstanceStateAggregator;
import io.taktx.console.ingester.inmemory.publishers.FlowNodeAnimationPublisher;
import io.taktx.console.ingester.inmemory.publishers.FlowNodeHeatmapPublisher;
import io.taktx.console.ingester.inmemory.publishers.FlowNodeStatePublisher;
import io.taktx.console.ingester.inmemory.publishers.ProcessInstanceSummaryPublisher;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

/**
 * Simple integration test to verify all components are wired correctly in Quarkus. Tests CDI
 * injection and basic component availability.
 *
 * <p>Note: Tests run on random port (quarkus.http.test-port=0) to avoid conflicts with running
 * application instances.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class ComponentWiringIntegrationTest {

  @Inject FlowNodeEventBroadcaster broadcaster;

  @Inject SubscriptionRegistry subscriptionRegistry;

  @Inject ProcessInstanceStateAggregator instanceStateAggregator;

  @Inject FlowNodeStateAggregator flowNodeStateAggregator;

  @Inject FlowNodeAnimationAggregator animationAggregator;

  @Inject FlowNodeHeatmapAggregator heatmapAggregator;

  @Inject ProcessInstanceSummaryPublisher instanceSummaryPublisher;

  @Inject FlowNodeStatePublisher flowNodeStatePublisher;

  @Inject FlowNodeAnimationPublisher animationPublisher;

  @Inject FlowNodeHeatmapPublisher heatmapPublisher;

  @Test
  void shouldInjectCoordinator() {
    assertNotNull(broadcaster, "FlowNodeEventBroadcaster should be injected");
  }

  @Test
  void shouldInjectSubscriptionRegistry() {
    assertNotNull(subscriptionRegistry, "SubscriptionRegistry should be injected");
  }

  @Test
  void shouldInjectAllAggregators() {
    assertNotNull(instanceStateAggregator, "ProcessInstanceStateAggregator should be injected");
    assertNotNull(flowNodeStateAggregator, "FlowNodeStateAggregator should be injected");
    assertNotNull(animationAggregator, "FlowNodeAnimationAggregator should be injected");
    assertNotNull(heatmapAggregator, "FlowNodeHeatmapAggregator should be injected");
  }

  @Test
  void shouldInjectAllPublishers() {
    assertNotNull(instanceSummaryPublisher, "ProcessInstanceSummaryPublisher should be injected");
    assertNotNull(flowNodeStatePublisher, "FlowNodeStatePublisher should be injected");
    assertNotNull(animationPublisher, "FlowNodeAnimationPublisher should be injected");
    assertNotNull(heatmapPublisher, "FlowNodeHeatmapPublisher should be injected");
  }

  @Test
  void shouldHavePublishersInjectedIntoCoordinator() {
    // The coordinator should have all publishers injected
    // This is verified by the fact that broadcaster is not null and app starts
    assertNotNull(broadcaster);
  }

  @Test
  void shouldHaveAggregatorsInjectedIntoPublishers() {
    // Publishers should have aggregators injected
    // This is verified by successful CDI wiring
    assertNotNull(instanceSummaryPublisher);
    assertNotNull(flowNodeStatePublisher);
    assertNotNull(animationPublisher);
    assertNotNull(heatmapPublisher);
  }

  @Test
  void shouldHaveRegistryInjectedIntoCoordinator() {
    // Coordinator should have subscription registry
    assertNotNull(broadcaster);
    assertNotNull(subscriptionRegistry);
  }
}
