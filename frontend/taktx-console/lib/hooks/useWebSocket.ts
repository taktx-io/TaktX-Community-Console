'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketState<T = any> {
  status: 'connecting' | 'open' | 'closed' | 'error';
  // include optional timestamp metadata on lastMessage
  lastMessage?: T & { _timestamp?: number };
  send: (msg: unknown) => void;
}

// Module-scoped map to ensure a single WebSocket connection per URL.
type MessageListener<T> = (msg: T) => void;
type StatusListener = (status: WebSocketState['status']) => void;
// A URL factory — called on every connect attempt so a fresh token is always used.
type UrlFactory = () => Promise<string | null>;

class SharedWebSocket {
  private urlFactory: UrlFactory;
  url: string | null = null; // last resolved URL (for sharedMap keying)
  ws: WebSocket | null = null;
  listeners = new Set<MessageListener<any>>();
  statusListeners = new Set<StatusListener>();
  reconnectTimer: number | null = null;
  backoff = 250;
  manuallyClosed = false;

  // queued messages while the socket is not OPEN
  private readonly messageQueue: unknown[] = [];
  private readonly queueCap = 200; // cap to avoid unbounded memory growth

  constructor(urlFactory: UrlFactory) {
    this.urlFactory = urlFactory;
    this.connect();
  }

  connect() {
    this.setStatus('connecting');
    this.urlFactory().then((resolvedUrl) => {
      if (this.manuallyClosed) return;
      if (!resolvedUrl) {
        // Factory returned null (e.g. token fetch failed) — retry after backoff
        this.setStatus('error');
        this.scheduleReconnect();
        return;
      }
      this.url = resolvedUrl;
      try {
        this.ws = new WebSocket(resolvedUrl);

        this.ws.onopen = () => {
          this.backoff = 250;
          this.setStatus('open');

          // flush queued messages
          if (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const q = this.messageQueue.splice(0, this.messageQueue.length);
            for (const m of q) {
              try { this.ws.send(JSON.stringify(m)); } catch (e) { console.warn('Failed to send queued WS message', e); }
            }
          }
        };

        this.ws.onclose = () => {
          this.ws = null;
          this.setStatus('closed');
          // Always refresh the token on reconnect — the old one may have expired
          if (!this.manuallyClosed) this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.warn('[WebSocket] Error:', err);
          this.setStatus('error');
          // browsers usually close after error
        };

        this.ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            for (const fn of Array.from(this.listeners)) {
              try { fn(data); } catch (e) { console.warn('ws listener error', e); }
            }
          } catch (e) {
            console.warn('Failed to parse WebSocket message:', e);
          }
        };
      } catch (e) {
        console.warn('[WebSocket] Failed to construct WS:', e);
        this.setStatus('error');
        this.scheduleReconnect();
      }
    }).catch((e) => {
      console.warn('[WebSocket] URL factory threw:', e);
      this.setStatus('error');
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const delay = Math.min(30_000, this.backoff);
    this.reconnectTimer = (globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(30_000, Math.floor(this.backoff * 1.8));
      // connect() calls urlFactory() again — always gets a fresh token
      this.connect();
    }, delay) as unknown) as number;
  }

  setStatus(status: WebSocketState['status']) {
    for (const fn of Array.from(this.statusListeners)) {
      try { fn(status); } catch (e) { console.warn('status listener error', e); }
    }
  }

  addMessageListener<T>(fn: MessageListener<T>) {
    this.listeners.add(fn as MessageListener<any>);
    return () => this.listeners.delete(fn as MessageListener<any>);
  }

  addStatusListener(fn: StatusListener) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  send(msg: unknown) {
    // If the socket is open, send immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { console.warn('Failed to send WS message', e); }
      return;
    }

    // Otherwise, enqueue the message up to the cap
    try {
      if (this.messageQueue.length >= this.queueCap) {
        // drop the oldest to make room
        this.messageQueue.shift();
      }
      this.messageQueue.push(msg);
    } catch (e) {
      console.warn('Failed to queue WS message', e);
    }
  }

  closeIfUnused() {
    if (this.listeners.size === 0 && this.statusListeners.size === 0) {
      this.manuallyClosed = true;
      if (this.reconnectTimer) { try { globalThis.clearTimeout(this.reconnectTimer); } catch {} this.reconnectTimer = null; }
      try { this.ws?.close(); } catch {}
      this.ws = null;
      // clear queued messages to free memory
      this.messageQueue.length = 0;
    }
  }
}

// Keyed by a stable identity string, not the token URL (which changes every reconnect)
const sharedMap = new Map<string, SharedWebSocket>();

/**
 * @param urlFactory  Called on every connect/reconnect attempt. Return a fresh signed WS URL
 *                    (including ?token=...) or null to abort. Using a factory instead of a
 *                    static URL ensures an expired token is never reused on reconnect.
 * @param identity    Stable key for the shared connection. Hooks sharing
 *                    the same identity share one underlying WebSocket.
 */
export function useWebSocket<T = any>(
  urlFactory: UrlFactory | null,
  identity: string | null,
  onMessage?: (message: T) => void
): WebSocketState<T> {
  const [status, setStatus] = useState<WebSocketState<T>['status']>('closed');
  const [lastMessage, setLastMessage] = useState<T & { _timestamp?: number } | undefined>(undefined);
  const sharedRef = useRef<SharedWebSocket | null>(null);
  // ref to the latest onMessage handler (optional)
  const onMessageRef = useRef<((msg: T) => void) | undefined>(undefined);

  // keep the latest handler without re-subscribing
  onMessageRef.current = onMessage ?? undefined;

  useEffect(() => {
    if (!urlFactory || !identity) return;

    let shared = sharedMap.get(identity);
    if (!shared) {
      shared = new SharedWebSocket(urlFactory);
      sharedMap.set(identity, shared);
    }
    sharedRef.current = shared;

    // status listener
    const removeStatus = shared.addStatusListener((s) => setStatus(s));

    // message listener
    const removeMsg = shared.addMessageListener<T>((msg) => {
      // prefer calling provided handler first
      try {
        onMessageRef.current?.(msg);
      } catch (e) {
        console.warn('onMessage handler error', e);
      }
      try {
        setLastMessage((msg as unknown) as T & { _timestamp: number });
        // add timestamp separately in state so we don't mutate the original message object
        setLastMessage(prev => prev ? { ...prev, _timestamp: Date.now() } : ({ ...(msg as unknown as T), _timestamp: Date.now() }));
      } catch (e) {
        console.warn('Failed to update lastMessage from websocket', e);
      }
    });

    // keep the initial status
    setStatus('connecting');

    return () => {
      removeMsg();
      removeStatus();
      // cleanup shared instance if unused
      const s = sharedRef.current;
      if (s) s.closeIfUnused();
      sharedRef.current = null;
      // remove from map if fully closed
      const current = sharedMap.get(identity);
      if (current?.listeners.size === 0 && current?.statusListeners.size === 0) {
        sharedMap.delete(identity);
      }
    };
  }, [identity, urlFactory]);

  const send = useCallback((msg: unknown) => {
    sharedRef.current?.send(msg);
  }, []);

  return {
    status,
    lastMessage,
    send,
  };
}
