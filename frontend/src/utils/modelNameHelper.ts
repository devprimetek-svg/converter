/**
 * Helper functions for extracting and composing standard Yamaha model name records.
 *
 * Requirements:
 * - User only enters/edits the model name (e.g. "FASCINO 125CC DISK", "FZ-S FI", "R15 V4", "RAY ZR 125").
 * - Brand (e.g. "YAMAHA" or "YAHAMA"), Model Code (e.g. "BJPK", "BGPJ"), "Series", and Parts Name (e.g. "CYLINDER")
 *   are automatically applied according to each figure / parent row.
 *
 * Full parent record format:
 *   YAMAHA {MODEL_CODE} "{USER_MODEL}" Series {PARTS_NAME}
 * or if no user model is specified:
 *   YAMAHA {MODEL_CODE} Series {PARTS_NAME}
 */

/**
 * Detect brand name from string if explicitly present (e.g. YAMAHA or YAHAMA), otherwise fallback.
 */
export function detectBrand(val?: string | null, fallback: string = 'YAMAHA'): string {
  if (!val) return fallback;
  const s = String(val);
  if (/\bYAHAMA\b/i.test(s)) return 'YAHAMA';
  if (/\bYAMAHA\b/i.test(s)) return 'YAMAHA';
  return fallback;
}

/**
 * Extract only the vehicle/product model portion from a model name string.
 * Strips out Brand (YAMAHA/YAHAMA), Model Code (e.g. BJPK), 'Series', and Figure Heading if present.
 * Also strips surrounding quotation marks if present.
 *
 * Examples:
 *   'YAHAMA BJPK "FASCINO 125CC DISK" Series CYLINDER' -> "FASCINO 125CC DISK"
 *   'YAMAHA BJPK "FASCINO 125CC DISK" Series CYLINDER' -> "FASCINO 125CC DISK"
 *   'YAHAMA BJPK FASCINO 125CC DISK Series CYLINDER'   -> "FASCINO 125CC DISK"
 *   'YAMAHA BJPK FASCINO 125CC DISK Series CYLINDER'   -> "FASCINO 125CC DISK"
 *   '"FASCINO 125CC DISK"'                             -> "FASCINO 125CC DISK"
 *   'FASCINO 125CC DISK'                               -> "FASCINO 125CC DISK"
 *   'YAMAHA BJPK Series CYLINDER'                      -> ""
 *   'FZ-S FI'                                          -> "FZ-S FI"
 */
export function extractRawModelName(val?: string | null, modelCode: string = ''): string {
  if (!val) return '';
  let s = String(val).trim();
  if (!s) return '';

  // If it contains "Series", extract the portion immediately preceding "Series"
  const seriesMatch = s.match(/^(.*?)\s+Series\b/i);
  if (seriesMatch) {
    s = seriesMatch[1].trim();
  }

  // Strip leading Brand: YAMAHA or YAHAMA
  s = s.replace(/^(?:YAMAHA|YAHAMA)\s+/i, '').trim();

  // Strip leading modelCode if provided
  if (modelCode) {
    const escaped = modelCode.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^${escaped}(?:\\s+|$)`, 'i'), '').trim();
  }

  // Also strip any 4-char alphanumeric code followed by the model name (e.g. if code was different)
  s = s.replace(/^[A-Z0-9]{4}\s+(?=["A-Za-z0-9])/i, '').trim();

  // Strip surrounding quotes if present
  const quoteMatch = s.match(/^"([^"]+)"$/);
  if (quoteMatch) {
    s = quoteMatch[1].trim();
  }

  return s.trim();
}

/**
 * Build the full standardized parent model name record.
 * Format:
 *   YAMAHA {MODEL_CODE} "{USER_MODEL}" Series {PARTS_NAME}
 * or
 *   YAMAHA {MODEL_CODE} Series {PARTS_NAME} (if userModel is empty)
 */
export function buildComposedModelName(
  userModelOrFull?: string | null,
  modelCode: string = 'MODEL',
  figName: string = 'PARTS',
  brand: string = 'YAMAHA'
): string {
  const b = detectBrand(userModelOrFull, brand || 'YAMAHA').trim().toUpperCase();
  const mc = (modelCode || 'MODEL').trim().toUpperCase();
  const rawModel = extractRawModelName(userModelOrFull, modelCode);
  const fn = (figName || 'PARTS').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase() || 'PARTS';

  if (rawModel) {
    return `${b} ${mc} "${rawModel}" Series ${fn}`;
  }
  return `${b} ${mc} Series ${fn}`;
}
