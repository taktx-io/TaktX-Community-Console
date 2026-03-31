/**
 * View State Storage Utility
 * Persists and restores view-specific filter settings when switching between
 * Definition Filter, Process Instance IDs, and Bookmark views
 */

const STORAGE_KEY = 'taktx-runway-view-states';

export interface DefinitionFilterState {
  processDefinitionId: string | null;
  version: number | null;
  states: string[];
  startTimeFrom: Date | null;
  startTimeTo: Date | null;
  endTimeFrom: Date | null;
  endTimeTo: Date | null;
}

export interface InstanceIdsState {
  manualInstanceIds: string[];
  mode: 'manual' | 'bookmarks'; // Track which sub-tab is active
}

export interface BookmarkState {
  selectedBookmark: string | null;
}

export interface ViewStates {
  definition: DefinitionFilterState;
  instanceIds: InstanceIdsState;
  bookmark: BookmarkState;
}

/**
 * Default empty states
 */
const DEFAULT_STATES: ViewStates = {
  definition: {
    processDefinitionId: null,
    version: null,
    states: ['ACTIVE', 'COMPLETED', 'ABORTED', 'INCIDENT'],
    startTimeFrom: null,
    startTimeTo: null,
    endTimeFrom: null,
    endTimeTo: null,
  },
  instanceIds: {
    manualInstanceIds: [],
    mode: 'manual',
  },
  bookmark: {
    selectedBookmark: null,
  },
};

/**
 * Load all view states from localStorage
 */
export function loadViewStates(): ViewStates {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_STATES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATES;

    const parsed = JSON.parse(stored);

    // Parse dates back from ISO strings
    if (parsed.definition) {
      if (parsed.definition.startTimeFrom) {
        parsed.definition.startTimeFrom = new Date(parsed.definition.startTimeFrom);
      }
      if (parsed.definition.startTimeTo) {
        parsed.definition.startTimeTo = new Date(parsed.definition.startTimeTo);
      }
      if (parsed.definition.endTimeFrom) {
        parsed.definition.endTimeFrom = new Date(parsed.definition.endTimeFrom);
      }
      if (parsed.definition.endTimeTo) {
        parsed.definition.endTimeTo = new Date(parsed.definition.endTimeTo);
      }
    }

    return {
      ...DEFAULT_STATES,
      ...parsed,
    };
  } catch (error) {
    console.error('Failed to load view states from localStorage:', error);
    return DEFAULT_STATES;
  }
}

/**
 * Save all view states to localStorage
 */
function saveViewStates(states: ViewStates): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch (error) {
    console.error('Failed to save view states to localStorage:', error);
  }
}

/**
 * Save definition filter state
 */
export function saveDefinitionFilterState(state: DefinitionFilterState): void {
  const viewStates = loadViewStates();
  viewStates.definition = state;
  saveViewStates(viewStates);
}

/**
 * Get definition filter state
 */
export function getDefinitionFilterState(): DefinitionFilterState {
  return loadViewStates().definition;
}

/**
 * Save instance IDs state
 */
export function saveInstanceIdsState(state: InstanceIdsState): void {
  const viewStates = loadViewStates();
  viewStates.instanceIds = state;
  saveViewStates(viewStates);
}

/**
 * Get instance IDs state
 */
export function getInstanceIdsState(): InstanceIdsState {
  return loadViewStates().instanceIds;
}

/**
 * Save bookmark state
 */
export function saveBookmarkState(state: BookmarkState): void {
  const viewStates = loadViewStates();
  viewStates.bookmark = state;
  saveViewStates(viewStates);
}

/**
 * Get bookmark state
 */
export function getBookmarkState(): BookmarkState {
  return loadViewStates().bookmark;
}

/**
 * Clear all view states
 */
export function clearViewStates(): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear view states from localStorage:', error);
  }
}

