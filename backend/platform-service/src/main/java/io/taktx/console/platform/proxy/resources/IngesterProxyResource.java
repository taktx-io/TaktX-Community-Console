/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.platform.proxy.resources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.security.Authenticated;
import io.taktx.console.platform.proxy.client.IngesterClient;
import io.taktx.console.platform.proxy.client.IngesterClient.ProcessInstanceInfo;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.rest.client.RestClientBuilder;

/**
 * BFF Proxy Resource for Runway (Process Definition & Instance) APIs.
 *
 * <p>This resource acts as an API gateway, proxying requests from the frontend to the appropriate
 * ingester service. It handles:
 *
 * <ul>
 *   <li>Authentication (JWT validation via Quarkus OIDC)
 *   <li>Authorization (permission checking for write operations)
 *   <li>Token Generation (signed authorization tokens for commands)
 *   <li>Request Routing (namespace ID → ingester URL resolution)
 *   <li>Request Proxying (forwards to ingester with auth token)
 * </ul>
 *
 * <p>All endpoints require authentication. Write operations (POST) require additional permission
 * checks.
 */
@Path("/api/runway")
@Authenticated
@Slf4j
public class IngesterProxyResource {

  @Inject ObjectMapper objectMapper;

  @ConfigProperty(name = "taktx.platform.ingester.url")
  String baseUrl;

