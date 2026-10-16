/**
 * Clean a Yamaha part number according to catalog rules:
 * - Remove dashes (hyphens, en-dashes, em-dashes), dots, and spaces.
 * - If exactly 10 characters, add '00' to make it 12 characters.
 * - If exactly 12 characters, leave it as 12 characters.
 * - If more than 12 characters, keep it at 12 characters (truncate to 12).
 */
export function cleanPartNumber(partNo: string): string {
  if (!partNo) return '';
  const cleaned = String(partNo).replace(/[\s\-.\u2010\u2011\u2012\u2013\u2014\u2015]/g, '');
  if (cleaned.length === 10) {
    return cleaned + '00';
  } else if (cleaned.length > 12) {
    return cleaned.slice(0, 12);
  }
  return cleaned;
}
