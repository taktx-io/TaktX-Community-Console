/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.platform.shared;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

@Path("/api/status")
public class StatusResource {

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public Response getStatus() {
    return Response.ok(
            Map.of(
                "service", "taktx-platform-service",
                "status", "running",
                "version", "0.1.0-SNAPSHOT"))
        .build();
  }
}
