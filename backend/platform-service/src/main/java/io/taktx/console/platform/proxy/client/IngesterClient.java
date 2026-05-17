/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.platform.proxy.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.Data;

/**
 * REST client interface for communicating with ingester services.
 *
 * <p>This client is used dynamically with different base URLs (resolved from namespace
 * configuration). Since Quarkus REST Client requires compile-time base URL configuration, we use
 * this interface programmatically via RestClientBuilder.
 */
public interface IngesterClient {

  @GET
  @Path("/processdefinitions")
  @Produces(MediaType.APPLICATION_JSON)
  Response getProcessDefinitions();

  @GET
  @Path("/processdefinitions/{id}/versions")
  @Produces(MediaType.APPLICATION_JSON)
  Response getProcessVersions(@PathParam("id") String processDefinitionId);

  @GET
  @Path("/processdefinitions/{id}/version/{version}/xml")
  @Produces(MediaType.APPLICATION_XML)
  Response getProcessXml(
      @PathParam("id") String processDefinitionId, @PathParam("version") int version);

  @GET
  @Path("/dmn/{dmnDefinitionId}/xml")
  @Produces(MediaType.APPLICATION_XML)
  Response getDmnXml(@PathParam("dmnDefinitionId") String dmnDefinitionId);

  @POST
  @Path("/processdefinitions/{id}/version/{version}/start")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  Response startProcess(
      @PathParam("id") String processDefinitionId,
      @PathParam("version") int version,
      List<StartRequest> startRequests);

  @GET
  @Path("/processinstances")
  @Produces(MediaType.APPLICATION_JSON)
  Response getProcessInstances(
      @QueryParam("processDefinitionId") String processDefinitionId,
      @QueryParam("version") Integer version,
      @QueryParam("states") List<String> states,
      @QueryParam("processInstanceIds") List<String> processInstanceIds,
      @QueryParam("startTimeFrom") String startTimeFrom,
      @QueryParam("startTimeTo") String startTimeTo,
      @QueryParam("endTimeFrom") String endTimeFrom,
      @QueryParam("endTimeTo") String endTimeTo,
      @QueryParam("businessKey") String businessKey,
      @QueryParam("tag") String tag,
      @QueryParam("start") Integer start,
      @QueryParam("limit") Integer limit,
      @QueryParam("orderBy") String orderBy,
      @QueryParam("orderDirection") String orderDirection);

  @GET
  @Path("/processinstances/{id}")
  @Produces(MediaType.APPLICATION_JSON)
  Response getProcessInstance(@PathParam("id") String instanceId);

  @GET
  @Path("/processinstances/{id}/flownodes")
  @Produces(MediaType.APPLICATION_JSON)
  Response getFlowNodeInstances(@PathParam("id") String instanceId);

  @GET
  @Path("/processinstances/{id}/variables")
  @Produces(MediaType.APPLICATION_JSON)
  Response getProcessVariables(@PathParam("id") String instanceId);

  @POST
  @Path("/processinstances/{id}/cancel")
  @Produces(MediaType.APPLICATION_JSON)
  Response cancelProcessInstance(@PathParam("id") String instanceId);

  @POST
  @Path("/processinstances/cancel-by-filter")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  Response cancelByFilter(JsonNode request);

  @POST
  @Path("/processinstances/verify")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  Response verifyInstanceStates(JsonNode request);

  // ============================================================================
  // DTOs
  // ============================================================================

  /** A single start request pairing a unique per-instance auth token with its variables. */
  @Data
  class StartRequest {
    private Map<String, JsonNode> variables;
    private String businessKey;
    private Set<String> tags;

    public StartRequest() {}

    public StartRequest(Map<String, JsonNode> variables) {
      this.variables = variables;
    }

    public StartRequest(Map<String, JsonNode> variables, String businessKey, Set<String> tags) {
      this.variables = variables;
      this.businessKey = businessKey;
      this.tags = tags;
    }
  }

  /**
   * Lightweight projection of a process instance used by the BFF to resolve processDefinitionId +
   * version before checking CANCEL permission and signing.
   */
  @Data
  @JsonIgnoreProperties(ignoreUnknown = true)
  class ProcessInstanceInfo {
    private String processInstanceId;
    private String processDefinitionId;
    private int version;
    private String state;
  }
}
