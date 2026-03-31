/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.taktx.client.TaktXClient;
import io.taktx.dto.FlowElementDTO;
import io.taktx.dto.ProcessDefinitionDTO;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.SubProcessDTO;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@ApplicationScoped
public class ProcessDefinitionCache {

  @Inject TaktXClient taktClient;

  // Cache: ProcessDefinitionKey -> (elementId -> FlowElementDTO)
  private final Map<ProcessDefinitionKey, Map<String, FlowElementDTO>> elementCache =
      new ConcurrentHashMap<>();

  /**
   * Get element information for a given process definition and element ID.
   *
   * @param key the process definition key
   * @param elementId the element ID
   * @return FlowElementDTO or null if not found
   */
  public FlowElementDTO getElement(ProcessDefinitionKey key, String elementId) {
    Map<String, FlowElementDTO> elements = elementCache.get(key);
    if (elements == null) {
      // Load the process definition
      elements = loadProcessDefinition(key);
      elementCache.put(key, elements);
    }
    return elements.get(elementId);
  }

  /**
   * Get element name for a given process definition and element ID. Returns the element ID if name
   * is not available.
   *
   * @param key the process definition key
   * @param elementId the element ID
   * @return element name or element ID as fallback
   */
  public String getElementName(ProcessDefinitionKey key, String elementId) {
    FlowElementDTO element = getElement(key, elementId);
    if (element != null) {
      String name = element.getName();
      // Return name if not null/empty, otherwise fall back to elementId
      if (name != null && !name.trim().isEmpty()) {
        return name;
      }
    } else {
      log.info("Element not found for ID '{}' in definition {}", elementId, key);
    }
    return elementId;
  }

  /**
   * Get element type for a given process definition and element ID.
   *
   * @param key the process definition key
   * @param elementId the element ID
   * @return element type or null if not found
   */
  public String getElementType(ProcessDefinitionKey key, String elementId) {
    FlowElementDTO element = getElement(key, elementId);
    return element != null ? element.getClass().getSimpleName() : null;
  }

  /**
   * Load process definition elements from the TaktX client. Recursively extracts elements from
   * subprocesses.
   *
   * @param key the process definition key
   * @return map of element ID to FlowElementDTO, or empty map if not found
   */
  private Map<String, FlowElementDTO> loadProcessDefinition(ProcessDefinitionKey key) {
    try {
      Map<ProcessDefinitionKey, ProcessDefinitionDTO> definitions =
          taktClient.getProcessDefinitionConsumer().getDeployedProcessDefinitions();
      ProcessDefinitionDTO dto = definitions.get(key);

      if (dto != null
          && dto.getDefinitions() != null
          && dto.getDefinitions().getRootProcess() != null
          && dto.getDefinitions().getRootProcess().getFlowElements() != null) {
        Map<String, FlowElementDTO> rootElements =
            dto.getDefinitions().getRootProcess().getFlowElements().getElements();

        if (rootElements == null) {
          log.warn("No elements found for process definition {}", key);
          return Map.of();
        }

        // Create a new map to hold all elements including subprocess elements
        Map<String, FlowElementDTO> allElements = new ConcurrentHashMap<>(rootElements);

        // Recursively extract elements from subprocesses
        extractSubprocessElements(rootElements, allElements);

        log.debug(
            "Loaded {} elements (including subprocess elements) for process definition {}",
            allElements.size(),
            key);
        return allElements;
      }
      log.warn("No elements found for process definition {}", key);
      return Map.of();
    } catch (Exception e) {
      log.error("Error loading process definition {}", key, e);
      return Map.of();
    }
  }

  /**
   * Recursively extract elements from subprocesses and add them to the allElements map.
   *
   * @param elements the current level elements to scan for subprocesses
   * @param allElements the map to add all found elements to
   */
  private void extractSubprocessElements(
      Map<String, FlowElementDTO> elements, Map<String, FlowElementDTO> allElements) {
    if (elements == null) {
      return;
    }

    for (FlowElementDTO element : elements.values()) {
      if (element instanceof SubProcessDTO subProcess) {
        Map<String, FlowElementDTO> nestedElements = subProcess.getElements().getElements();

        if (nestedElements != null && !nestedElements.isEmpty()) {
          log.debug(
              "Found {} nested elements in subprocess {}", nestedElements.size(), element.getId());

          // Add nested elements to the main map
          allElements.putAll(nestedElements);

          // Recursively check for deeper nested subprocesses
          extractSubprocessElements(nestedElements, allElements);
        }
      }
    }
  }

  /** Clear the cache. Useful for testing or memory management. */
  public void clearCache() {
    elementCache.clear();
  }
}
