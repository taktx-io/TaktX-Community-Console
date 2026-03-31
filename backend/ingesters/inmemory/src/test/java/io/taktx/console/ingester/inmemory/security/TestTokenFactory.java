/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.security;

import io.jsonwebtoken.Jwts;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

/**
 * Shared RSA key pair and token factory for WebSocket security tests.
 *
 * <p>All {@code @QuarkusTest} classes share the same CDI application context, so {@link
 * AuthorizationTokenValidator} is a singleton. Using a single static key pair here ensures that
 * whichever test class calls {@code overridePublicKeyForTesting} last, it sets the same key that
 * all other test classes use to sign tokens — preventing cross-test interference.
 */
public final class TestTokenFactory {

  /** Key ID used in all test JWTs and when registering the test public key. */
  public static final String KID = "test-key-1";

  /** Single RSA key pair shared across ALL WebSocket security tests. */
  public static final KeyPair KEY_PAIR;

  /** A separate foreign key pair for "wrong key" rejection tests. */
  public static final KeyPair FOREIGN_KEY_PAIR;

  static {
    try {
      KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
      gen.initialize(2048);
      KEY_PAIR = gen.generateKeyPair();
      FOREIGN_KEY_PAIR = gen.generateKeyPair();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  private TestTokenFactory() {}

  /** Build a valid VIEW token signed with the shared trusted key pair. */
  public static String validToken() {
    return Jwts.builder()
        .header()
        .keyId(KID)
        .and()
        .subject("test-user")
        .issuer("taktx-platform-service")
        .issuedAt(Date.from(Instant.now()))
        .expiration(Date.from(Instant.now().plus(5, ChronoUnit.MINUTES)))
        .claim("action", "VIEW")
        .claim("namespaceId", UUID.randomUUID().toString())
        .claim("processDefinitionId", "*")
        .claim("version", -1)
        .claim("auditId", UUID.randomUUID().toString())
        .signWith(KEY_PAIR.getPrivate())
        .compact();
  }
}
