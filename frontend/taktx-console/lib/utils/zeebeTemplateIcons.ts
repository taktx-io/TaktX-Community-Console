/**
 * Zeebe Template Icon Utilities
 *
 * Handles parsing, decoding, and caching of Zeebe template icons from BPMN XML.
 * Template icons are encoded as data URLs in the zeebe:modelerTemplateIcon attribute.
 */

// LRU Cache configuration
const MAX_CACHE_SIZE = 100;
const MAX_CACHE_SIZE_BYTES = 500 * 1024; // 500KB

// Cache structure
interface CacheEntry {
  templateId: string;
  svgContent: string;
  sizeBytes: number;
  lastAccessed: number;
}

class TemplateIconCache {
  private cache: Map<string, CacheEntry> = new Map();
  private totalSizeBytes: number = 0;

  get(templateId: string): string | null {
    const entry = this.cache.get(templateId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.svgContent;
    }
    return null;
  }

  set(templateId: string, svgContent: string): void {
    const sizeBytes = new Blob([svgContent]).size;

    // Check if adding this entry would exceed size limit
    if (this.totalSizeBytes + sizeBytes > MAX_CACHE_SIZE_BYTES) {
      this.evictLRU();
    }

    // Check if we've hit max entry count
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      templateId,
      svgContent,
      sizeBytes,
      lastAccessed: Date.now(),
    };

    this.cache.set(templateId, entry);
    this.totalSizeBytes += sizeBytes;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.totalSizeBytes -= entry.sizeBytes;
        this.cache.delete(oldestKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.totalSizeBytes = 0;
  }

  getStats() {
    return {
      entries: this.cache.size,
      totalSizeBytes: this.totalSizeBytes,
      maxSize: MAX_CACHE_SIZE,
      maxSizeBytes: MAX_CACHE_SIZE_BYTES,
    };
  }
}

// Global cache instance
const iconCache = new TemplateIconCache();

/**
 * Default fallback icon (gear/cog) for malformed or missing template icons
 */
export const DEFAULT_TEMPLATE_ICON = `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18' fill='none'>
  <circle cx='9' cy='9' r='8' fill='rgba(22, 119, 255, 0.1)' stroke='#1677ff' stroke-width='1.5'/>
  <path d='M9 5.5 L9 7 M9 11 L9 12.5 M5.5 9 L7 9 M11 9 L12.5 9' stroke='#1677ff' stroke-width='1.2' stroke-linecap='round'/>
  <circle cx='9' cy='9' r='2' fill='none' stroke='#1677ff' stroke-width='1.2'/>
</svg>`;

/**
 * Decodes a data URL encoded SVG icon
 * Format: data:image/svg+xml,%3Csvg...
 */
export function decodeTemplateIconDataUrl(dataUrl: string): string | null {
  try {
    // Validate data URL format
    if (!dataUrl || !dataUrl.startsWith('data:image/svg+xml,')) {
      console.warn('[ZeebeTemplateIcons] Invalid data URL format:', dataUrl?.substring(0, 50));
      return null;
    }

    // Extract the encoded SVG part (after the comma)
    const encodedSvg = dataUrl.substring('data:image/svg+xml,'.length);

    // URL decode the SVG content
    const decodedSvg = decodeURIComponent(encodedSvg);

    // Basic SVG validation
    if (!decodedSvg.includes('<svg') || !decodedSvg.includes('</svg>')) {
      console.warn('[ZeebeTemplateIcons] Decoded content is not valid SVG');
      return null;
    }

    // Sanitize SVG to prevent XSS
    return sanitizeSvg(decodedSvg);
  } catch (error) {
    console.error('[ZeebeTemplateIcons] Error decoding template icon:', error);
    return null;
  }
}

/**
 * Basic SVG sanitization to prevent XSS attacks
 * Removes script tags and event handlers
 */
function sanitizeSvg(svg: string): string {
  // Remove script tags
  let sanitized = svg.replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handler attributes (onclick, onload, etc.)
  sanitized = sanitized.replaceAll(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove javascript: protocol in attributes
  sanitized = sanitized.replaceAll(/javascript:/gi, '');

  return sanitized;
}

/**
 * Parses template icon from BPMN element business object
 * Returns cached or decoded SVG content, or default icon on failure
 */
export function getTemplateIcon(
  businessObject: any,
  useCache: boolean = true
): { svg: string; isDefault: boolean; templateId: string | null; templateVersion: string | null } {
  try {
    // Extract Zeebe template attributes
    const templateId = businessObject.$attrs?.['zeebe:modelerTemplate'];
    const templateVersion = businessObject.$attrs?.['zeebe:modelerTemplateVersion'];
    const templateIconDataUrl = businessObject.$attrs?.['zeebe:modelerTemplateIcon'];

    if (!templateId || !templateIconDataUrl) {
      // No template icon defined
      return {
        svg: DEFAULT_TEMPLATE_ICON,
        isDefault: true,
        templateId: null,
        templateVersion: null,
      };
    }

    // Check cache first
    if (useCache) {
      const cached = iconCache.get(templateId);
      if (cached) {
        return {
          svg: cached,
          isDefault: false,
          templateId,
          templateVersion,
        };
      }
    }

    // Decode the icon
    const decoded = decodeTemplateIconDataUrl(templateIconDataUrl);

    if (decoded) {
      // Cache the decoded icon
      if (useCache) {
        iconCache.set(templateId, decoded);
      }

      return {
        svg: decoded,
        isDefault: false,
        templateId,
        templateVersion,
      };
    } else {
      // Decoding failed, use default
      console.warn('[ZeebeTemplateIcons] Failed to decode icon for template:', templateId);
      return {
        svg: DEFAULT_TEMPLATE_ICON,
        isDefault: true,
        templateId,
        templateVersion,
      };
    }
  } catch (error) {
    console.error('[ZeebeTemplateIcons] Error getting template icon:', error);
    return {
      svg: DEFAULT_TEMPLATE_ICON,
      isDefault: true,
      templateId: null,
      templateVersion: null,
    };
  }
}

/**
 * Checks if a BPMN element has a Zeebe template
 */
export function hasZeebeTemplate(businessObject: any): boolean {
  return !!businessObject.$attrs?.['zeebe:modelerTemplate'];
}

/**
 * Gets template metadata for tooltip display
 */
export function getTemplateMetadata(businessObject: any): {
  templateId: string | null;
  templateVersion: string | null;
  templateName: string | null;
} {
  const templateId = businessObject.$attrs?.['zeebe:modelerTemplate'] || null;
  const templateVersion = businessObject.$attrs?.['zeebe:modelerTemplateVersion'] || null;

  // Try to extract a human-readable name from the template ID
  // Template IDs are often UUIDs, so we might not have a good name
  // Fall back to using the element name if available
  const templateName = businessObject.name || templateId;

  return {
    templateId,
    templateVersion,
    templateName,
  };
}

/**
 * Clear the icon cache (useful for testing or memory management)
 */
export function clearIconCache(): void {
  iconCache.clear();
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return iconCache.getStats();
}

