/**
 * Clean remarks text by removing catalog abbreviation words like UR, AB, YB.
 * Cleans up orphaned punctuation, parentheses, and extra whitespace.
 */
export function cleanRemarks(remarks: string | undefined | null): string {
  if (!remarks) return '';
  let cleaned = String(remarks).replace(/\b(UR|AB|YB)\b/gi, '');
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/[,/\\|\-–—]\s*[,/\\|\-–—]+/g, ' ');
  cleaned = cleaned.replace(/^[\s,/\-\–—.:;]+|[\s,/\-\–—.:;]+$/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z0-9]/.test(cleaned)) {
    return '';
  }
  return cleaned;
}
