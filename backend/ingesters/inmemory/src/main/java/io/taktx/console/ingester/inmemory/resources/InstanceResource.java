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
import io.taktx.console.ingester.inmemory.InstanceUpdateRegistry;
import io.taktx.console.ingester.inmemory.OrderDirection;
import io.taktx.console.ingester.inmemory.ProcessInstanceView;
import io.taktx.dto.ExecutionState;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

@Path("/processinstances")
@Slf4j
public class InstanceResource {

  private static final String INVALID_PROCESS_INSTANCE_ID_FORMAT =
      "Invalid process instance ID format";

  @Inject InstanceUpdateRegistry instanceUpdateRegistry;

  @Inject TaktXClient taktClient;

  /**
   * Generic endpoint for querying process instances with flexible filtering. Supports current and
   * future filter types via query parameters.
   *
   * <p>Query Parameters: - processDefinitionId: Filter by process definition ID (optional) -
   * version: Filter by version (optional) - states: Filter by state(s), can be repeated for
   * multiple states (optional) - businessKey: Filter by business key (optional, future) -
   * hasIncident: Filter by incident presence (optional, future) - start: Pagination offset
   * (default: 0) - limit: Page size (default: 50) - orderBy: Sort field (default:
   * PROCESS_INSTAMCE_START) - orderDirection: Sort direction ASC/DESC (default: DESC)
   *
   * <p>Examples: - GET /processinstances (all instances) - GET
   * /processinstances?processDefinitionId=MyProcess (all versions) - GET
   * /processinstances?processDefinitionId=MyProcess&version=5 (specific) - GET
   * /processinstances?states=ACTIVE&states=COMPLETED (filter by states) - GET
   * /processinstances?processDefinitionId=MyProcess&states=ACTIVE (combined)
   */
  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public Response queryProcessInstances(
      @QueryParam("processDefinitionId")
          @Pattern(
              regexp = "^[a-zA-Z0-9_-]+$",
              message =
                  "Process definition ID can only contain alphanumeric characters, hyphens, and underscores")
          @Size(max = 128, message = "Process definition ID cannot exceed 128 characters")
          String processDefinitionId,
      @QueryParam("version")
          @Min(value = 1, message = "Version must be at least 1")
          @Max(value = 99999, message = "Version cannot exceed 99999")
          Integer version,
      @QueryParam("states") @Size(max = 10, message = "Cannot filter by more than 10 states")
          List<ExecutionStateQueryParam> states,
      @QueryParam("businessKey")
          @Size(max = 256, message = "Business key cannot exceed 256 characters")
          String businessKey,
      @QueryParam("hasIncident") Boolean hasIncident,
      @QueryParam("processInstanceIds")
          @Size(max = 1000, message = "Cannot filter by more than 10000 instance IDs")
          List<String> processInstanceIds,
      @QueryParam("startTimeFrom")
          @Size(max = 64, message = "Start time from cannot exceed 64 characters")
          String startTimeFrom,
      @QueryParam("startTimeTo")
          @Size(max = 64, message = "Start time to cannot exceed 64 characters")
          String startTimeTo,
      @QueryParam("endTimeFrom")
          @Size(max = 64, message = "End time from cannot exceed 64 characters")
          String endTimeFrom,
      @QueryParam("endTimeTo") @Size(max = 64, message = "End time to cannot exceed 64 characters")
          String endTimeTo,
      @QueryParam("start")
          @Min(value = 0, message = "Start index must be non-negative")
          @Max(value = 1000000, message = "Start index too large")
          Integer start,
      @QueryParam("limit")
          @Min(value = 1, message = "Limit must be at least 1")
          @Max(value = 1000, message = "Limit cannot exceed 1000")
          Integer limit,
      @Valid @QueryParam("orderBy") OrderByType orderBy,
      @Valid @QueryParam("orderDirection") OrderDirection orderDirection) {

    try {
      // Build filter criteria from query parameters
      ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
      criteria.setProcessDefinitionId(processDefinitionId);
      criteria.setVersion(version);
      criteria.setBusinessKey(businessKey);
      criteria.setHasIncident(hasIncident);

      // Set states if provided (JAX-RS automatically handles multiple query params)
      // ExecutionState enum provides type safety - invalid values are rejected automatically
      if (states != null && !states.isEmpty()) {
        criteria.setStates(states);
      }

      // Parse and set process instance IDs if provided
      if (processInstanceIds != null && !processInstanceIds.isEmpty()) {
        List<UUID> uuidList = new ArrayList<>();
        for (String idStr : processInstanceIds) {
          try {
            uuidList.add(UUID.fromString(idStr));
          } catch (IllegalArgumentException e) {
            log.warn("Invalid UUID format in processInstanceIds: {}", idStr);
            return Response.status(Response.Status.BAD_REQUEST)
                .entity("Invalid UUID format in processInstanceIds: " + idStr)
                .build();
          }
        }
        criteria.setProcessInstanceIds(uuidList);
      }

      // Parse and set start time range filters if provided
      if (startTimeFrom != null && !startTimeFrom.isBlank()) {
        try {
          criteria.setStartTimeFrom(java.time.Instant.parse(startTimeFrom));
        } catch (Exception e) {
          log.warn("Invalid ISO-8601 format for startTimeFrom: {}", startTimeFrom);
          return Response.status(Response.Status.BAD_REQUEST)
              .entity("Invalid ISO-8601 date format for startTimeFrom: " + startTimeFrom)
              .build();
        }
      }

      if (startTimeTo != null && !startTimeTo.isBlank()) {
        try {
          criteria.setStartTimeTo(java.time.Instant.parse(startTimeTo));
        } catch (Exception e) {
          log.warn("Invalid ISO-8601 format for startTimeTo: {}", startTimeTo);
          return Response.status(Response.Status.BAD_REQUEST)
              .entity("Invalid ISO-8601 date format for startTimeTo: " + startTimeTo)
              .build();
        }
      }

      // Parse and set end time range filters if provided
      if (endTimeFrom != null && !endTimeFrom.isBlank()) {
        try {
          criteria.setEndTimeFrom(java.time.Instant.parse(endTimeFrom));
        } catch (Exception e) {
          log.warn("Invalid ISO-8601 format for endTimeFrom: {}", endTimeFrom);
          return Response.status(Response.Status.BAD_REQUEST)
              .entity("Invalid ISO-8601 date format for endTimeFrom: " + endTimeFrom)
              .build();
        }
      }

      if (endTimeTo != null && !endTimeTo.isBlank()) {
        try {
          criteria.setEndTimeTo(java.time.Instant.parse(endTimeTo));
        } catch (Exception e) {
          log.warn("Invalid ISO-8601 format for endTimeTo: {}", endTimeTo);
          return Response.status(Response.Status.BAD_REQUEST)
              .entity("Invalid ISO-8601 date format for endTimeTo: " + endTimeTo)
              .build();
        }
      }

      // Set defaults for pagination and sorting
      int startIdx = start != null ? start : 0;
      int limitVal = limit != null ? limit : 50;
      OrderByType orderByType = orderBy != null ? orderBy : OrderByType.PROCESS_INSTAMCE_START;
      OrderDirection orderDir = orderDirection != null ? orderDirection : OrderDirection.DESC;

      // Execute generic query
      var page =
          instanceUpdateRegistry.queryProcessInstances(
              criteria, startIdx, limitVal, orderByType, orderDir);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(page)).build();

    } catch (Exception e) {
      log.error("Error querying process instances", e);
      return Response.serverError().entity("Error querying process instances").build();
    }
  }

  @GET
  @Path("/{processInstanceId}")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessInstanceById(
      @PathParam("processInstanceId")
          @Pattern(
              regexp =
                  "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$",
              message = "Process instance ID must be a valid UUID")
          @Size(max = 36, message = "Process instance ID is too long")
          String processInstanceIdStr) {
    try {
      // Additional sanitization: ensure no whitespace or special characters
      if (processInstanceIdStr == null || processInstanceIdStr.isBlank()) {
        log.warn("Process instance ID is empty");
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Process instance ID cannot be empty")
            .build();
      }

      String sanitized = processInstanceIdStr.trim();
      if (!sanitized.equals(processInstanceIdStr)) {
        log.warn("Process instance ID contains whitespace: {}", processInstanceIdStr);
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Process instance ID cannot contain whitespace")
            .build();
      }

      UUID processInstanceId = UUID.fromString(sanitized);
      ProcessInstanceView instance =
          instanceUpdateRegistry.getProcessInstanceById(processInstanceId);

      if (instance == null) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity("Process instance not found")
            .build();
      }

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(instance)).build();
    } catch (IllegalArgumentException e) {
      return Response.status(Response.Status.BAD_REQUEST)
          .entity(INVALID_PROCESS_INSTANCE_ID_FORMAT)
          .build();
    } catch (Exception e) {
      log.error("Error retrieving process instance", e);
      return Response.serverError().entity("Error retrieving process instance").build();
    }
  }

  @GET
  @Path("/{processInstanceId}/flownodes")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getFlowNodeInstances(
      @PathParam("processInstanceId")
          @Pattern(
              regexp =
                  "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$",
              message = "Process instance ID must be a valid UUID")
          @Size(max = 36, message = "Process instance ID is too long")
          String processInstanceIdStr) {
    try {
      UUID processInstanceId = UUID.fromString(processInstanceIdStr.trim());

      // Return all flow node instances (deduplicated by path, showing latest state only)
      List<TimedFlowNodeInstance> flowNodes =
          instanceUpdateRegistry.getFlowNodeInstancesByProcessInstance(processInstanceId);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(flowNodes)).build();
    } catch (IllegalArgumentException e) {
      return Response.status(Response.Status.BAD_REQUEST)
          .entity(INVALID_PROCESS_INSTANCE_ID_FORMAT)
          .build();
    } catch (Exception e) {
      log.error("Error retrieving flow node instances", e);
      return Response.serverError().entity("Error retrieving flow node instances").build();
    }
  }

  @GET
  @Path("/{processInstanceId}/variables")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessVariables(
      @PathParam("processInstanceId")
          @Pattern(
              regexp =
                  "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$",
              message = "Process instance ID must be a valid UUID")
          @Size(max = 36, message = "Process instance ID is too long")
          String processInstanceIdStr) {
    try {
      UUID processInstanceId = UUID.fromString(processInstanceIdStr.trim());

      Map<String, JsonNode> variables =
          instanceUpdateRegistry.getProcessVariables(processInstanceId);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(variables)).build();
    } catch (IllegalArgumentException e) {
      return Response.status(Response.Status.BAD_REQUEST)
          .entity(INVALID_PROCESS_INSTANCE_ID_FORMAT)
          .build();
    } catch (Exception e) {
      log.error("Error retrieving process variables", e);
      return Response.serverError().entity("Error retrieving process variables").build();
    }
  }

  /**
   * Cancel (abort) a single process instance by ID. Called by Platform Service BFF
   */
  @POST
  @Path("/{id}/cancel")
  @Produces(MediaType.APPLICATION_JSON)
  public Response cancelProcessInstance(
      @PathParam("id") String instanceIdStr) {
    try {
      // Validate UUID format
      UUID instanceId;
      try {
        instanceId = UUID.fromString(instanceIdStr.trim());
      } catch (IllegalArgumentException e) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity(Map.of("error", "Invalid instance ID format"))
            .build();
      }

      // Check if instance exists and is ACTIVE
      ProcessInstanceView instance = instanceUpdateRegistry.getProcessInstanceById(instanceId);

      if (instance == null) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity(Map.of("error", "Instance not found"))
            .build();
      }

      if (instance.getState() != ExecutionState.ACTIVE) {
        log.debug(
            "Skipping cancel for instance {} — already in state {}",
            instanceIdStr,
            instance.getState());
        return Response.ok(
                Map.of(
                    "instanceId",
                    instanceIdStr,
                    "status",
                    "skipped",
                    "currentState",
                    instance.getState().name(),
                    "message",
                    "Instance is not ACTIVE, cancel skipped"))
            .build();
      }

      // Null element path = terminate the root process instance.
      taktClient.abortElementInstance(instanceId, null);

      log.info("Cancelled instance {}", instanceIdStr);

      return Response.ok(
              Map.of(
                  "instanceId", instanceIdStr,
                  "status", "cancel_sent",
                  "message", "Cancel command sent successfully"))
          .build();

    } catch (Exception e) {
      log.error("Error cancelling instance {}", instanceIdStr, e);
      return Response.serverError()
          .entity(Map.of("error", "Error cancelling instance", "message", e.getMessage()))
          .build();
    }
  }

  /**
   * Cancel (abort) multiple process instances. Only ACTIVE instances will be cancelled; others will
   * be rejected. Returns immediate response with success/failure counts.
   */
  @POST
  @Path("/cancel")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response cancelProcessInstances(
      @Valid CancelInstancesRequest request) {
    try {
      if (request.processInstanceIds() == null || request.processInstanceIds().isEmpty()) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Process instance IDs are required")
            .build();
      }

      if (request.processInstanceIds().size() > 100) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Cannot cancel more than 100 instances at once")
            .build();
      }

      List<String> succeededIds = new ArrayList<>();
      List<CancelFailure> failures = new ArrayList<>();

      for (String instanceIdStr : request.processInstanceIds()) {
        try {
          // Validate UUID format
          if (instanceIdStr == null || instanceIdStr.isBlank()) {
            failures.add(new CancelFailure(instanceIdStr, "Empty instance ID"));
            continue;
          }

          UUID instanceId = UUID.fromString(instanceIdStr.trim());

          // Check if instance exists and is ACTIVE
          ProcessInstanceView instance = instanceUpdateRegistry.getProcessInstanceById(instanceId);

          if (instance == null) {
            failures.add(new CancelFailure(instanceIdStr, "Instance not found"));
            continue;
          }

          if (instance.getState() != ExecutionState.ACTIVE) {
            failures.add(
                new CancelFailure(
                    instanceIdStr,
                    "Instance not ACTIVE (current state: " + instance.getState().name() + ")"));
            continue;
          }

          // Send cancel command .
          taktClient.abortElementInstance(instanceId, null);
          succeededIds.add(instanceIdStr);
          log.debug("Sent cancel command for instance: {}", instanceIdStr);

        } catch (IllegalArgumentException e) {
          failures.add(new CancelFailure(instanceIdStr, "Invalid UUID format"));
        } catch (Exception e) {
          log.warn("Failed to cancel instance {}: {}", instanceIdStr, e.getMessage());
          failures.add(new CancelFailure(instanceIdStr, e.getMessage()));
        }
      }

      CancelInstancesResponse response =
          new CancelInstancesResponse(succeededIds.size(), failures.size(), succeededIds, failures);

      log.info(
          "Cancel request processed: {} succeeded, {} failed",
          succeededIds.size(),
          failures.size());

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(response)).build();

    } catch (Exception e) {
      log.error("Error processing cancel request", e);
      return Response.serverError()
          .entity("Error processing cancel request: " + e.getMessage())
          .build();
    }
  }

  /**
   * Verify current states of process instances. Used for polling after cancel commands to check if
   * instances actually transitioned.
   */
  @POST
  @Path("/verify")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response verifyInstanceStates(@Valid VerifyInstancesRequest request) {
    try {
      if (request.instanceIds() == null || request.instanceIds().isEmpty()) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Instance IDs are required")
            .build();
      }

      if (request.instanceIds().size() > 100) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Cannot verify more than 100 instances at once")
            .build();
      }

      List<InstanceStateInfo> states = new ArrayList<>();

      for (String instanceIdStr : request.instanceIds()) {
        try {
          UUID instanceId = UUID.fromString(instanceIdStr.trim());
          ProcessInstanceView instance = instanceUpdateRegistry.getProcessInstanceById(instanceId);

          String state = instance != null ? instance.getState().toString() : "NOT_FOUND";

          states.add(new InstanceStateInfo(instanceIdStr, state, System.currentTimeMillis()));

        } catch (IllegalArgumentException e) {
          states.add(
              new InstanceStateInfo(instanceIdStr, "INVALID_ID", System.currentTimeMillis()));
        } catch (Exception e) {
          log.warn("Error verifying instance {}: {}", instanceIdStr, e.getMessage());
          states.add(new InstanceStateInfo(instanceIdStr, "ERROR", System.currentTimeMillis()));
        }
      }

      VerifyInstancesResponse response = new VerifyInstancesResponse(states);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(response)).build();

    } catch (Exception e) {
      log.error("Error verifying instance states", e);
      return Response.serverError()
          .entity("Error verifying instance states: " + e.getMessage())
          .build();
    }
  }

  // ============================================================================
  // DTOs (Data Transfer Objects)
  // ============================================================================

  public record CancelInstancesRequest(
      @NotNull @Size(min = 1, max = 100, message = "Must provide between 1 and 100 instance IDs")
          List<String> processInstanceIds) {}

  public record CancelInstancesResponse(
      int succeededCount,
      int failedCount,
      List<String> succeededIds,
      List<CancelFailure> failures) {}

  public record CancelFailure(String instanceId, String reason) {}

  public record VerifyInstancesRequest(
      @NotNull @Size(min = 1, max = 100, message = "Must provide between 1 and 100 instance IDs")
          List<String> instanceIds) {}

  public record VerifyInstancesResponse(List<InstanceStateInfo> states) {}

  public record InstanceStateInfo(String instanceId, String state, long timestamp) {}

  /**
   * Cancel process instances by filter criteria (efficient for large batches). Unlike the ID-based
   * cancel endpoint, this accepts filter criteria and cancels all matching instances. Designed for
   * bulk operations (100+ instances).
   */
  @POST
  @Path("/cancel-by-filter")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response cancelProcessInstancesByFilter(@Valid CancelByFilterRequest request) {
    try {
      if (request.filter() == null) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Filter criteria is required")
            .build();
      }

      // Build filter criteria from request
      ProcessInstanceFilterCriteria criteria = request.filter();

      // Query instances matching filter (streaming for efficiency)
      List<ProcessInstanceView> matchingInstances =
          instanceUpdateRegistry
              .queryProcessInstances(
                  criteria,
                  0, // start
                  Integer.MAX_VALUE, // no limit - process all
                  OrderByType.PROCESS_INSTAMCE_START,
                  OrderDirection.DESC)
              .getItems();

      // Track results
      int processedCount = 0;
      int succeededCount = 0;
      int failedCount = 0;
      int skippedCount = 0;
      List<CancelByFilterFailure> failures = new ArrayList<>();
      List<String> succeededSample = new ArrayList<>();

      log.info(
          "Starting filter-based cancel for jobId={}, estimated instances={}",
          request.jobId(),
          matchingInstances.size());

      // Process instances in batches
      for (ProcessInstanceView instance : matchingInstances) {
        processedCount++;

        try {
          UUID instanceId = instance.getProcessInstanceId();
          ExecutionState currentState = instance.getState();

          // Skip non-ACTIVE instances
          if (currentState != ExecutionState.ACTIVE) {
            skippedCount++;
            log.debug(
                "Skipped instance {} (state: {}) for jobId={}",
                instanceId,
                currentState,
                request.jobId());
            continue;
          }

          // Send cancel command — forward the signed authorization token so the engine
          // can validate it end-to-end (zero-trust command path).
          // Null element path = terminate the root process instance.
          taktClient.abortElementInstance(instanceId, null);
          succeededCount++;

          // Add to sample (first 10 only)
          if (succeededSample.size() < 10) {
            succeededSample.add(instanceId.toString());
          }

          log.debug("Cancelled instance {} for jobId={}", instanceId, request.jobId());

        } catch (Exception e) {
          failedCount++;
          failures.add(
              new CancelByFilterFailure(
                  instance.getProcessInstanceId().toString(),
                  e.getMessage(),
                  System.currentTimeMillis()));
          log.warn(
              "Failed to cancel instance {} for jobId={}: {}",
              instance.getProcessInstanceId(),
              request.jobId(),
              e.getMessage());
        }

        // Log progress every 100 instances
        if (processedCount % 100 == 0) {
          log.info(
              "Filter-based cancel progress for jobId={}: processed={}, succeeded={}, failed={}, skipped={}",
              request.jobId(),
              processedCount,
              succeededCount,
              failedCount,
              skippedCount);
        }
      }

      CancelByFilterResponse response =
          new CancelByFilterResponse(
              request.jobId(),
              processedCount,
              succeededCount,
              failedCount,
              skippedCount,
              failures,
              succeededSample);

      log.info(
          "Filter-based cancel completed for jobId={}: processed={}, succeeded={}, failed={}, skipped={}",
          request.jobId(),
          processedCount,
          succeededCount,
          failedCount,
          skippedCount);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(response)).build();

    } catch (Exception e) {
      log.error("Error processing filter-based cancel request", e);
      return Response.serverError()
          .entity("Error processing cancel request: " + e.getMessage())
          .build();
    }
  }

  /**
   * Count process instances matching filter criteria. Used to estimate batch size before performing
   * bulk operations.
   */
  @POST
  @Path("/count-by-filter")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response countProcessInstancesByFilter(@Valid CountByFilterRequest request) {
    try {
      if (request.filter() == null) {
        return Response.status(Response.Status.BAD_REQUEST)
            .entity("Filter criteria is required")
            .build();
      }

      // Query with limit 0 to get just the count
      List<ProcessInstanceView> matchingInstances =
          instanceUpdateRegistry
              .queryProcessInstances(
                  request.filter(),
                  0,
                  Integer.MAX_VALUE,
                  OrderByType.PROCESS_INSTAMCE_START,
                  OrderDirection.DESC)
              .getItems();

      int totalCount = matchingInstances.size();

      // Count by state
      long activeCount =
          matchingInstances.stream().filter(i -> i.getState() == ExecutionState.ACTIVE).count();
      long completedCount =
          matchingInstances.stream().filter(i -> i.getState() == ExecutionState.COMPLETED).count();
      long abortedCount =
          matchingInstances.stream().filter(i -> i.getState() == ExecutionState.ABORTED).count();

      CountByFilterResponse response =
          new CountByFilterResponse(totalCount, activeCount, completedCount, abortedCount);

      return Response.ok(JsonUtils.toJsonStringWithFieldNames(response)).build();

    } catch (Exception e) {
      log.error("Error counting instances by filter", e);
      return Response.serverError().entity("Error counting instances: " + e.getMessage()).build();
    }
  }

  // New DTOs for filter-based operations

  public record CancelByFilterRequest(
      @NotNull(message = "Job ID is required") String jobId,
      @NotNull(message = "Filter criteria is required") ProcessInstanceFilterCriteria filter) {}

  public record CancelByFilterResponse(
      String jobId,
      int processedCount,
      int succeededCount,
      int failedCount,
      int skippedCount,
      List<CancelByFilterFailure> failures,
      List<String> succeededSample) {}

  public record CancelByFilterFailure(String instanceId, String reason, long timestamp) {}

  public record CountByFilterRequest(
      @NotNull(message = "Filter criteria is required") ProcessInstanceFilterCriteria filter) {}

  public record CountByFilterResponse(
      int totalCount, long activeCount, long completedCount, long abortedCount) {}
}
