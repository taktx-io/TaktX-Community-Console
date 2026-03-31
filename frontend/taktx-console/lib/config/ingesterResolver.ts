/**
 * Ingester URL resolver for community mode.
 *
 * WebSocket connections now go through a BFF token exchange:
 *  1. GET /api/runway/ws-token  →  { token, wsUrl }
 *  2. new WebSocket(`${wsUrl}?token=${token}`)
 *
 * This means the frontend never needs ingesterUrl directly, and every WS
 * connection carries a signed read token validated by the ingester on open.
 */

'use client';

// In local dev (no nginx) the frontend runs on :3001 and the platform-service on :8080.
// Relative URLs (/api/...) would hit the Next.js dev server, not the backend.
// NEXT_PUBLIC_PLATFORM_SERVICE_URL is 'http://localhost:8080' in .env.local and
// empty in Docker/production (nginx proxies /api/* from the same origin).
const PLATFORM_SERVICE_URL = process.env.NEXT_PUBLIC_PLATFORM_SERVICE_URL || '';

export interface WsConnection {
  /** Full WebSocket URL */
  wsUrl: string;
  /** The signed read token (exposed so callers can log/debug; do not persist) */
  token: string;
}

// ─── WebSocket token exchange ────────────────────────────────────────────────

/**
 * Fetch a short-lived WS read token and the WS URL from the BFF.
 * Returns null if the request fails.
 */
export async function fetchWsConnection(): Promise<WsConnection | null> {
  try {
    const res = await fetch(`${PLATFORM_SERVICE_URL}/api/runway/ws-token`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[ingesterResolver] ws-token fetch failed:', res.status, res.statusText);
      return null;
    }

    const { token, wsUrl } = (await res.json()) as { token: string; wsUrl: string };

    // wsUrl from BFF is a relative path (e.g. /ws/process-events) so nginx can proxy it.
    // In Docker:    expand using window.location.origin → ws://localhost:3002/ws/process-events
    //               nginx /ws/ location proxies to the ingester container.
    // In local dev: NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084 overrides the origin so the
    //               browser connects directly to the ingester's exposed port (no nginx).
    //               If wsUrl is already absolute (future use), use it directly.
    const wsBase = process.env.NEXT_PUBLIC_TAKTX_WS_URL ?? null;

    const fullWsUrl = wsUrl.startsWith('/')
      ? (() => {
          if (wsBase) return `${wsBase.replace(/\/$/, '')}${wsUrl}`;
          const loc = globalThis.window?.location;
          const proto = loc?.protocol === 'https:' ? 'wss' : 'ws';
          const host = loc?.host ?? 'localhost';
          return `${proto}://${host}${wsUrl}`;
        })()
      : wsUrl;

    return { token, wsUrl: `${fullWsUrl}?token=${encodeURIComponent(token)}` };
  } catch (e) {
    console.error('[ingesterResolver] ws-token fetch error:', e);
    return null;
  }
}

