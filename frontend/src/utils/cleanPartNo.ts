/**
 * Clean a Yamaha part number according to catalog rules:
 * - Remove dashes (hyphens, en-dashes, em-dashes) and spaces.
 * - Add '00' only if the cleaned number is exactly 10 characters long.
 * - Leave 12-character (colored/painted) or other length part numbers unchanged.
 */
export function cleanPartNumber(partNo: string): string {
  if (!partNo) return '';
  const cleaned = partNo.replace(/[\s\-\u2010\u2011\u2012\u2013\u2014\u2015]/g, '');
  if (cleaned.length === 10) {
    return cleaned + '00';
  }
  return cleaned;
}
