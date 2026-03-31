/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;

/**
 * Exception mapper to handle validation errors and return user-friendly error messages. This
 * prevents sensitive information from being leaked and provides clear feedback about validation
 * failures.
 */
@Provider
@Slf4j
public class ValidationExceptionMapper implements ExceptionMapper<ConstraintViolationException> {

  @Override
  public Response toResponse(ConstraintViolationException exception) {
    // Log validation failures for security monitoring
    log.warn(
        "Validation failed: {}",
        exception.getConstraintViolations().stream()
            .map(cv -> cv.getPropertyPath() + ": " + cv.getMessage())
            .collect(Collectors.joining(", ")));

    // Build user-friendly error response
    Map<String, Object> errorResponse = new HashMap<>();
    errorResponse.put("error", "Validation failed");
    errorResponse.put("message", "The request contains invalid parameters");

    // Include specific validation errors (safe to expose as they don't leak sensitive data)
    Map<String, String> violations = new HashMap<>();
    for (ConstraintViolation<?> violation : exception.getConstraintViolations()) {
      String propertyPath = violation.getPropertyPath().toString();
      // Extract just the parameter name without the full path
      String paramName =
          propertyPath.contains(".")
              ? propertyPath.substring(propertyPath.lastIndexOf('.') + 1)
              : propertyPath;
      violations.put(paramName, violation.getMessage());
    }
    errorResponse.put("violations", violations);

    return Response.status(Response.Status.BAD_REQUEST).entity(errorResponse).build();
  }
}
