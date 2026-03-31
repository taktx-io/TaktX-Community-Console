/**
 * Batch storage utilities for managing saved process instance batches in localStorage
 */

export interface BatchInfo {
  name: string;
  instanceIds: string[];
  timestamp: string; // ISO format
}

const STORAGE_KEY = 'taktx-batches';
const MAX_BATCHES = 50;

/**
 * Load all saved batches from localStorage
 * Returns array sorted by timestamp descending (newest first)
 */
export function loadBatches(): BatchInfo[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const batches = JSON.parse(stored) as BatchInfo[];
    // Sort by timestamp descending
    return batches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error('Failed to load batches from localStorage:', error);
    return [];
  }
}

/**
 * Save a new batch to localStorage
 * If batch name exists, it will be overwritten
 * Enforces FIFO eviction if MAX_BATCHES is exceeded
 */
export function saveBatch(batch: BatchInfo): void {
  try {
    let batches = loadBatches();

    // Remove existing batch with same name (overwrite)
    batches = batches.filter(b => b.name !== batch.name);

    // Add new batch
    batches.unshift(batch); // Add to beginning (newest)

    // Enforce max limit - remove oldest if exceeded
    if (batches.length > MAX_BATCHES) {
      batches = batches.slice(0, MAX_BATCHES);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  } catch (error) {
    console.error('Failed to save batch to localStorage:', error);
    throw error;
  }
}

/**
 * Delete a batch by name
 */
export function deleteBatch(name: string): void {
  try {
    const batches = loadBatches();
    const filtered = batches.filter(b => b.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete batch from localStorage:', error);
    throw error;
  }
}

/**
 * Clear all batches from localStorage
 */
export function clearAllBatches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear batches from localStorage:', error);
    throw error;
  }
}

/**
 * Check if a batch name already exists
 */
export function batchExists(name: string): boolean {
  const batches = loadBatches();
  return batches.some(b => b.name === name);
}

/**
 * Get a specific batch by name
 */
export function getBatch(name: string): BatchInfo | null {
  const batches = loadBatches();
  return batches.find(b => b.name === name) || null;
}

