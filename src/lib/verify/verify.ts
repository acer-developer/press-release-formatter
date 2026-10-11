import { deriveKeyFacts, findColumn, parseNumber, sumColumn } from "@/lib/note/derive";
import type { Issue, NoteTable, RatingNote } from "@/lib/note/schema";
import { checkStyle } from "@/lib/note/style";

/**
 * Anti-hallucination and consistency checks. All checks are deterministic:
 *  - traceability: every figure and rating symbol in the note must appear in the source text
 *  - arithmetic: totals and margins must reconcile with their components
 *  - completeness: mandatory press-release sections and fields must be present
 */

const NUM_RE = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\w])/g;
const RATING_SYMBOL_RE = /\bACER\s+(?:A1\+?|A[1-4]\+?|AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|C|D)(?![+\w-])/g;

/** Canonical form for numbers: strip grouping, trailing zeros ("12.50" == "12.5"). */
export function canonicalNumber(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 1e6) / 1e6);
}

export function numberSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUM_RE)) out.add(canonicalNumber(m[0]));
  return out;
}

const normalise = (s: string) => s.replace(/\s+/g, " ").toUpperCase();

/** Numbers that are safe to ignore: small ordinals/list indices and calendar years. */
const isTrivial = (canon: string) => {
  const n = Number(canon);
  return (Number.isInteger(n) && n >= 0 && n <= 31) || (Number.isInteger(n) && n >= 1990 && n <= 2100);
};

function noteTexts(note: RatingNote): { text: string; blockId?: string }[] {
  const out: { text: string; blockId?: string }[] = [
    { text: note.meta.headline },
    { text: note.meta.date },
    { text: note.meta.companyName },
  ];
  const tableTexts = (t: NoteTable, blockId?: string) => {
    for (const r of [t.columns, ...t.rows, ...(t.totalRow ? [t.totalRow] : [])]) out.push({ text: r.join(" | "), blockId });
    for (const f of t.footnotes) out.push({ text: f, blockId });
    if (t.source) out.push({ text: t.source, blockId });
  };
  if (note.instruments) tableTexts(note.instruments, "instruments");
  for (const s of note.sections) {
    out.push({ text: s.title });
    for (const b of s.blocks) {
      if (b.type === "paragraph" || b.type === "subheading") out.push({ text: b.text, blockId: b.id });
      else if (b.type === "driver") out.push({ text: `${b.title} ${b.text}`, blockId: b.id });
      else if (b.type === "bullets") out.push({ text: [b.intro, ...b.items].join(" "), blockId: b.id });
      else tableTexts(b.table, b.id);
    }
  }
  for (const c of note.contacts) out.push({ text: `${c.name} ${c.phone} ${c.email}` });
  return out;
}

export function checkTraceability(note: RatingNote, sourceText: string): Issue[] {
  if (!sourceText.trim()) return [];
  const issues: Issue[] = [];
  const sourceNumbers = numberSet(sourceText);
  const sourceUpper = normalise(sourceText);
  const reported = new Set<string>();

  for (const { text, blockId } of noteTexts(note)) {
    for (const m of text.matchAll(NUM_RE)) {
      const canon = canonicalNumber(m[0]);
      if (isTrivial(canon) || sourceNumbers.has(canon)) continue;
      const key = `${canon}|${blockId ?? ""}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({
        severity: "error",
        code: "untraced-number",
        message: `"${m[0]}" does not appear in the source document. Confirm it or remove it.`,
        blockId,
      });
    }
    for (const m of text.matchAll(RATING_SYMBOL_RE)) {
      if (sourceUpper.includes(normalise(m[0]))) continue;
      const key = `${m[0]}|${blockId ?? ""}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({
        severity: "error",
        code: "untraced-rating",
        message: `Rating "${m[0]}" is not in the source. Ratings are never changed automatically; it needs analyst confirmation.`,
        blockId,
      });
    }
  }
  return issues;
}

