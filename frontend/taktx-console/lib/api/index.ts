import {TAKTX_BACKEND_URL} from '../config/env';

/**
 * Fetch JSON from an API endpoint with authentication.
 * @param path - API path (e.g., '/processdefinitions')
 * @param init - Fetch options
 * @param baseUrl - Optional base URL (for dynamic ingester routing). Defaults to TAKTX_BACKEND_URL.
 */
export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  baseUrl?: string | null
): Promise<T> {
  const url = baseUrl || TAKTX_BACKEND_URL;

  if (!url) {
    throw new Error('No base URL available. Configure the backend URL.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${url}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'include', // Send authentication cookies
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch text from an API endpoint with authentication.
 * @param path - API path
 * @param init - Fetch options
 * @param baseUrl - Optional base URL (for dynamic ingester routing). Defaults to TAKTX_BACKEND_URL.
 */
export async function fetchText(
  path: string,
  init?: RequestInit,
  baseUrl?: string | null
): Promise<string> {
  const url = baseUrl || TAKTX_BACKEND_URL;

  if (!url) {
    throw new Error('No base URL available. Configure the backend URL.');
  }

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> ?? {}),
  };


  const res = await fetch(`${url}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'include', // Send authentication cookies
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.text();
}



