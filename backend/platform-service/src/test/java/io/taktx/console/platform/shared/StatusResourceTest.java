/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.platform.shared;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

@QuarkusTest
class StatusResourceTest {

  @Test
  void testStatusEndpoint() {
    given()
        .when()
        .get("/api/status")
        .then()
        .statusCode(200)
        .body("service", is("taktx-platform-service"))
        .body("status", is("running"))
        .body("version", is("0.1.0-SNAPSHOT"));
  }

  @Test
  void testHealthEndpoint() {
    given().when().get("/health").then().statusCode(200);
  }

  @Test
  void testHealthReadyEndpoint() {
    given().when().get("/health/ready").then().statusCode(200);
  }

  @Test
  void testHealthLiveEndpoint() {
    given().when().get("/health/live").then().statusCode(200);
  }
}
