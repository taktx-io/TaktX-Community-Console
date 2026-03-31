/**
 * Storage Helper Utilities
 *
 * Utilities for safely reading/writing to localStorage with proper type handling
 * and SSR compatibility.
 */

/**
 * Load a setting from localStorage with proper type handling
 *
 * @param key - localStorage key
 * @param fallback - Fallback value if key doesn't exist or parsing fails
 * @returns Stored value or fallback
 */
export function loadSettingFromStorage<T>(key: string, fallback: T): T {
  // SSR safety - return fallback during server-side rendering
  if (typeof window === 'undefined') return fallback;

  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;

    // Handle numeric values
    if (typeof fallback === 'number') {
      const num = Number(stored);
      return (isNaN(num) ? fallback : num) as T;
    }

    // Handle string values
    return stored as T;
  } catch {
    return fallback;
  }
}

/**
 * Save a setting to localStorage
 *
 * @param key - localStorage key
 * @param value - Value to store
 */
export function saveSettingToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn(`Failed to save setting to localStorage: ${key}`, error);
  }
}

/**
 * Remove a setting from localStorage
 *
 * @param key - localStorage key
 */
export function removeSettingFromStorage(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove setting from localStorage: ${key}`, error);
  }
}

/**
 * Check if localStorage is available
 *
 * @returns true if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

