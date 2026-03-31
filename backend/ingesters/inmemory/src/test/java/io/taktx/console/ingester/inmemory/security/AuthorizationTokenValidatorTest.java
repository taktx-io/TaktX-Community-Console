/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.security;

import static org.assertj.core.api.Assertions.*;

import io.jsonwebtoken.Jwts;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import io.taktx.dto.TokenClaims;
import io.taktx.security.AuthorizationTokenException;
import io.taktx.security.AuthorizationTokenValidator;
import jakarta.inject.Inject;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link AuthorizationTokenValidator}.
 *
 * <p>Generates a fresh RSA key pair per test class run and injects the public key directly into the
 * {@link AuthorizationTokenValidator} CDI bean — no hardcoded keys, no external key files needed.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class AuthorizationTokenValidatorTest {

  @Inject AuthorizationTokenValidator validator;

  // Use shared key pair so overridePublicKeyForTesting is consistent across all test classes
  private static final KeyPair TRUSTED_PAIR = TestTokenFactory.KEY_PAIR;
  private static final KeyPair FOREIGN_PAIR = TestTokenFactory.FOREIGN_KEY_PAIR;

  @BeforeEach
  void injectTrustedPublicKey() throws Exception {
    validator.overridePublicKeyForTesting(TRUSTED_PAIR.getPublic());
  }

  private String token(PrivateKey key, String userId, UUID ns, Instant expiry) {
    return Jwts.builder()
        .header()
        .keyId(TestTokenFactory.KID)
        .and()
        .subject(userId)
        .issuer("taktx-platform-service")
        .issuedAt(Date.from(Instant.now()))
        .expiration(Date.from(expiry))
        .claim("action", "VIEW")
        .claim("namespaceId", ns.toString())
        .claim("processDefinitionId", "*")
        .claim("version", -1)
        .claim("auditId", UUID.randomUUID().toString())
        .signWith(key)
        .compact();
  }

  // ── valid ──────────────────────────────────────────────────────────────────

  @Test
  void validateToken_valid_returnsClaims() throws Exception {
    UUID ns = UUID.randomUUID();
    TokenClaims claims =
        validator.validateToken(
            token(
                TRUSTED_PAIR.getPrivate(), "alice", ns, Instant.now().plus(5, ChronoUnit.MINUTES)));

    assertThat(claims.getUserId()).isEqualTo("alice");
    assertThat(claims.getAction()).isEqualTo("VIEW");
    assertThat(claims.getNamespaceId()).isEqualTo(ns);
    assertThat(claims.getProcessDefinitionId()).isEqualTo("*");
    assertThat(claims.getVersion()).isEqualTo(-1);
    assertThat(claims.getAuditId()).isNotBlank();
    assertThat(claims.getExpiresAt()).isGreaterThan(System.currentTimeMillis());
  }

  // ── null / blank ──────────────────────────────────────────────────────────

  @Test
  void validateToken_null_throwsRequired() {
    assertThatThrownBy(() -> validator.validateToken(null))
        .isInstanceOf(AuthorizationTokenException.class)
        .hasMessageContaining("required");
  }

  @Test
  void validateToken_blank_throwsRequired() {
    assertThatThrownBy(() -> validator.validateToken("   "))
        .isInstanceOf(AuthorizationTokenException.class)
        .hasMessageContaining("required");
  }

  // ── expired ───────────────────────────────────────────────────────────────

  @Test
  void validateToken_expired_throwsExpired() {
    String t =
        token(
            TRUSTED_PAIR.getPrivate(),
            "bob",
            UUID.randomUUID(),
            Instant.now().minus(1, ChronoUnit.MINUTES));
    assertThatThrownBy(() -> validator.validateToken(t))
        .isInstanceOf(AuthorizationTokenException.class)
        .hasMessageContaining("expired");
  }

  // ── wrong key ─────────────────────────────────────────────────────────────

  @Test
  void validateToken_wrongKey_throwsSignature() {
    String t =
        token(
            FOREIGN_PAIR.getPrivate(),
            "charlie",
            UUID.randomUUID(),
            Instant.now().plus(5, ChronoUnit.MINUTES));
    assertThatThrownBy(() -> validator.validateToken(t))
        .isInstanceOf(AuthorizationTokenException.class)
        .hasMessageContaining("signature");
  }

  // ── tampered payload ──────────────────────────────────────────────────────

  @Test
  void validateToken_tamperedPayload_throws() {
    String t =
        token(
            TRUSTED_PAIR.getPrivate(),
            "dave",
            UUID.randomUUID(),
            Instant.now().plus(5, ChronoUnit.MINUTES));
    String[] p = t.split("\\.");
    String bad = p[1].substring(0, Math.max(0, p[1].length() - 4)) + "XXXX";
    assertThatThrownBy(() -> validator.validateToken(p[0] + "." + bad + "." + p[2]))
        .isInstanceOf(AuthorizationTokenException.class);
  }

  // ── garbage ───────────────────────────────────────────────────────────────

  @Test
  void validateToken_garbage_throws() {
    assertThatThrownBy(() -> validator.validateToken("not.a.jwt"))
        .isInstanceOf(AuthorizationTokenException.class);
  }
}
