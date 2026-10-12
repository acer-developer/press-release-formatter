import { deriveKeyFacts, findColumn, parseNumber, sumColumn } from "@/lib/note/derive";
import type { Issue, NoteTable, RatingNote } from "@/lib/note/schema";
import { checkStyle } from "@/lib/note/style";
import { findRatings } from "@/lib/note/rating";

/**
 * Anti-hallucination and consistency checks. All checks are deterministic:
 *  - traceability: every figure, rating symbol and proper name in the note must appear in the source
 *  - grounding: sentences whose wording has little support in the source are flagged for review
 *  - coverage: figures in the source that the note dropped (for AI drafts)
 *  - arithmetic: totals and margins must reconcile with their components
 *  - completeness: mandatory press-release sections and fields must be present
 */

// Numbers may carry a unit suffix ("1.4x", "12%"), but not other letters ("FY26", "Q1").
const NUM_RE = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\dA-WYZa-wyz])/g;

/** Canonical form for numbers: strip grouping, trailing zeros ("12.50" == "12.5"). */
export function canonicalNumber(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 1e6) / 1e6);
}

/** Separates currency prefixes from figures ("INR1,300", "Rs.25") so the figure is checked. */
const prepNumbers = (s: string) => s.replace(/(INR|Rs\.?|₹|USD|\$)\s*(?=\d)/gi, "$1 ");

export function numberSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of prepNumbers(text).matchAll(NUM_RE)) out.add(canonicalNumber(m[0]));
  return out;
}

/**
 * Figures available in the source: standalone numbers plus digits inside labels ("FY2025",
 * "Q1FY27"), so a note that writes "2025" or "27" is not flagged when the source has them.
 */
