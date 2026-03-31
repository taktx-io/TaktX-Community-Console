/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for validation rules in ProcessInstanceFilterCriteria using ExecutionStateQueryParam
 * that handles both ExecutionState enum values and the special INCIDENT pseudo-state.
 */
class ProcessInstanceFilterCriteriaValidationTest {

  private static Validator validator;

  @BeforeAll
  static void setUp() {
    ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
    validator = factory.getValidator();
  }

  @Test
  void testValidProcessDefinitionId() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("myProcess123");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Valid process definition ID should not have violations");
  }

  @Test
  void testProcessDefinitionIdWithHyphensAndUnderscores() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("my-process_123");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(
        violations.isEmpty(), "Process definition ID with hyphens and underscores should be valid");
  }

  @Test
  void testProcessDefinitionIdTooLong() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("a".repeat(129)); // Exceeds 128 character limit

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(
        violations.isEmpty(), "Process definition ID exceeding 128 characters should be invalid");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("cannot exceed 128 characters")),
        "Should have size violation message");
  }

  @Test
  void testProcessDefinitionIdWithInvalidCharacters() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("my/process<script>");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(
        violations.isEmpty(), "Process definition ID with invalid characters should be rejected");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("alphanumeric")),
        "Should indicate invalid characters");
  }

  @Test
  void testProcessDefinitionIdWithSQLInjection() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("'; DROP TABLE users; --");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "SQL injection attempt should be rejected");
  }

  @Test
  void testProcessDefinitionIdWithXSSAttempt() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("<script>alert('xss')</script>");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "XSS attempt should be rejected");
  }

  @Test
  void testValidVersion() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setVersion(5);

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Valid version should not have violations");
  }

  @Test
  void testVersionTooLow() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setVersion(0);

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "Version 0 should be invalid");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("must be at least 1")),
        "Should indicate minimum version requirement");
  }

  @Test
  void testVersionTooHigh() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setVersion(100000);

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "Version exceeding 99999 should be invalid");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("cannot exceed 99999")),
        "Should indicate maximum version limit");
  }

  @Test
  void testValidStatesWithExecutionStateEnums() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setStates(
        List.of(
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED")));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Valid ExecutionState values should not have violations");
  }

  @Test
  void testValidStatesWithIncidentPseudoState() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setStates(List.of(ExecutionStateQueryParam.fromString("INCIDENT")));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "INCIDENT pseudo-state should be valid");
  }

  @Test
  void testValidStatesMixedExecutionStateAndIncident() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setStates(
        List.of(
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("INCIDENT"),
            ExecutionStateQueryParam.fromString("COMPLETED")));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Mix of ExecutionState and INCIDENT should be valid");
  }

  @Test
  void testAllExecutionStates() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setStates(
        List.of(
            ExecutionStateQueryParam.fromString("INITIALIZED"),
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ABORTED")));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "All ExecutionState enum values should be valid");
  }

  @Test
  void testTooManyStates() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setStates(
        List.of(
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("COMPLETED"),
            ExecutionStateQueryParam.fromString("ABORTED")));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "More than 10 states should be invalid");
    assertTrue(
        violations.stream()
            .anyMatch(v -> v.getMessage().contains("Cannot filter by more than 10 states")),
        "Should indicate states limit");
  }

  @Test
  void testNullStateInList() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    List<ExecutionStateQueryParam> statesWithNull = new ArrayList<>();
    statesWithNull.add(ExecutionStateQueryParam.fromString("ACTIVE"));
    statesWithNull.add(null);
    criteria.setStates(statesWithNull);

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "Null state value should be rejected");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("cannot be null")),
        "Should indicate null state is not allowed");
  }

  @Test
  void testInvalidStateValue() {
    // ExecutionStateQueryParam.fromString() throws exception for invalid values
    assertThrows(
        IllegalArgumentException.class,
        () -> ExecutionStateQueryParam.fromString("INVALID_STATE"),
        "Invalid state should throw IllegalArgumentException");
  }

  @Test
  void testInvalidStateXSSAttempt() {
    // XSS attempts are rejected by ExecutionStateQueryParam.fromString()
    assertThrows(
        IllegalArgumentException.class,
        () -> ExecutionStateQueryParam.fromString("<script>alert('xss')</script>"),
        "XSS attempt should throw IllegalArgumentException");
  }

  @Test
  void testValidBusinessKey() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setBusinessKey("order-12345");

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Valid business key should not have violations");
  }

  @Test
  void testBusinessKeyTooLong() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setBusinessKey("a".repeat(257)); // Exceeds 256 character limit

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertFalse(violations.isEmpty(), "Business key exceeding 256 characters should be invalid");
    assertTrue(
        violations.stream().anyMatch(v -> v.getMessage().contains("cannot exceed 256 characters")),
        "Should have size violation message");
  }

  @Test
  void testAllValidFilters() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("myProcess");
    criteria.setVersion(2);
    criteria.setStates(
        List.of(
            ExecutionStateQueryParam.fromString("ACTIVE"),
            ExecutionStateQueryParam.fromString("INCIDENT")));
    criteria.setBusinessKey("order-123");
    criteria.setHasIncident(true);

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "All valid filters should not have violations");
  }

  @Test
  void testMultipleViolations() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("invalid/id<script>");
    criteria.setVersion(0);
    criteria.setBusinessKey("a".repeat(300));

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.size() >= 3, "Should have multiple violations");
  }

  @Test
  void testNullValuesAreValid() {
    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    // All fields null

    Set<ConstraintViolation<ProcessInstanceFilterCriteria>> violations =
        validator.validate(criteria);
    assertTrue(violations.isEmpty(), "Null values should be valid (optional filters)");
  }

  @Test
  void testIncidentFilterCreation() {
    ExecutionStateQueryParam incident = ExecutionStateQueryParam.fromString("INCIDENT");
    assertTrue(incident.isIncidentFilter(), "INCIDENT should be recognized as incident filter");
    assertFalse(incident.isExecutionState(), "INCIDENT should not be an execution state");
    assertNull(incident.getExecutionState(), "INCIDENT should have null execution state");
  }

  @Test
  void testExecutionStateFilterCreation() {
    ExecutionStateQueryParam active = ExecutionStateQueryParam.fromString("ACTIVE");
    assertFalse(active.isIncidentFilter(), "ACTIVE should not be an incident filter");
    assertTrue(active.isExecutionState(), "ACTIVE should be an execution state");
    assertNotNull(active.getExecutionState(), "ACTIVE should have non-null execution state");
  }

  @Test
  void testCaseInsensitiveStateParsing() {
    ExecutionStateQueryParam lower = ExecutionStateQueryParam.fromString("active");
    ExecutionStateQueryParam upper = ExecutionStateQueryParam.fromString("ACTIVE");
    ExecutionStateQueryParam mixed = ExecutionStateQueryParam.fromString("AcTiVe");

    assertEquals(
        lower.getExecutionState(),
        upper.getExecutionState(),
        "State parsing should be case-insensitive");
    assertEquals(
        mixed.getExecutionState(),
        upper.getExecutionState(),
        "State parsing should be case-insensitive");
  }

  @Test
  void testIncidentCaseInsensitive() {
    ExecutionStateQueryParam lower = ExecutionStateQueryParam.fromString("incident");
    ExecutionStateQueryParam upper = ExecutionStateQueryParam.fromString("INCIDENT");
    ExecutionStateQueryParam mixed = ExecutionStateQueryParam.fromString("InCiDeNt");

    assertTrue(lower.isIncidentFilter(), "lowercase 'incident' should work");
    assertTrue(upper.isIncidentFilter(), "uppercase 'INCIDENT' should work");
    assertTrue(mixed.isIncidentFilter(), "mixed case 'InCiDeNt' should work");
  }
}
