import { deriveKeyFacts, financialSeries, parseNumber, type KeyFacts } from "./derive";
import type { NoteTable, RatingNote } from "./schema";

/**
 * The briefing: what the template covers and summary pages show. Everything is selected from the
 * note (first sentences, driver titles, triggers); the only additions are counts and
 * year-on-year arithmetic on the note's own figures.
 */

export interface Driver {
  tone: "s" | "w";
  title: string;
  text: string;
}

export interface Kpi {
  label: string;
  value: string;
  period: string;
  change: string;
  good: boolean;
}

export interface Briefing {
  facts: KeyFacts;
  keyMessages: string[];
  strengths: Driver[];
  weaknesses: Driver[];
  drivers: Driver[];
  upside: string[];
  downside: string[];
  liquidity: string;
  fin: ReturnType<typeof financialSeries>;
  finTable: NoteTable | null;
  kpis: Kpi[];
}

export const firstSentence = (t: string) => (t.match(/^.+?[.](?=\s+[A-Z(]|$)/)?.[0] ?? t).trim();
export const tidyItem = (s: string) => s.replace(/,?\s+(and|a)$/i, "").replace(/[;,]\s*$/, "");

export function buildBriefing(note: RatingNote): Briefing {
  const sec = (re: RegExp) => note.sections.find((s) => re.test(s.title));
  const summary = sec(/summary|rating action|rationale/i);
  const keyMessages = (summary?.blocks ?? []).flatMap((b) => (b.type === "paragraph" ? [firstSentence(b.text)] : [])).slice(0, 3);

  const drivers: Driver[] = [];
  let tone: "s" | "w" = "s";
  for (const b of sec(/key rating drivers|rating drivers/i)?.blocks ?? []) {
    if (b.type === "subheading") tone = /weak/i.test(b.text) ? "w" : "s";
    if (b.type === "driver") drivers.push({ tone, title: b.title, text: b.text });
  }

  const upside: string[] = [];
  const downside: string[] = [];
  let mode: "up" | "down" = "up";
  for (const b of sec(/sensitivit/i)?.blocks ?? []) {
    if (b.type === "subheading") mode = /neg/i.test(b.text) ? "down" : "up";
    if (b.type === "driver" && /positive|negative/i.test(b.title)) {
      mode = /neg/i.test(b.title) ? "down" : "up";
      // Sensitivities written as a single paragraph ("Positive factors: ...") count as one trigger.
      if (b.text && !/^factors that could/i.test(b.text)) (mode === "up" ? upside : downside).push(b.text);
    }
    if (b.type === "bullets") (mode === "up" ? upside : downside).push(...b.items);
  }

  const liq = sec(/liquidity/i);
  const liquidity = liq?.title.split(":")[1]?.trim() ?? "";

  const finBlock = note.sections.flatMap((s) => s.blocks).find((b) => b.type === "table" && financialSeries(b.table));
  const finTable = finBlock && finBlock.type === "table" ? finBlock.table : null;
  const fin = finTable ? financialSeries(finTable) : null;

  const kpis: Kpi[] = [];
  if (finTable && fin) {
    const years = fin.periods.map((p, i) => ({ p, i })).filter((x) => !/Q\d|H\d|9M|6M/i.test(x.p));
    const pick = (re: RegExp, label: string, kind: "amount" | "pct" | "x") => {
      const row = finTable.rows.find((r) => re.test(r[0] ?? ""));
      if (!row || years.length < 1) return;
      const last = years[years.length - 1];
      const prev = years.length >= 2 ? years[years.length - 2] : null;
      const vb = parseNumber(row[last.i + 1] ?? "");
      if (vb === null) return;
      const va = prev ? parseNumber(row[prev.i + 1] ?? "") : null;
      let change = "";
      let good = true;
      if (va !== null && prev) {
        if (kind === "amount" && va !== 0) {
          const pct = ((vb - va) / Math.abs(va)) * 100;
          change = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs ${prev.p}`;
          good = pct >= 0;
        } else if (kind === "pct") {
          const bps = Math.round((vb - va) * 100);
          change = `${bps >= 0 ? "+" : ""}${bps} bps vs ${prev.p}`;
          good = bps >= 0;
        } else {
          change = `${prev.p}: ${row[prev.i + 1]}`;
          good = vb <= va;
        }
      }
      kpis.push({ label, value: row[last.i + 1], period: last.p, change, good });
    };
    pick(/^(total\s+)?(revenue|total income|operating income|net sales|income from operations)/i, fin.revenueLabel || "Revenue", "amount");
    pick(/^(ebitda|operating profit|pbt)\s*\(/i, "EBITDA", "amount");
    pick(/^(pat|profit after tax|net profit)/i, "Profit after tax", "amount");
    pick(/^ebitda margin/i, "EBITDA margin", "pct");
    pick(/leverage|gearing|debt\s*\/\s*equity/i, "Leverage", "x");
    pick(/^(crar|capital adequacy)/i, "CRAR", "pct");
  }

  return {
    facts: deriveKeyFacts(note),
    keyMessages,
    drivers,
    strengths: drivers.filter((d) => d.tone === "s"),
    weaknesses: drivers.filter((d) => d.tone === "w"),
    upside,
    downside,
    liquidity,
    fin,
    finTable,
    kpis: kpis.slice(0, 4),
  };
}