function checkTableArithmetic(t: NoteTable, blockId: string): Issue[] {
  const issues: Issue[] = [];
  // Totals reconcile with the rows above them.
  if (t.totalRow) {
    t.columns.forEach((_, i) => {
      const stated = parseNumber(t.totalRow![i] ?? "");
      if (stated === null || i === 0) return;
      const sum = sumColumn(t.rows, i);
      if (sum !== null && Math.abs(sum - stated) > 0.011) {
        issues.push({
          severity: "error",
          code: "total-mismatch",
          message: `"${t.columns[i]}": the rows add up to ${sum.toFixed(2)} but the total row says ${t.totalRow![i]}.`,
          blockId,
        });
      }
    });
  }
  // Margin rows reconcile with their numerator and denominator rows.
  const row = (re: RegExp) => t.rows.find((r) => re.test(r[0] ?? ""));
  const revenue = row(/^(total\s+)?(revenue|total income|operating income|net sales)/i);
  const pairs: [RegExp, RegExp, string][] = [
    [/^ebitda\s*\(/i, /^ebitda margin/i, "EBITDA margin"],
    [/^pat\s*\(|^profit after tax/i, /^pat margin/i, "PAT margin"],
  ];
  for (const [numRe, marginRe, label] of pairs) {
    const num = row(numRe);
    const margin = row(marginRe);
    if (!revenue || !num || !margin) continue;
    for (let i = 1; i < t.columns.length; i++) {
      const r = parseNumber(revenue[i] ?? "");
      const n = parseNumber(num[i] ?? "");
      const m = parseNumber(margin[i] ?? "");
      if (r === null || n === null || m === null || r === 0) continue;
      const computed = (n / r) * 100;
      if (Math.abs(computed - m) > 0.15) {
        issues.push({
          severity: "warning",
          code: "margin-mismatch",
          message: `${label} for ${t.columns[i]} is stated as ${margin[i]}, but the table's own figures give ${computed.toFixed(2)}%.`,
          blockId,
        });
      }
    }
  }
  return issues;
}

export function checkArithmetic(note: RatingNote): Issue[] {
  const issues: Issue[] = [];
  if (note.instruments) issues.push(...checkTableArithmetic(note.instruments, "instruments"));
  for (const s of note.sections) for (const b of s.blocks) if (b.type === "table") issues.push(...checkTableArithmetic(b.table, b.id));
  return issues;
}

const REQUIRED_SECTIONS: [RegExp, string][] = [
  [/rating action|brief summary/i, "Brief Summary of the Rating Action"],
  [/analytical approach/i, "Analytical Approach"],
  [/key rating drivers/i, "Key Rating Drivers"],
  [/liquidity/i, "Liquidity"],
  [/sensitivit/i, "Rating Sensitivities"],
  [/about the company/i, "About the Company"],
  [/criteria/i, "Applicable Rating Criteria"],
];

export function checkCompleteness(note: RatingNote): Issue[] {
  const issues: Issue[] = [];
  if (!note.meta.companyName) issues.push({ severity: "error", code: "missing-company", message: "Company name is missing." });
  if (!note.meta.date && note.options?.dateMode !== "none") issues.push({ severity: "warning", code: "missing-date", message: "Publication date is missing. Add a date or choose No date." });
  if (!note.meta.headline) issues.push({ severity: "warning", code: "missing-headline", message: "Headline (the rating action line) is missing." });
  if (!note.instruments || !note.instruments.rows.length)
    issues.push({ severity: "warning", code: "missing-instruments", message: "The instruments table is empty." });
  for (const [re, name] of REQUIRED_SECTIONS) {
    if (!note.sections.some((s) => re.test(s.title)))
      issues.push({ severity: "info", code: "missing-section", message: `Standard section not found: ${name}.` });
  }
  const facts = deriveKeyFacts(note);
  if (note.instruments && !facts.rating)
    issues.push({ severity: "warning", code: "no-rating", message: "No ACER rating symbol found in the headline or instruments table." });
  if (note.instruments) {
    const ratingCol = findColumn(note.instruments, /rating/i);
    const symbols = new Set(
      note.instruments.rows.map((r) => (r[ratingCol] ?? "").match(RATING_SYMBOL_RE)?.[0]).filter(Boolean) as string[]
    );
    const headlineSymbol = note.meta.headline.match(RATING_SYMBOL_RE)?.[0];
    if (headlineSymbol && symbols.size && !symbols.has(headlineSymbol))
      issues.push({ severity: "error", code: "rating-conflict", message: `The headline says ${headlineSymbol} but the instruments table says ${[...symbols].join(", ")}.` });
  }
  if (!note.contacts.length) issues.push({ severity: "info", code: "missing-contacts", message: "No analyst contacts." });
  return issues;
}

export function verifyNote(note: RatingNote, sourceText: string): Issue[] {
  const order = { error: 0, warning: 1, info: 2 };
  return [...checkTraceability(note, sourceText), ...checkArithmetic(note), ...checkCompleteness(note), ...checkStyle(note)].sort(
    (a, b) => order[a.severity] - order[b.severity]
  );
}