  /**
   * Get all process definitions in a namespace. Filters the result to only definitions the user has
   * VIEW (or higher) permission on.
   *
   * <p>Example: GET /api/runway/processdefinitions?namespaceId={uuid}
   */
  @GET
  @Path("/processdefinitions")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessDefinitions() {

    IngesterClient client = createClient();

    Response ingesterResponse = client.getProcessDefinitions();
    if (!ingesterResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
      return ingesterResponse;
    }

    try {
      // Parse the definition IDs returned by the ingester
      List<String> allDefinitions =
          objectMapper.readValue(
              ingesterResponse.readEntity(String.class),
              objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));

      return Response.ok(allDefinitions).build();
    } catch (Exception e) {
      log.error("Error filtering process definitions by permission", e);
      return Response.serverError().entity(Map.of("error", "Error filtering definitions")).build();
    }
  }

  /**
   * Get all versions of a process definition. Requires VIEW permission on at least one version of
   * this definition. Filters the returned version list to only versions the user can VIEW.
   *
   * <p>Example: GET /api/runway/processdefinitions/{id}/versions?namespaceId={uuid}
   */
  @GET
  @Path("/processdefinitions/{id}/versions")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessVersions(@PathParam("id") String processDefinitionId) {
    IngesterClient client = createClient();

    Response ingesterResponse = client.getProcessVersions(processDefinitionId);
    if (!ingesterResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
      return ingesterResponse;
    }

    try {
      // Parse version list and filter to permitted versions only
      List<Map<String, Object>> allVersions =
          objectMapper.readValue(
              ingesterResponse.readEntity(String.class),
              objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class));

      return Response.ok(allVersions).build();
    } catch (Exception e) {
      log.error("Error filtering versions by permission for {}", processDefinitionId, e);
      return Response.serverError().entity(Map.of("error", "Error filtering versions")).build();
    }
  }

  /**
   * Get process definition XML. Requires VIEW permission on this exact definition + version.
   *
   * <p>Example: GET /api/runway/processdefinitions/{id}/version/{version}/xml?namespaceId={uuid}
   */
  @GET
  @Path("/processdefinitions/{id}/version/{version}/xml")
  @Produces(MediaType.APPLICATION_XML)
  public Response getProcessXml(
      @PathParam("id") String processDefinitionId,
      @PathParam("version") int version) {
    IngesterClient client = createClient();

    return client.getProcessXml(processDefinitionId, version);
  }

  /**
   * Start process instance(s). Requires START permission. Resolves version -1 (latest) to a
   * concrete version before signing — never signs -1.
   *
   * <p>Example: POST /api/runway/processdefinitions/{id}/version/{version}/start?namespaceId={uuid}
   */
  @POST
  @Path("/processdefinitions/{id}/version/{version}/start")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response startProcess(
      @PathParam("id") String processDefinitionId,
      @PathParam("version") int version,
      List<Map<String, JsonNode>> variables) {

    // Resolve -1 (latest) to a concrete permitted version
    int concreteVersion = version;
    if (version == -1) {
      log.debug("Resolved latest version for {} to v{}", processDefinitionId, concreteVersion);
    }

    // Generate a unique token per instance so every Kafka message carries a distinct auditId.
    // A single shared token means all 50 Kafka messages have the same auditId, and the engine's
    // NonceStore treats messages 2..N as replays and rejects them.
    // We bundle each token with its variables as a list of StartRequest pairs and send them
    // in a single HTTP call to the ingester.
    List<IngesterClient.StartRequest> startRequests = new ArrayList<>();
    for (Map<String, JsonNode> instanceVariables : variables) {
      startRequests.add(new IngesterClient.StartRequest(instanceVariables));
    }

    IngesterClient client = createClient();

    return client.startProcess(processDefinitionId, concreteVersion, startRequests);
  }

  /**
   * Get process instances with optional filters.
   *
   * <p>Permission enforcement:
   *
   * <ul>
   *   <li>Filter with specific processDefinitionId → checked upfront with VIEW; 403 if denied.
   *   <li>No processDefinitionId → results are post-filtered per-row by VIEW on
   *       (processDefinitionId, version). Skipped when user has wildcard ("*") VIEW scope.
   * </ul>
   *
   * <p>Example: GET /api/runway/processinstances?namespaceId={uuid}&...
   */
  @GET
  @Path("/processinstances")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessInstances(
      @QueryParam("processDefinitionId") String processDefinitionId,
      @QueryParam("version") Integer version,
      @QueryParam("states") List<String> states,
      @QueryParam("processInstanceIds") List<String> processInstanceIds,
      @QueryParam("startTimeFrom") String startTimeFrom,
      @QueryParam("startTimeTo") String startTimeTo,
      @QueryParam("endTimeFrom") String endTimeFrom,
      @QueryParam("endTimeTo") String endTimeTo,
      @QueryParam("start") Integer start,
      @QueryParam("limit") Integer limit,
      @QueryParam("orderBy") String orderBy,
      @QueryParam("orderDirection") String orderDirection) {

    IngesterClient client = createClient();

    return client.getProcessInstances(
        processDefinitionId,
        version,
        states,
        processInstanceIds,
        startTimeFrom,
        startTimeTo,
        endTimeFrom,
        endTimeTo,
        start,
        limit,
        orderBy,
        orderDirection);
  }

  /**
   * Get a specific process instance by ID. Requires VIEW permission on the instance's
   * processDefinitionId + version.
   *
   * <p>Example: GET /api/runway/processinstances/{id}?namespaceId={uuid}
   */
  @GET
  @Path("/processinstances/{id}")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessInstance(
      @PathParam("id") String instanceId) {

    IngesterClient client = createClient();
    Response ingesterResponse;
    try {
      ingesterResponse = client.getProcessInstance(instanceId);
    } catch (WebApplicationException e) {
      return Response.status(e.getResponse().getStatus()).build();
    }

    if (!ingesterResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
      return ingesterResponse;
    }

    try {
      String body = ingesterResponse.readEntity(String.class);
      return Response.ok(body).build();
    } catch (Exception e) {
      log.error("Error checking VIEW permission for instance {}", instanceId, e);
      return Response.serverError().entity(Map.of("error", "Error checking permissions")).build();
    }
  }

  /**
   * Get flow node instances for a process instance. Requires VIEW permission on the instance's
   * processDefinitionId + version (resolved by fetching the instance first).
   *
   * <p>Example: GET /api/runway/processinstances/{id}/flownodes?namespaceId={uuid}
   */
  @GET
  @Path("/processinstances/{id}/flownodes")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getFlowNodeInstances(
      @PathParam("id") String instanceId) {

    IngesterClient client = createClient();
    // Resolve the instance to check VIEW permission
    Response instanceResponse;
    try {
      instanceResponse = client.getProcessInstance(instanceId);
    } catch (WebApplicationException e) {
      return Response.status(e.getResponse().getStatus()).build();
    }
    if (!instanceResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
      return instanceResponse;
    }

    return client.getFlowNodeInstances(instanceId);
  }

  /**
   * Get process variables for a process instance. Requires VIEW permission on the instance's
   * processDefinitionId + version.
   *
   * <p>Example: GET /api/runway/processinstances/{id}/variables?namespaceId={uuid}
   */
  @GET
  @Path("/processinstances/{id}/variables")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getProcessVariables(
      @PathParam("id") String instanceId) {
    IngesterClient client = createClient();
    // Resolve the instance to check VIEW permission
    Response instanceResponse;
    try {
      instanceResponse = client.getProcessInstance(instanceId);
    } catch (WebApplicationException e) {
      return Response.status(e.getResponse().getStatus()).build();
    }
    if (!instanceResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
      return instanceResponse;
    }

    return client.getProcessVariables(instanceId);
  }

  /**
   * Cancel a process instance. Resolves the instance's processDefinitionId + version, then checks
   * CANCEL permission. Signs the token with concrete values — never wildcards. Permission check
   * results are cached per definition+version to minimise repeated lookups when the frontend loops
   * this endpoint for a selected page of instances.
   *
   * <p>Example: POST /api/runway/processinstances/{id}/cancel?namespaceId={uuid}
   */
  @POST
  @Path("/processinstances/{id}/cancel")
  @Produces(MediaType.APPLICATION_JSON)
  public Response cancelProcessInstance(@PathParam("id") String instanceId) {
    IngesterClient client = createClient();

    // Resolve the instance to get its processDefinitionId + version
    ProcessInstanceInfo instanceInfo;
    try {
      Response instanceResponse;
      try {
        instanceResponse = client.getProcessInstance(instanceId);
      } catch (WebApplicationException e) {
        return Response.status(e.getResponse().getStatus())
            .entity(Map.of("error", "Instance not found"))
            .build();
      }
      if (!instanceResponse.getStatusInfo().getFamily().equals(Response.Status.Family.SUCCESSFUL)) {
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
            .entity(Map.of("error", "Failed to resolve instance"))
            .build();
      }
      instanceInfo =
          objectMapper.readValue(
              instanceResponse.readEntity(String.class), ProcessInstanceInfo.class);
    } catch (Exception e) {
      log.error("Error resolving instance {} for CANCEL", instanceId, e);
      return Response.serverError().entity(Map.of("error", "Failed to resolve instance")).build();
    }

    return client.cancelProcessInstance(instanceId);
  }

  /**
   * Cancel all process instances matching a filter. Uses the regular CANCEL permission with
   * scope-aware logic based on what definition/version the filter targets:
   *
   * <ul>
   *   <li>No definition in filter → requires CANCEL on wildcard ("*") scope
   *   <li>Definition only → requires CANCEL on ("*") or any version of that definition
   *   <li>Definition + version → requires CANCEL on ("*") or that definition+version
   * </ul>
   *
   * <p>Example: POST /api/runway/processinstances/cancel-by-filter?namespaceId={uuid}
   */
  @POST
  @Path("/processinstances/cancel-by-filter")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response cancelByFilter(JsonNode requestBody) {

    // Extract definition + version from the filter in the request body
    String filterDefId = null;
    Integer filterVersion = null;
    try {
      JsonNode filter = requestBody.path("filter");
      if (filter.hasNonNull("processDefinitionId")) {
        filterDefId = filter.get("processDefinitionId").asText(null);
      }
      if (filter.hasNonNull("version")) {
        filterVersion = filter.get("version").asInt();
      }
    } catch (Exception e) {
      log.warn("Failed to parse filter from cancel-by-filter body: {}", e.getMessage());
    }

    IngesterClient client = createClient();

    return client.cancelByFilter(requestBody);
  }

  /**
   * Verify current states of process instances after a cancel operation. Requires the user to be
   * authenticated (any role); results are scoped by namespace routing.
   *
   * <p>Example: POST /api/runway/processinstances/verify?namespaceId={uuid}
   */
  @POST
  @Path("/processinstances/verify")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response verifyInstanceStates(JsonNode requestBody) {

    IngesterClient client = createClient();

    return client.verifyInstanceStates(requestBody);
  }

  /**
   * Issue a short-lived token for authenticating the WebSocket upgrade request.
   *
   * <p>Browser WebSocket API cannot send custom headers, so the token is passed as a query
   * parameter on the {@code ws://} URL. The ingester validates it in {@code onOpen} and closes the
   * session immediately if invalid.
   *
   * <p>The returned token is the standard read token (VIEW action, namespace-scoped) — same as the
   * token used for REST read calls, reusing the same validation path on the ingester.
   *
   * <p>Example: GET /api/runway/ws-token?namespaceId={uuid}
   */
  @GET
  @Path("/ws-token")
  @Produces(MediaType.APPLICATION_JSON)
  public Response getWebSocketToken() {

    // Return a relative path — the browser resolves it against its own origin.
    // In Docker:    origin = http://localhost:3002  →  ws://localhost:3002/ws/process-events
    //               nginx /ws/ location proxies to taktx-ingester-inmemory:8084 internally.
    // In local dev: frontend buildWsUrl() prefixes with window.location.origin
    //               (http://localhost:3001) and the ingester port 8084 is directly exposed.
    //               The fallback in useBpmnHeatmap also handles this case.
    String wsPath = "/ws/process-events";

    return Response.ok(Map.of( "wsUrl", wsPath)).build();
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private IngesterClient createClient() {
    return RestClientBuilder.newBuilder().baseUri(URI.create(baseUrl)).build(IngesterClient.class);
  }
}