export function sourceNumberSet(text: string): Set<string> {
  const out = numberSet(text);
  for (const m of prepNumbers(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(canonicalNumber(m[0]));
  return out;
}


/**
 * Every figure is checked, including small counts and years: "25 years of experience" or
 * "incorporated in 2008" must come from the source like any amount. Day numbers inside dates
 * pass naturally because the source contains the same dates.
 */

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
  const sourceNumbers = sourceNumberSet(sourceText);
  // Ratings must match a source symbol exactly, notch included ("ACER AA" is not "ACER AA+").
  const sourceRatings = new Set(findRatings(sourceText));
  const reported = new Set<string>();

  for (const { text, blockId } of noteTexts(note)) {
    for (const m of prepNumbers(text).matchAll(NUM_RE)) {
      const canon = canonicalNumber(m[0]);
      if (sourceNumbers.has(canon)) continue;
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
    for (const rating of findRatings(text)) {
      if (sourceRatings.has(rating)) continue;
      const key = `${rating}|${blockId ?? ""}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({
        severity: "error",
        code: "untraced-rating",
        message: `Rating "${rating}" is not in the source. Ratings are never changed automatically; it needs analyst confirmation.`,
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

// ── Grounding: proper names and unsupported sentences ───────────────────────────────────────
const STOP = new Set(
  "the and for with that this from have has had are was were been being into over under their its they them than then also such which while where when within without upon about after before between during through other others more most less very much many some each every both either neither will would could should shall may might must can company companies rating ratings acer credit".split(" ")
);
/** Words the templates and section names use; never treated as invented names. */
const KNOWN_NAMES = /^(Credit|Rating|Key|Brief|Summary|Analytical|Approach|Liquidity|About|Applicable|Criteria|Annexure|Press|Release|Positive|Negative|Long|Short|Term|Stable|Outlook|Non|Convertible|Debentures?|Total|Rated|Limits?|Financial|Indicators?|Any|Other|Information|Strengths?|Weakness(es)?|Sensitivit(y|ies)|India|Indian|The|Private|Limited|Ltd|Pvt|Proposed|Assigned|Reaffirmed)$/;

const words = (s: string) => s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
const stem = (w: string) => w.replace(/(ies|es|s|ed|ing|ly)$/, "");

function proseTexts(note: RatingNote): { text: string; blockId: string }[] {
  const out: { text: string; blockId: string }[] = [];
  for (const s of note.sections)
    for (const b of s.blocks) {
      if (b.type === "paragraph") out.push({ text: b.text, blockId: b.id });
      else if (b.type === "driver") out.push({ text: b.text, blockId: b.id });
      else if (b.type === "bullets") for (const it of [b.intro, ...b.items]) if (it) out.push({ text: it, blockId: b.id });
    }
  return out;
}

export function checkGrounding(note: RatingNote, sourceText: string): Issue[] {
  if (!sourceText.trim()) return [];
  const issues: Issue[] = [];
  const srcLower = sourceText.toLowerCase().replace(/\s+/g, " ");
  const srcStems = new Set(words(sourceText).map(stem));
  const reported = new Set<string>();

  for (const { text, blockId } of proseTexts(note)) {
    // Proper names: runs of two or more capitalised words that the source never mentions.
    // Words are joined only by spaces on one line, never across sentences or paragraphs.
    for (const m of text.matchAll(/\b([A-Z][a-zA-Z&]+(?:[ \t]+(?:of[ \t]+|and[ \t]+|&[ \t]+)?[A-Z][a-zA-Z&]+)+)\b/g)) {
      const name = m[1].trim();
      const parts = name.split(/\s+/).filter((p) => !/^(of|and|&)$/.test(p));
      if (parts.every((p) => KNOWN_NAMES.test(p))) continue;
      if (/\bACER\b/.test(name)) continue; // the agency's own name and products
      if (srcLower.includes(name.toLowerCase())) continue;
      const key = `n|${name}|${blockId}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({ severity: "warning", code: "untraced-name", message: `"${name}" is not mentioned in the source document. Check the name.`, blockId });
    }
    // Sentences whose content words are mostly absent from the source.
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      const content = words(sentence).filter((w) => !STOP.has(w));
      if (content.length < 6) continue;
      const supported = content.filter((w) => srcStems.has(stem(w))).length / content.length;
      if (supported >= 0.55) continue;
      const key = `s|${blockId}|${sentence.slice(0, 40)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({
        severity: "warning",
        code: "unsupported-sentence",
        message: `Little support in the source for: "${sentence.length > 110 ? `${sentence.slice(0, 110)}...` : sentence}"`,
        blockId,
      });
    }
  }
  return issues;
}

/** Figures in the source that the note does not use; a signal that an AI draft dropped facts. */
export function checkCoverage(note: RatingNote, sourceText: string): Issue[] {
  if (!sourceText.trim()) return [];
  const used = new Set<string>();
  for (const { text } of noteTexts(note)) for (const n of numberSet(text)) used.add(n);
  const missing = [...numberSet(sourceText)].filter((n) => !used.has(n) && !/^(19|20)\d\d$/.test(n) && Number(n) > 31);
  if (!missing.length) return [];
  return [
    {
      severity: "info",
      code: "dropped-figures",
      message: `${missing.length} figure${missing.length > 1 ? "s" : ""} in the source ${missing.length > 1 ? "are" : "is"} not used in the note (for example ${missing.slice(0, 6).join(", ")}). Check nothing material was left out.`,
    },
  ];
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
      note.instruments.rows.flatMap((r) => findRatings(r[ratingCol] ?? "").slice(0, 1))
    );
    const headlineSymbol = findRatings(note.meta.headline)[0];
    if (headlineSymbol && symbols.size && !symbols.has(headlineSymbol))
      issues.push({ severity: "error", code: "rating-conflict", message: `The headline says ${headlineSymbol} but the instruments table says ${[...symbols].join(", ")}.` });
  }
  if (!note.contacts.length) issues.push({ severity: "info", code: "missing-contacts", message: "No analyst contacts." });
  return issues;
}

export interface VerifyOptions {
  /** Run the omission check; meaningful for AI drafts (the rules engine copies everything). */
  coverage?: boolean;
}

export function verifyNote(note: RatingNote, sourceText: string, opts: VerifyOptions = {}): Issue[] {
  const order = { error: 0, warning: 1, info: 2 };
  return [
    ...checkTraceability(note, sourceText),
    ...checkGrounding(note, sourceText),
    ...(opts.coverage ? checkCoverage(note, sourceText) : []),
    ...checkArithmetic(note),
    ...checkCompleteness(note),
    ...checkStyle(note),
  ].sort(
    (a, b) => order[a.severity] - order[b.severity]
  );
}
