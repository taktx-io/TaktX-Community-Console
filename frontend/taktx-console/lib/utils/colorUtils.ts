/**
 * Color utility functions for ensuring readable text colors
 */

/**
 * Darken a color for text to ensure good contrast on light backgrounds.
 * Intelligently darkens bright colors based on perceived brightness.
 *
 * @param hex - The hex color to darken (e.g., '#00ff00')
 * @returns A darkened hex color suitable for text
 */
export function hexToDarkText(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Calculate perceived brightness using luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // If color is too light, darken it significantly for text
  if (brightness > 180) {
    // Very light color - darken to 30% of original
    const dr = Math.round(r * 0.3);
    const dg = Math.round(g * 0.3);
    const db = Math.round(b * 0.3);
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  } else if (brightness > 100) {
    // Medium brightness - darken to 60%
    const dr = Math.round(r * 0.6);
    const dg = Math.round(g * 0.6);
    const db = Math.round(b * 0.6);
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  } else {
    // Already dark enough, use as is
    return hex;
  }
}

/**
 * Lighten a color for background to ensure good contrast with dark text.
 *
 * @param hex - The hex color to lighten (e.g., '#0000ff')
 * @returns A lightened hex color suitable for backgrounds
 */
export function hexToLightBackground(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Lighten by blending with white (80% color + 20% white)
  const lr = Math.round(r * 0.8 + 255 * 0.2);
  const lg = Math.round(g * 0.8 + 255 * 0.2);
  const lb = Math.round(b * 0.8 + 255 * 0.2);

  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

