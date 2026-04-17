/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import io.taktx.client.TaktXClient;
import io.taktx.dto.DmnDefinitionKey;
import jakarta.inject.Inject;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * DMN definition resource.
 *
 * <p>Intentionally kept at the root {@code /dmn/} path — separate from {@code /processdefinitions/}
 * — to avoid a JAX-RS (RESTEasy) routing conflict. A literal segment {@code dmn} nested inside
 * {@code /processdefinitions/} at the same position as the template {@code {id}} causes the router
 * to shadow any process-definition whose ID starts with "dmn" (case-sensitive prefix match in the
 * routing trie).
 */
@Path("/dmn")
@Slf4j
public class DmnResource {

  @Inject TaktXClient taktClient;

  @ConfigProperty(name = "taktx.engine.namespace")
  String namespace;

  /**
   * Get DMN definition XML by decision ID or definitions ID (latest version).
   *
   * <p>A single DMN file can embed multiple decision tables. The {@code dmnDefinitionId} parameter
   * may be either:
   *
   * <ul>
   *   <li>A <em>decision ID</em> (e.g. {@code "riskEvaluation"}) as referenced by a BPMN {@code
   *       zeebe:calledDecision}. The reverse index built by the TaktX client maps every known
   *       decision ID to the {@link DmnDefinitionKey} of its containing file, so this case is
   *       resolved without any filesystem scan.
   *   <li>A <em>definitions-level ID</em> (the outer {@code <definitions id="…">} attribute). Used
   *       as a fallback: the local file cache is scanned for the highest deployed version.
   * </ul>
   *
   * <p>Example: GET /dmn/{dmnDefinitionId}/xml
   */
  @GET
  @Path("/{dmnDefinitionId}/xml")
  @Produces(MediaType.APPLICATION_XML)
  public Response getDmnDefinitionXml(
      @PathParam("dmnDefinitionId")
          @Pattern(
              regexp = "^[a-zA-Z0-9_-]+$",
              message =
                  "DMN definition ID can only contain alphanumeric characters, hyphens, and underscores")
          @Size(max = 128, message = "DMN definition ID cannot exceed 128 characters")
          String dmnDefinitionId) {
    try {
      // Phase 1: reverse-index lookup.
      // getDmnDefinitionKeyForDecision resolves a decision ID to the exact (definitionsId,
      // version) key of the DMN file that contains it.  This correctly handles the case where
      // one DMN file hosts multiple decision tables.
      Optional<DmnDefinitionKey> keyOpt =
          taktClient.getDmnDefinitionKeyForDecision(dmnDefinitionId);
      if (keyOpt.isPresent()) {
        DmnDefinitionKey key = keyOpt.get();
        log.debug("Resolved decision '{}' via reverse index to DMN key {}", dmnDefinitionId, key);
        String dmnXml = taktClient.getDmnDefinitionXml(key);
        if (dmnXml != null && !dmnXml.isEmpty()) {
          return Response.ok(dmnXml).build();
        }
        log.warn(
            "Reverse-index resolved '{}' to key {} but XML was empty; falling back to file scan",
            dmnDefinitionId,
            key);
      }

      // Phase 2: fallback — treat dmnDefinitionId as the definitions-level ID and find
      // the latest deployed version by scanning the local file cache written by the client.
      java.nio.file.Path namespacePath =
          Paths.get(System.getProperty("user.home"), ".taktx", "definitions", namespace);

      if (!Files.exists(namespacePath)) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity("DMN definition not found: " + dmnDefinitionId)
            .build();
      }

      int latestVersion;
      try (java.util.stream.Stream<java.nio.file.Path> files = Files.list(namespacePath)) {
        latestVersion =
            files
                .map(p -> p.getFileName().toString())
                .filter(name -> name.startsWith(dmnDefinitionId + ".") && name.endsWith(".dmn"))
                .mapToInt(
                    name -> {
                      String versionStr =
                          name.substring(dmnDefinitionId.length() + 1, name.length() - 4);
                      try {
                        return Integer.parseInt(versionStr);
                      } catch (NumberFormatException e) {
                        return -1;
                      }
                    })
                .filter(v -> v > 0)
                .max()
                .orElse(-1);
      }

      if (latestVersion == -1) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity("DMN definition not found: " + dmnDefinitionId)
            .build();
      }

      String dmnXml =
          taktClient.getDmnDefinitionXml(new DmnDefinitionKey(dmnDefinitionId, latestVersion));
      if (dmnXml == null || dmnXml.isEmpty()) {
        return Response.status(Response.Status.NOT_FOUND)
            .entity("DMN XML not available for definition: " + dmnDefinitionId)
            .build();
      }

      return Response.ok(dmnXml).build();
    } catch (Exception e) {
      log.error("Error retrieving DMN XML for definition: {}", dmnDefinitionId, e);
      return Response.serverError().entity("Error retrieving DMN XML: " + e.getMessage()).build();
    }
  }
}
