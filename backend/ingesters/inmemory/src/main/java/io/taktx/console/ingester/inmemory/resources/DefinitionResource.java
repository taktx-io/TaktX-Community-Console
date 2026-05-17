/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import com.fasterxml.jackson.databind.JsonNode;
import io.taktx.client.TaktXClient;
import io.taktx.dto.ProcessDefinitionDTO;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.VariablesDTO;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@Path("/processdefinitions")
@Slf4j
public class DefinitionResource {

  @Inject TaktXClient taktClient;

  @ConfigProperty(name = "taktx.engine.namespace")
  String namespace;

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public Response getAllProcessDefinitionIds() {
    try {
      Map<ProcessDefinitionKey, ProcessDefinitionDTO> definitions =
          taktClient.getProcessDefinitionConsumer().getDeployedProcessDefinitions();

      // Group definitions by process definition ID and order by process definition ID and version
      List<String> sortedDefinitions =
          definitions.keySet().stream()
              .map(ProcessDefinitionKey::getProcessDefinitionId)
              .distinct()
              .sorted()
              .toList();

      return Response.ok(sortedDefinitions).build();
    } catch (Exception e) {
      log.error("Error retrieving process definition ids", e);
      return Response.serverError().entity("Error retrieving process definition ids").build();
    }
  }

  @GET
  @Path("/{id}/versions")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getVersionsForDefinition(
      @PathParam("id")
          @Pattern(
              regexp = "^[a-zA-Z0-9_-]+$",
              message =
                  "Process definition ID can only contain alphanumeric characters, hyphens, and underscores")
          @Size(max = 128, message = "Process definition ID cannot exceed 128 characters")
          String processDefinitionId) {
    try {
      Map<ProcessDefinitionKey, ProcessDefinitionDTO> definitions =
          taktClient
              .getProcessDefinitionConsumer()
              .getDeployedProcessDefinitions(processDefinitionId);

      record VersionInfo(int version, String versionTag) {}

      List<VersionInfo> sortedVersions =
          definitions.entrySet().stream()
              .map(
                  entry -> {
                    ProcessDefinitionKey key = entry.getKey();
                    ProcessDefinitionDTO dto = entry.getValue();
                    String versionTag =
                        dto.getDefinitions() != null
                                && dto.getDefinitions().getRootProcess() != null
                            ? dto.getDefinitions().getRootProcess().getVersionTag()
                            : null;
                    return new VersionInfo(key.getVersion(), versionTag);
                  })
              .sorted(Comparator.comparingInt(a -> a.version))
              .toList()
              .reversed();
      return Response.ok(sortedVersions).build();
    } catch (Exception e) {
      log.error("Error retrieving process definition versions for {}", processDefinitionId, e);
      return Response.serverError()
          .entity("Error retrieving process definition versions for id")
          .build();
    }
  }

  @GET
  @Path("/{id}/version/{version}/xml")
  @Produces(MediaType.APPLICATION_XML)
  public Response getProcessDefinitionXml(
      @PathParam("id")
          @Pattern(
              regexp = "^[a-zA-Z0-9_-]+$",
              message =
                  "Process definition ID can only contain alphanumeric characters, hyphens, and underscores")
          @Size(max = 128, message = "Process definition ID cannot exceed 128 characters")
          String processDefinitionId,
      @PathParam("version")
          @Min(value = 1, message = "Version must be at least 1")
          @Max(value = 99999, message = "Version cannot exceed 99999")
          int version) {
    try {
      ProcessDefinitionKey key = new ProcessDefinitionKey(processDefinitionId, version);
      String bpmnXml = taktClient.getProcessDefinitionXml(key);
      if (bpmnXml == null || bpmnXml.isEmpty()) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity(
                "BPMN XML not available for process definition: "
                    + processDefinitionId
                    + " version "
                    + version)
            .build();
      }

      return Response.ok(bpmnXml).build();
    } catch (Exception e) {
      log.error(
          "Error retrieving BPMN XML for process definition: {} version {}",
          processDefinitionId,
          version,
          e);
      return Response.serverError().entity("Error retrieving BPMN XML: " + e.getMessage()).build();
    }
  }

  @POST
  @Path("/{id}/version/{version}/start")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response startProcessInstanceVersion(
      @PathParam("id")
          @Pattern(
              regexp = "^[a-zA-Z0-9_-]+$",
              message =
                  "Process definition ID can only contain alphanumeric characters, hyphens, and underscores")
          @Size(max = 128, message = "Process definition ID cannot exceed 128 characters")
          String processDefinitionId,
      @PathParam("version")
          @Min(value = -1, message = "Version must be at least -1 (use -1 for latest)")
          @Max(value = 99999, message = "Version cannot exceed 99999")
          int version,
      @Valid List<StartRequest> startRequests) {
    try {
      if (startRequests == null || startRequests.isEmpty()) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Request payload is required (array of StartRequest objects)")
            .build();
      }

      if (startRequests.size() > 50) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Cannot start more than 50 instances at once")
            .build();
      }

      // Start each instance using its own unique token so the engine's NonceStore
      // sees a distinct auditId per Kafka message.
      List<String> instanceIds = new ArrayList<>();
      for (StartRequest req : startRequests) {
        try {
          VariablesDTO variablesDTO = VariablesDTO.ofJsonMap(req.getVariables());
          UUID instanceId =
              taktClient.startProcess(
                  processDefinitionId,
                  version,
                  variablesDTO,
                  req.getBusinessKey(),
                  req.getTags() != null ? req.getTags() : Set.of(),
                  null);
          instanceIds.add(instanceId.toString());
        } catch (Exception e) {
          log.warn(
              "Failed to start process instance for definition {}: {}",
              processDefinitionId,
              e.getMessage());
          // Continue with remaining instances
        }
      }

      if (instanceIds.isEmpty()) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Failed to start any process instances")
            .build();
      }

      log.info(
          "Started {} process instance(s) for definition {}",
          instanceIds.size(),
          processDefinitionId);
      return Response.status(Response.Status.ACCEPTED).entity(instanceIds).build();
    } catch (Exception e) {
      log.error("Error starting process instances for definition {}", processDefinitionId, e);
      return Response.status(Response.Status.BAD_REQUEST)
          .entity("Error starting process instances: " + e.getMessage())
          .build();
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Per-instance start request: pairs a unique Platform Service authorization token (containing a
   * distinct auditId) with the initial variables for that instance.
   */
  @Data
  public static class StartRequest {
    private Map<String, JsonNode> variables;

    @Size(max = 512, message = "Business key cannot exceed 512 characters")
    private String businessKey;

    @Size(max = 20, message = "Cannot provide more than 20 tags")
    private Set<@Size(max = 64, message = "Tag cannot exceed 64 characters") String> tags;
  }
}
