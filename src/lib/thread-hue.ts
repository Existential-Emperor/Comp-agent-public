/**
 * Deterministic per-thread hue used for subtle glass tinting in the
 * sidebar entries and active chat window. Returns an HSL hue (0-360).
 * Avoids the very-blue range that conflicts with the global background.
 */
export function getThreadHue(id: string | null | undefined): number {
  if (!id) return 188; // sentinel cyan default
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  // Curated rotation across cyan / violet / magenta / amber / mint / coral / rose
  const palette = [188, 210, 258, 288, 320, 38, 158, 12, 340];
  return palette[h % palette.length];
}
