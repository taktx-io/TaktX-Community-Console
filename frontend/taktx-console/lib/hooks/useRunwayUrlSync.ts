import React, { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App } from 'antd';
import { sanitizeRunwayParams, logSecurityValidation, createSafeRunwayUrl } from '@/lib/utils/urlParamSanitizer';
import type { ProcessDefinitionVersionInfo } from '@/lib/api/runwayApi';

/**
 * Parameters for URL sync hook
 */
interface UseRunwayUrlSyncParams {
  // State setters
  setSelectedDefinitionId: (id: string | null) => void;
  setSelectedVersion: (version: number | null) => void;
  setSelectedInstanceId: (id: string | null) => void;
  setSelectedStates: (states: string[]) => void;

  // Current state values
  selectedDefinitionId: string | null;
  selectedVersion: number | null;
  selectedInstanceId: string | null;
  selectedStates: string[];

  // Refs for pending values
  pendingVersionRef: React.MutableRefObject<number | null>;
  pendingInstanceIdRef: React.MutableRefObject<string | null>;

  // Current versions state (for smart version application on popstate)
  versions: ProcessDefinitionVersionInfo[];
  versionsOwner: string | null;
}

/**
 * Custom hook to manage URL state synchronization for Runway page
 *
 * This hook implements a clean unidirectional data flow:
 * - URL params are read ONCE on initial mount
 * - State changes push to URL (state is source of truth)
 * - Browser back/forward reads from URL via popstate event
 *
 * Key features:
 * - Prevents infinite sync loops
 * - Handles browser navigation correctly
 * - Smart version application (direct if loaded, pending if not)
 * - Shareable link generation
 *
 * @param params - Configuration object with state and setters
 * @returns handleShareLink callback for copying current URL
 */
export function useRunwayUrlSync({
  setSelectedDefinitionId,
  setSelectedVersion,
  setSelectedInstanceId,
  setSelectedStates,
  selectedDefinitionId,
  selectedVersion,
  selectedInstanceId,
  selectedStates,
  pendingVersionRef,
  pendingInstanceIdRef,
  versions,
  versionsOwner,
}: UseRunwayUrlSyncParams) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();

  // Track if we're currently syncing state from URL (prevents sync loop)
  const isSyncingFromUrlRef = useRef<boolean>(false);
  // Track if initial URL params have been loaded
  const hasLoadedInitialUrlRef = useRef<boolean>(false);
  // Initialize state from URL parameters ONCE on mount
  useEffect(() => {
    if (!hasLoadedInitialUrlRef.current) {
      const { params, errors, hasErrors } = sanitizeRunwayParams(searchParams);

      if (hasErrors) {
        logSecurityValidation(searchParams, errors);
        message.warning('Some URL parameters were invalid and have been ignored');
      }

      // Set flag BEFORE updating state to prevent URL update effect from running
      isSyncingFromUrlRef.current = true;

      // Apply sanitized parameters to state
      setSelectedDefinitionId(params.definitionId);
      if (params.version !== null) {
        pendingVersionRef.current = params.version;
      }
      if (params.instanceId) {
        pendingInstanceIdRef.current = params.instanceId;
      }
      setSelectedStates(params.states);

      hasLoadedInitialUrlRef.current = true;

      // Clear sync flag after React finishes updating state
      setTimeout(() => {
        isSyncingFromUrlRef.current = false;
      }, 0);
    }
  }, [searchParams, message, setSelectedDefinitionId, setSelectedStates, pendingVersionRef, pendingInstanceIdRef]);

  // Sync URL when state changes (state is source of truth)
  useEffect(() => {
    // Skip if we haven't loaded initial URL yet
    if (!hasLoadedInitialUrlRef.current) return;

    // Skip if we're currently syncing state FROM url (prevents loop)
    if (isSyncingFromUrlRef.current) return;

    // Create URL from current state
    const newUrl = createSafeRunwayUrl({
      definitionId: selectedDefinitionId,
      version: selectedVersion,
      instanceId: selectedInstanceId,
      states: selectedStates,
    });

    const currentPath = window.location.pathname + window.location.search;

    // Only push if URL actually changed
    if (newUrl !== currentPath) {
      router.push(newUrl, { scroll: false });
    }
  }, [selectedDefinitionId, selectedVersion, selectedInstanceId, selectedStates, router]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (!hasLoadedInitialUrlRef.current) return;

    const handlePopState = () => {
      // User clicked browser back/forward - sync state from URL
      // IMPORTANT: Read URL params directly from window.location, not from searchParams hook
      // The searchParams hook may not have updated yet when popstate fires
      const currentSearchParams = new URLSearchParams(window.location.search);
      const { params } = sanitizeRunwayParams(currentSearchParams);

      console.log('[PopState] Browser navigation detected, applying URL params:', params);

      // Set flag to prevent URL update effect from running
      isSyncingFromUrlRef.current = true;

      // Apply URL parameters to state
      setSelectedDefinitionId(params.definitionId);

      if (params.version !== null) {
        // Check if versions are already loaded for this definition
        if (params.definitionId === versionsOwner && versions.length > 0) {
          // Versions already loaded - apply version directly
          if (versions.some(v => v.version === params.version)) {
            console.log('[PopState] Versions already loaded, applying version directly:', params.version);
            setSelectedVersion(params.version);
          } else {
            console.warn('[PopState] Version not found in loaded versions:', params.version);
            setSelectedVersion(null);
          }
        } else {
          // Versions not loaded yet - use pending mechanism
          console.log('[PopState] Versions not loaded, setting pending version:', params.version);
          pendingVersionRef.current = params.version;
        }
      } else {
        setSelectedVersion(null);
      }

      if (params.instanceId) {
        pendingInstanceIdRef.current = params.instanceId;
      } else {
        setSelectedInstanceId(null);
      }
      setSelectedStates(params.states);

      // Clear sync flag after state updates
      setTimeout(() => {
        isSyncingFromUrlRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    versions,
    versionsOwner,
    setSelectedDefinitionId,
    setSelectedVersion,
    setSelectedInstanceId,
    setSelectedStates,
    pendingVersionRef,
    pendingInstanceIdRef,
  ]);

  // Handler to copy shareable link to clipboard
  const handleShareLink = () => {
    try {
      const url = new URL(window.location.href);
      navigator.clipboard.writeText(url.toString()).then(() => {
        message.success('Link copied to clipboard!');
      }).catch((err) => {
        console.warn('Failed to copy link', err);
        message.error('Failed to copy link');
      });
    } catch (e) {
      console.warn('handleShareLink error', e);
      message.error('Failed to copy link');
    }
  };

  return { handleShareLink };
}

