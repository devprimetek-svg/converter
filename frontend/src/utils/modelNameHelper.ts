/**
 * Helper functions for extracting and composing standard Yamaha model name records.
 *
 * Requirements:
 * - User only enters/edits the model name (e.g. "FZ-S FI", "R15 V4", "RAY ZR 125").
 * - Brand (default: "YAMAHA"), Model Code (e.g. "BGPJ"), "Series", and Parts Name (e.g. "CYLINDER HEAD")
 *   are automatically applied according to each figure / parent row.
 *
 * Full parent record format:
 *   YAMAHA {MODEL_CODE} {USER_MODEL} Series {PARTS_NAME}
 * or if no user model is specified:
 *   YAMAHA {MODEL_CODE} Series {PARTS_NAME}
 */

/**
 * Extract only the vehicle/product model portion from a model name string.
 * Strips out Brand, Model Code, 'Series', and Figure Heading if present.
 *
 * Examples:
 *   "YAMAHA BGPJ FZ-S FI Series CYLINDER HEAD" -> "FZ-S FI"
 *   "YAMAHA BGPJ Series CYLINDER HEAD" -> ""
 *   "FZ-S FI" -> "FZ-S FI"
 *   "YAMAHA FZ-S FI Series" -> "FZ-S FI"
 *   "R15 V4" -> "R15 V4"
 */
export function extractRawModelName(val?: string | null, modelCode: string = ''): string {
  if (!val) return '';
  let s = String(val).trim();

  // If it contains "Series", extract the portion immediately preceding "Series"
  const seriesMatch = s.match(/^(.*?)\s+Series\b/i);
  if (seriesMatch) {
    s = seriesMatch[1].trim();
  }

  // Strip leading "YAMAHA" (or other brand prefix)
  s = s.replace(/^YAMAHA\s+/i, '').trim();

  // Strip leading modelCode if provided
  if (modelCode) {
    const escaped = modelCode.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim();
  } else {
    // Strip standard 3-8 char alphanumeric uppercase model code if present at the start
    s = s.replace(/^[A-Z0-9]{3,8}\s+/i, '').trim();
  }

  return s.trim();
}

/**
 * Build the full standardized parent model name record.
 * Format:
 *   YAMAHA {MODEL_CODE} {USER_MODEL} Series {PARTS_NAME}
 * or
 *   YAMAHA {MODEL_CODE} Series {PARTS_NAME} (if userModel is empty)
 */
export function buildComposedModelName(
  userModelOrFull?: string | null,
  modelCode: string = 'MODEL',
  figName: string = 'PARTS',
  brand: string = 'YAMAHA'
): string {
  const b = (brand || 'YAMAHA').trim().toUpperCase();
  const mc = (modelCode || 'MODEL').trim().toUpperCase();
  const rawModel = extractRawModelName(userModelOrFull, modelCode);
  const fn = (figName || 'PARTS').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase() || 'PARTS';

  if (rawModel) {
    return `${b} ${mc} ${rawModel} Series ${fn}`;
  }
  return `${b} ${mc} Series ${fn}`;
}
