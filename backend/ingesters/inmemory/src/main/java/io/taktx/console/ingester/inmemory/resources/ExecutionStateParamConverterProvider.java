/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import jakarta.ws.rs.ext.ParamConverter;
import jakarta.ws.rs.ext.ParamConverterProvider;
import jakarta.ws.rs.ext.Provider;
import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

/**
 * JAX-RS parameter converter provider for ExecutionStateQueryParam. Allows automatic conversion
 * from query parameter strings to ExecutionStateQueryParam objects.
 */
@Provider
public class ExecutionStateParamConverterProvider implements ParamConverterProvider {

  @Override
  @SuppressWarnings("unchecked")
  public <T> ParamConverter<T> getConverter(
      Class<T> rawType, Type genericType, Annotation[] annotations) {
    if (rawType.equals(ExecutionStateQueryParam.class)) {
      return (ParamConverter<T>) new ExecutionStateParamConverter();
    }
    return null;
  }

  private static class ExecutionStateParamConverter
      implements ParamConverter<ExecutionStateQueryParam> {

    @Override
    public ExecutionStateQueryParam fromString(String value) {
      if (value == null) {
        return null;
      }
      return ExecutionStateQueryParam.fromString(value);
    }

    @Override
    public String toString(ExecutionStateQueryParam value) {
      if (value == null) {
        return null;
      }
      return value.toString();
    }
  }
}
