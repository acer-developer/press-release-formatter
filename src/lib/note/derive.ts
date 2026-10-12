import { firstRating } from "./rating";
import type { NoteTable, RatingNote } from "./schema";

/**
 * Deterministic facts derived from the note's own content. Nothing here is invented:
 * every value is a substring of, or arithmetic on, text already in the note.
 */

export interface KeyFacts {
  rating: string;
  outlook: string;
  action: string;
  totalAmount: string;
  amountUnit: string;
}

const OUTLOOK_RE = /\b(Stable|Positive|Negative|Developing)\b/;
const ACTION_RE = /\b(Reaffirm(?:ed|s)?|Assign(?:ed|s)?|Upgrade[ds]?|Downgrade[ds]?|Withdr(?:awn|aws)|Placed on Watch|Revise[ds]?|Migrated)\b/i;

const normaliseAction = (raw: string) => {
  const w = raw.toLowerCase();
  if (w.startsWith("reaffirm")) return "Reaffirmed";
  if (w.startsWith("assign")) return "Assigned";
  if (w.startsWith("upgrade")) return "Upgraded";
  if (w.startsWith("downgrade")) return "Downgraded";
  if (w.startsWith("withdr")) return "Withdrawn";
  if (w.startsWith("revise")) return "Revised";
  return raw[0].toUpperCase() + raw.slice(1).toLowerCase();
};

/** First number in a cell; accounting negatives "(12.5)" and minus signs are read as negative. */
export const parseNumber = (s: string): number | null => {
  const t = s.replace(/,/g, "").replace(/[\u2212\u2013]/g, "-");
  const m = t.match(/(\()?\s*(-?\d+(?:\.\d+)?)\s*(\))?/);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] && m[3] ? -Math.abs(n) : n;
};

export function findColumn(table: NoteTable, re: RegExp) {
  return table.columns.findIndex((c) => re.test(c));
}

export function deriveKeyFacts(note: RatingNote): KeyFacts {
  const facts: KeyFacts = { rating: "", outlook: "", action: "", totalAmount: "", amountUnit: "" };
  const instr = note.instruments;
  const haystacks = [note.meta.headline];
  if (instr) {
    const ratingCol = findColumn(instr, /rating/i);
    if (ratingCol >= 0) haystacks.push(...instr.rows.map((r) => r[ratingCol] ?? ""));
    haystacks.push(...instr.rows.map((r) => r.join(" ")));
  }
  for (const h of haystacks) {
    if (!facts.rating) facts.rating = firstRating(h);
    if (!facts.outlook) facts.outlook = h.match(OUTLOOK_RE)?.[1] ?? "";
    if (!facts.action) {
      const a = h.match(ACTION_RE)?.[1];
      if (a) facts.action = normaliseAction(a);
    }
  }
  if (instr) {
    const amountCol = findColumn(instr, /amount|size|limit|rated/i);
    if (amountCol >= 0) {
      const unitMatch = instr.columns[amountCol].match(/\(([^)]+)\)/);
      facts.amountUnit = unitMatch ? unitMatch[1] : "";
      if (instr.totalRow?.[amountCol]) facts.totalAmount = instr.totalRow[amountCol];
      else {
        const sum = sumColumn(instr.rows, amountCol);
        if (sum !== null) facts.totalAmount = sum.toFixed(2);
      }
    }
  }
  return facts;
}

export function sumColumn(rows: string[][], col: number): number | null {
  let total = 0;
  let any = false;
  for (const r of rows) {
    const v = parseNumber(r[col] ?? "");
    if (v !== null) {
      total += v;
      any = true;
    }
  }
  return any ? Math.round(total * 100) / 100 : null;
}

export interface FinancialSeries {
  periods: string[];
  revenue: (number | null)[];
  ebitda: (number | null)[];
  unit: string;
  revenueLabel: string;
  profitLabel: string;
}

/** Revenue/EBITDA (or income/PAT for financial-sector notes) series from a financial table. */
export function financialSeries(table: NoteTable): FinancialSeries | null {
  const periods = table.columns.slice(1);
  if (!periods.length || !periods.some((p) => /(FY|Q\d|20\d\d|H\d)/i.test(p))) return null;
  const find = (re: RegExp) => table.rows.find((r) => re.test(r[0] ?? ""));
  const rev = find(/^(total\s+)?(revenue|total income|operating income|net sales|income from operations)/i);
  const prof = find(/^(ebitda|operating profit|pbt|pat|net profit|profit after tax)/i);
  if (!rev) return null;
  const toNums = (r?: string[]) => periods.map((_, i) => (r ? parseNumber(r[i + 1] ?? "") : null));
  const unit = (rev[0].match(/\(([^)]+)\)/)?.[1] ?? table.columns[0].match(/\(([^)]+)\)/)?.[1] ?? "").trim();
  const label = (r?: string[]) => (r ? r[0].replace(/\s*\([^)]*\)\s*/g, " ").trim() : "");
  return { periods, revenue: toNums(rev), ebitda: toNums(prof), unit, revenueLabel: label(rev), profitLabel: label(prof) };
}

/** Column widths (percent strings) weighted by content, shared by the PDF and the on-page editor. */
export function columnWidths(t: NoteTable): string[] {
  const all = [t.columns, ...t.rows, ...(t.totalRow ? [t.totalRow] : [])];
  const weights = t.columns.map((_, i) => {
    const longest = Math.max(0, ...all.map((r) => (r[i] ?? "").length));
    const longestWord = Math.max(0, ...all.flatMap((r) => (r[i] ?? "").split(/\s+/).map((w) => w.length)));
    return Math.min(42, Math.max(7, longest * 0.5, longestWord * 1.3));
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => `${((w / sum) * 100).toFixed(2)}%`);
}

/** ACER date style: "24th August 2026". */
export function formatAcerDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

export const showsDate = (note: RatingNote) => note.options?.dateMode !== "none" && !!note.meta.date.trim();
