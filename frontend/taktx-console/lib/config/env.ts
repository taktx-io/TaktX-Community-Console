/**
 * Environment Configuration
 *
 * Phase 3: BFF Architecture
 * - All API calls go through Platform Service (port 8080)
 * - Platform Service acts as BFF and routes to correct ingester
 * - No direct ingester access from frontend
 */

// Platform Service URL (BFF - single API entry point)
export const PLATFORM_SERVICE_URL = (() => {
  const envUrl = process.env.NEXT_PUBLIC_PLATFORM_SERVICE_URL;

  // Empty string or undefined = relative URLs (default for nginx/ALB reverse proxy)
  if (envUrl === '' || envUrl === undefined) {
    if (typeof window !== 'undefined') {
      console.log('[TaktX Config] Using relative URLs (reverse proxy mode)');
    }
    return '';
  }

  // Explicit URL provided (for local development without proxy)
  if (envUrl) {
    if (typeof window !== 'undefined') {
      console.log('[TaktX Config] Platform Service URL:', envUrl);
    }
    return envUrl;
  }

  // Should never reach here
  return '';
})();

// Deprecated: Direct ingester URLs (Phase 2 and earlier)
// These are no longer used - kept for backward compatibility during transition
export const TAKTX_BACKEND_URL = PLATFORM_SERVICE_URL; // Alias for compatibility
export const TAKTX_WS_URL =
  process.env.NEXT_PUBLIC_TAKTX_WS_URL === '' || process.env.NEXT_PUBLIC_TAKTX_WS_URL === '/ws'
    ? (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
        : '/ws')
    : process.env.NEXT_PUBLIC_TAKTX_WS_URL || (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
        : '/ws');

// Application release version — injected at build time via NEXT_PUBLIC_APP_VERSION.
// Falls back to the shared development version when running locally without the env var set.
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-dev';

