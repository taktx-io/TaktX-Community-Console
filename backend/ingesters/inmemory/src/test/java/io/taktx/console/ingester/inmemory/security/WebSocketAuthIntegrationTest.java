/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.security;

import static org.assertj.core.api.Assertions.*;

import io.jsonwebtoken.Jwts;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import java.net.URI;
import java.security.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Integration tests verifying WebSocket authentication on {@code /ws/process-events}.
 *
 * <p>Generates a fresh RSA key pair and injects the public key into {@link
 * AuthorizationTokenValidator} so the ingester's token validator uses our test key — no external
 * dependencies.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class WebSocketAuthIntegrationTest {

  @TestHTTPResource("/ws/process-events")
  URI wsUri;

  @Inject AuthorizationTokenValidator tokenValidator;

  // Use shared key pair — consistent with all other WS security test classes
  private static final java.security.KeyPair TRUSTED_PAIR = TestTokenFactory.KEY_PAIR;
  private static final java.security.KeyPair FOREIGN_PAIR = TestTokenFactory.FOREIGN_KEY_PAIR;

  @BeforeEach
  void injectPublicKey() throws Exception {
    tokenValidator.overridePublicKeyForTesting(TRUSTED_PAIR.getPublic());
  }

  private String validToken() {
    return TestTokenFactory.validToken();
  }

  /**
   * Open a WS connection with the given query string and wait up to 4s for a server-initiated
   * close. Returns the close code if the server closed it, or -1 if the connection stayed open
   * (i.e. was accepted). Our own clean-up close at the end does NOT count.
   */
  private int connectAndWaitForClose(String query) throws Exception {
    CountDownLatch serverClosedLatch = new CountDownLatch(1);
    AtomicInteger closeCode = new AtomicInteger(-1);
    AtomicReference<Session> sessionRef = new AtomicReference<>();
    // Flag to distinguish our manual close from a server-initiated close
    java.util.concurrent.atomic.AtomicBoolean weInitiatedClose =
        new java.util.concurrent.atomic.AtomicBoolean(false);

    URI uri = query != null ? new URI(wsUri + "?" + query) : wsUri;
    WebSocketContainer container = ContainerProvider.getWebSocketContainer();

    container.connectToServer(
        new Endpoint() {
          @Override
          public void onOpen(Session s, EndpointConfig c) {
            sessionRef.set(s);
            s.addMessageHandler(String.class, msg -> {});
          }

          @Override
          public void onClose(Session s, CloseReason r) {
            if (!weInitiatedClose.get()) {
              closeCode.set(r.getCloseCode().getCode());
              serverClosedLatch.countDown();
            }
          }

          @Override
          public void onError(Session s, Throwable t) {
            serverClosedLatch.countDown();
          }
        },
        ClientEndpointConfig.Builder.create().build(),
        uri);

    // Wait up to 2s for a server-initiated close (rejections happen immediately)
    serverClosedLatch.await(2, TimeUnit.SECONDS);
    Session s = sessionRef.get();
    if (s != null && s.isOpen()) {
      weInitiatedClose.set(true);
      s.close();
    }
    return closeCode.get(); // -1 if server never closed = accepted
  }

  // ── rejection cases ───────────────────────────────────────────────────────

  @Test
  void ws_noToken_isRejected() throws Exception {
    assertThat(connectAndWaitForClose(null)).isEqualTo(1008);
  }

  @Test
  void ws_emptyToken_isRejected() throws Exception {
    assertThat(connectAndWaitForClose("token=")).isEqualTo(1008);
  }

  @Test
  void ws_expiredToken_isRejected() throws Exception {
    String expired =
        Jwts.builder()
            .subject("user")
            .issuer("taktx-platform-service")
            .issuedAt(Date.from(Instant.now().minus(10, ChronoUnit.MINUTES)))
            .expiration(Date.from(Instant.now().minus(5, ChronoUnit.MINUTES)))
            .claim("action", "VIEW")
            .claim("namespaceId", UUID.randomUUID().toString())
            .claim("processDefinitionId", "*")
            .claim("version", -1)
            .claim("auditId", UUID.randomUUID().toString())
            .signWith(TRUSTED_PAIR.getPrivate())
            .compact();

    assertThat(connectAndWaitForClose("token=" + expired)).isEqualTo(1008);
  }

  @Test
  void ws_tokenSignedWithWrongKey_isRejected() throws Exception {
    String foreign =
        Jwts.builder()
            .subject("user")
            .issuer("taktx-platform-service")
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plus(5, ChronoUnit.MINUTES)))
            .claim("action", "VIEW")
            .claim("namespaceId", UUID.randomUUID().toString())
            .claim("processDefinitionId", "*")
            .claim("version", -1)
            .claim("auditId", UUID.randomUUID().toString())
            .signWith(FOREIGN_PAIR.getPrivate())
            .compact();

    assertThat(connectAndWaitForClose("token=" + foreign)).isEqualTo(1008);
  }

  // ── acceptance case ───────────────────────────────────────────────────────

  @Test
  void ws_validToken_connectionIsAccepted() throws Exception {
    // -1 means the connection was NOT closed within the timeout → accepted
    assertThat(connectAndWaitForClose("token=" + validToken())).isEqualTo(-1);
  }
}
