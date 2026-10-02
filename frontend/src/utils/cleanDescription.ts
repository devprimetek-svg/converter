/**
 * Client-side utility to clean part description.
 * Rule: Do not extract/display (.) (-) (_) (,) characters.
 * Also strips unicode dashes and collapses multiple whitespaces.
 */
export function cleanDescription(desc?: string | null): string {
  if (!desc) return '';
  return String(desc)
    .replace(/[.\-_,\u2010\u2011\u2012\u2013\u2014\u2015]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
