"use client";

// No-op in Community mode (kept for compatibility with existing imports).
export function invalidateSessionCache() {}

interface AuthFetchOptions extends RequestInit {
  requireAuth?: boolean;
  autoRedirect?: boolean; // Whether to auto-redirect on 401/403 (default: false)
}

/**
 * Client-side wrapper around fetch() that automatically adds JWT token from session.
 * Can optionally redirect to login on 401/403 responses.
 *
 * NOTE: This is a client-side only utility. Use only in client components.
 */
export async function authFetch(
  url: string,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { requireAuth: _requireAuth = true, autoRedirect: _autoRedirect = false, ...fetchOptions } = options;
  return fetch(url, fetchOptions);
}

/**
 * Helper for making authenticated GET requests
 */
export async function authGet(url: string, options?: AuthFetchOptions) {
  return authFetch(url, { ...options, method: "GET" });
}

/**
 * Helper for making authenticated POST requests
 */
export async function authPost(
  url: string,
  body?: any,
  options?: AuthFetchOptions
) {
  return authFetch(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper for making authenticated PUT requests
 */
export async function authPut(
  url: string,
  body?: any,
  options?: AuthFetchOptions
) {
  return authFetch(url, {
    ...options,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper for making authenticated DELETE requests
 */
export async function authDelete(url: string, options?: AuthFetchOptions) {
  return authFetch(url, { ...options, method: "DELETE" });
}

/**
 * Debug helper: Check session and token status
 * Usage in browser console:
 *   const { debugAuth } = await import('./lib/authFetch');
 *   await debugAuth();
 */
export async function debugAuth() {
  const info = { mode: 'community-no-auth' };
  console.log('[authFetch] Debug info:', info);
  return info;
}

