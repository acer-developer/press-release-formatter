/**
 * ACER rating symbols, matched one way everywhere (key facts, traceability, consistency).
 * A symbol ends at a word boundary, so "ACER Assigns" is never read as "ACER A", and the
 * notch is part of the symbol, so "ACER AA" and "ACER AA+" are different ratings.
 */

const SYMBOL = String.raw`(?:A1\+?|A[1-4]\+?|AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|C|D)`;
const SUFFIX = String.raw`(?:\s*\((?:CE|SO)\))?`;

/** Rating notches typed with an en dash, em dash or minus sign become a plain hyphen. */
export function normaliseRatingText(s: string): string {
  return s.replace(new RegExp(String.raw`(\bACER\s+(?:AAA|AA|A|BBB|BB|B|A[1-4]))[‐‑‒–—−]`, "g"), "$1-");
}

const ratingRe = () => new RegExp(String.raw`\bACER\s+${SYMBOL}(?![+\w-])${SUFFIX}`, "g");

/** Canonical form: single spaces, upper case ("ACER  bbb-" -> "ACER BBB-"). */
export const canonicalRating = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** Every rating symbol in the text, in order, in canonical form. */
export function findRatings(text: string): string[] {
  return [...normaliseRatingText(text).matchAll(ratingRe())].map((m) => canonicalRating(m[0]));
}

export const firstRating = (text: string) => findRatings(text)[0] ?? "";
