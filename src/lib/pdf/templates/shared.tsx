import React from "react";
import { Cell, Fixed, Image, Row, Svg, Table, Text, View } from "@formepdf/react";
import type { Style } from "@formepdf/react";

import { PdfGraph } from "@/components/pdf/graph/graph";
import { PdfcnThemeProvider } from "@/components/pdf/theme-provider";
import { acerTheme, brand } from "@/lib/pdf-themes/acer";
import { columnWidths, deriveKeyFacts, financialSeries, parseNumber, showsDate, type KeyFacts } from "@/lib/note/derive";
import type { NoteBlock, NoteSection, NoteTable, RatingNote } from "@/lib/note/schema";

/**
 * Building blocks shared by every template. Content helpers only select or rearrange text that
 * is already in the note; the only additions are arithmetic (year-on-year change) and counts.
 */

export interface TemplateAssets {
  logo?: string;
}

// ── Typography ──────────────────────────────────────────────────────────────────────────
export const F = { body: "Satoshi", head: "Caladea" };
export const caps: Style = { fontFamily: F.body, fontSize: 6.6, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 700 };
export const serif: Style = { fontFamily: F.head, fontWeight: 700, color: brand.heading };
export const bodyText: Style = { fontFamily: F.body, fontSize: 9, lineHeight: 1.55, color: brand.ink };
export const PAGE_W = 595.28;
export const MARGIN_X = 44;

// ── Briefing content ────────────────────────────────────────────────────────────────────
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

// ── Small primitives ─────────────────────────────────────────────────────────────────────
export const Arrow = ({ up, color, size = 6 }: { up: boolean; color: string; size?: number }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 10 10"
    style={{ marginTop: 2.6, marginRight: 6 }}
    content={up ? `<path d="M5 0 L10 10 L0 10 Z" fill="${color}"/>` : `<path d="M0 0 L10 0 L5 10 Z" fill="${color}"/>`}
  />
);

export const Square = ({ color, size = 5, radius = 0 }: { color: string; size?: number; radius?: number }) => (
  <View style={{ width: size, height: size, backgroundColor: color, borderRadius: radius, marginTop: 3.4, marginRight: 7 }} />
);

export const Pill = ({ text, tone, filled }: { text: string; tone: "good" | "warn" | "info"; filled?: boolean }) => {
  const c = tone === "good" ? brand.accent : tone === "warn" ? brand.amber : brand.primary;
  return (
    <View style={{ flexDirection: "row" }}>
      <View
        style={{
          borderWidth: filled ? 0 : 0.8,
          borderColor: c,
          backgroundColor: filled ? (tone === "warn" ? brand.amberTint : brand.greenTint) : undefined,
          borderRadius: 9,
          paddingVertical: 1.6,
          paddingHorizontal: 6,
        }}
      >
        <Text style={{ fontFamily: F.body, fontSize: 6.3, fontWeight: 700, color: tone === "warn" ? brand.amber : tone === "good" ? brand.primary : c }}>{text}</Text>
      </View>
    </View>
  );
};

export const ExhibitLabel = ({ n, title }: { n: number; title?: string }) => (
  <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 5 }} wrap={false}>
    <Text style={{ ...caps, color: brand.accent, marginRight: 7 }}>{`Exhibit ${n}`}</Text>
    {title ? <Text style={{ fontFamily: F.body, fontSize: 8.4, fontWeight: 700, color: brand.heading }}>{title}</Text> : null}
  </View>
);

// ── Tables (native Forme tables repeat the header row on every page) ─────────────────────
const isNumeric = (s: string) => /^[-(]?\s*[₹$]?\s*-?[\d,]+(\.\d+)?\s*(%|x|times)?\)?$|^[-]$/.test(s.trim());

export type TableLook = "band" | "rule" | "soft";

export function NoteTableView({ table, look = "band", compact }: { table: NoteTable; look?: TableLook; compact?: boolean }) {
  const widths = columnWidths(table).map((w) => ({ width: { fraction: Number.parseFloat(w) / 100 } }));
  const numericCol = table.columns.map((_, i) => {
    const vals = table.rows.map((r) => r[i] ?? "").filter((v) => v.trim());
    return i > 0 && vals.length > 0 && vals.filter(isNumeric).length / vals.length >= 0.6;
  });
  const fs = compact ? 7.2 : 7.8;
  const pad = { paddingVertical: compact ? 3.5 : 4.2, paddingHorizontal: 5 };
  const headBg = look === "band" ? brand.deep : look === "soft" ? brand.mist : undefined;
  const headColor = look === "band" ? "#ffffff" : brand.slate;
  return (
    <View style={{ marginBottom: 2 }}>
      <Table columns={widths as never} style={{ borderBottomWidth: 0.8, borderBottomColor: brand.deep }}>
        <Row header style={{ backgroundColor: headBg, borderBottomWidth: look === "band" ? 0 : 1.1, borderBottomColor: brand.deep }}>
          {table.columns.map((c, i) => (
            <Cell key={i} style={pad}>
              <Text style={{ fontFamily: F.body, fontSize: fs - 0.6, lineHeight: 1.3, fontWeight: 700, color: headColor, textAlign: numericCol[i] ? "right" : "left" }}>{c}</Text>
            </Cell>
          ))}
        </Row>
        {table.rows.map((r, ri) => (
          <Row key={ri} style={{ borderBottomWidth: 0.4, borderBottomColor: brand.hairline }}>
            {table.columns.map((_, i) => (
              <Cell key={i} style={pad}>
                <Text style={{ fontFamily: F.body, fontSize: fs, lineHeight: 1.38, color: i === 0 ? brand.heading : brand.ink, fontWeight: i === 0 ? 500 : 400, textAlign: numericCol[i] ? "right" : "left" }}>{r[i] ?? ""}</Text>
              </Cell>
            ))}
          </Row>
        ))}
        {table.totalRow ? (
          <Row style={{ backgroundColor: brand.tint, borderTopWidth: 0.8, borderTopColor: brand.deep }}>
            {table.columns.map((_, i) => (
              <Cell key={i} style={pad}>
                <Text style={{ fontFamily: F.body, fontSize: fs, fontWeight: 700, color: brand.heading, textAlign: numericCol[i] ? "right" : "left" }}>{table.totalRow![i] ?? ""}</Text>
              </Cell>
            ))}
          </Row>
        ) : null}
      </Table>
      {table.source ? <Text style={{ fontFamily: F.body, fontSize: 6.5, color: brand.slate, marginTop: 4 }}>{`Source: ${table.source}`}</Text> : null}
      {table.footnotes.map((f, i) => (
        <Text key={i} style={{ fontFamily: F.body, fontSize: 6.3, lineHeight: 1.4, color: brand.slate, marginTop: i === 0 && !table.source ? 4 : 1 }}>{f}</Text>
      ))}
    </View>
  );
}

// ── Charts (only drawn when the analyst switches charts on) ──────────────────────────────
export function FinanceChart({ b, width, height = 140, title = true }: { b: Briefing; width: number; height?: number; title?: boolean }) {
  const fin = b.fin;
  if (!fin) return null;
  const rev = fin.periods.map((p, i) => ({ label: p, value: fin.revenue[i] })).filter((d) => d.value !== null) as { label: string; value: number }[];
  const prof = fin.periods.map((p, i) => ({ label: p, value: fin.ebitda[i] })).filter((d) => d.value !== null) as { label: string; value: number }[];
  if (rev.length < 2) return null;
  const paired = prof.length === rev.length;
  const data = paired
    ? [
        { name: fin.revenueLabel || "Revenue", data: rev, color: brand.deep },
        { name: fin.profitLabel || "EBITDA", data: prof, color: brand.light },
      ]
    : rev.map((d) => ({ ...d, color: brand.deep }));
  return (
    <View wrap={false}>
      {title ? (
        <Text style={{ fontFamily: F.body, fontSize: 8.4, fontWeight: 700, color: brand.heading, marginBottom: 4 }}>
          {`${fin.revenueLabel || "Revenue"}${paired ? ` and ${fin.profitLabel || "EBITDA"}` : ""}${fin.unit ? ` (${fin.unit})` : ""}`}
        </Text>
      ) : null}
      <PdfcnThemeProvider theme={acerTheme}>
        <PdfGraph variant="bar" data={data as never} width={width} height={height} showValues={false} legend={paired ? "bottom" : "none"} yTicks={4} />
      </PdfcnThemeProvider>
    </View>
  );
}

// ── Running header and footer for body pages ─────────────────────────────────────────────
export function RunningHeader({ note, logo, rule = "gradient" }: { note: RatingNote; logo?: string; rule?: "gradient" | "hairline" }) {
  return (
    <Fixed position="header" style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {logo ? <Image src={logo} style={{ width: 82 }} /> : <Text style={{ ...serif, fontSize: 16 }}>ACER</Text>}
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ ...caps, color: brand.slate }}>{note.meta.companyName}</Text>
          {showsDate(note) ? <Text style={{ fontFamily: F.body, fontSize: 7, color: brand.slate, marginTop: 2 }}>{`${note.meta.documentType || "Press Release"}  |  ${note.meta.date}`}</Text> : null}
        </View>
      </View>
      <View style={{ height: rule === "gradient" ? 1.4 : 0.6, marginTop: 7, ...(rule === "gradient" ? { background: brand.gradient } : { backgroundColor: brand.hairline }) } as Style} />
    </Fixed>
  );
}

export function RunningFooter() {
  return (
    <Fixed position="footer" style={{ marginTop: 10 }}>
      <View style={{ height: 0.5, backgroundColor: brand.hairline, marginBottom: 5 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.body, fontSize: 5.9, color: brand.slate }}>ACER Credit Rating Private Limited  |  CIN: U66190HR2024PTC118388  |  SEBI Reg. No.: IN/CRA/009/2025  |  www.acerratings.com</Text>
        <Text style={{ fontFamily: F.body, fontSize: 6.5, color: brand.heading, fontWeight: 700 }}>{"Page {{pageNumber}} of {{totalPages}}"}</Text>
      </View>
    </Fixed>
  );
}

/** Footer for full-bleed cover pages (margin 0), positioned like the running footer. */
export function CoverFooter() {
  return (
    <View style={{ position: "absolute", left: MARGIN_X, right: MARGIN_X, bottom: 22 }}>
      <View style={{ height: 0.5, backgroundColor: brand.hairline, marginBottom: 5 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.body, fontSize: 5.9, color: brand.slate }}>ACER Credit Rating Private Limited  |  CIN: U66190HR2024PTC118388  |  SEBI Reg. No.: IN/CRA/009/2025  |  www.acerratings.com</Text>
        <Text style={{ fontFamily: F.body, fontSize: 6.5, color: brand.heading, fontWeight: 700 }}>{"Page {{pageNumber}} of {{totalPages}}"}</Text>
      </View>
    </View>
  );
}

// ── Full note body (every section, complete text) ────────────────────────────────────────
export type HeadingLook = "kicker" | "numbered" | "bar";

type Tone = "s" | "w" | "n";
const toneOf = (t: string): Tone => (/strength|positive|upside/i.test(t) ? "s" : /weakness|negative|downside/i.test(t) ? "w" : "n");
const toneColor = (t: Tone) => (t === "s" ? brand.accent : t === "w" ? brand.amber : brand.deep);
/** Blocks shorter than this are never split across pages. */
const KEEP_LIMIT = 2200;

function blockLength(b: NoteBlock) {
  if (b.type === "paragraph" || b.type === "subheading") return b.text.length;
  if (b.type === "driver") return b.title.length + b.text.length;
  if (b.type === "bullets") return b.intro.length + b.items.join(" ").length;
  return 99999;
}

function Paragraphs({ text, style }: { text: string; style?: Style }) {
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <Text key={i} style={{ ...bodyText, marginBottom: 5, minWidowLines: 2, minOrphanLines: 2, ...style }}>
          {p}
        </Text>
      ))}
    </>
  );
}

function BodyBlock({ block, tone, look, exhibitNo, context, sensitivity }: { block: NoteBlock; tone: Tone; look: HeadingLook; exhibitNo: number; context: string; sensitivity?: boolean }) {
  switch (block.type) {
    case "paragraph":
      return (
        <View style={{ marginBottom: 4 }}>
          <Paragraphs text={block.text} />
        </View>
      );
    case "subheading": {
      const t = toneOf(block.text);
      if (t === "n") return <Text style={{ fontFamily: F.body, fontSize: 9.6, fontWeight: 700, color: brand.heading, marginTop: 3, marginBottom: 5 }}>{block.text}</Text>;
      return (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 8 }}>
          {look === "numbered" ? (
            <Pill text={block.text} tone={t === "s" ? "good" : "warn"} filled />
          ) : (
            <>
              <View style={{ width: 14, height: 2, backgroundColor: toneColor(t), marginRight: 6 }} />
              <Text style={{ ...caps, color: t === "s" ? brand.primary : brand.amber }}>{block.text}</Text>
            </>
          )}
        </View>
      );
    }
    case "driver":
      return (
        <View
          style={{
            flexDirection: "row",
            marginBottom: 8,
            ...(look === "bar" ? { borderWidth: 0.6, borderColor: brand.hairline, borderRadius: 5, padding: 9 } : {}),
          }}
        >
          <View style={{ width: look === "bar" ? 2.5 : 2, backgroundColor: toneColor(tone), marginRight: 9, marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
              <Text style={{ fontFamily: F.body, fontSize: 9.4, fontWeight: 700, color: brand.heading, flex: 1, paddingRight: 8 }}>{block.title}</Text>
              {look === "bar" && tone !== "n" ? <Pill text={sensitivity ? (tone === "s" ? "Upside" : "Downside") : tone === "s" ? "Strength" : "Weakness"} tone={tone === "s" ? "good" : "warn"} /> : null}
            </View>
            <Paragraphs text={block.text} style={{ marginBottom: 3 }} />
          </View>
        </View>
      );
    case "bullets":
      return (
        <View style={{ marginBottom: 7 }}>
          {block.intro ? <Text style={{ ...bodyText, marginBottom: 4 }}>{block.intro}</Text> : null}
          {block.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 2.5 }} wrap={false}>
              {tone === "n" ? <Square color={brand.light} size={4} /> : <Arrow up={tone === "s"} color={toneColor(tone)} />}
              <Text style={{ ...bodyText, flex: 1 }}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={{ marginTop: 2, marginBottom: 10 }}>
          <ExhibitLabel n={exhibitNo} title={block.table.title || context} />
          <NoteTableView table={block.table} look={look === "bar" ? "soft" : "band"} />
        </View>
      );
  }
}

function SectionHeading({ title, index, look }: { title: string; index: number; look: HeadingLook }) {
  if (look === "numbered")
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 9 }}>
        <Text style={{ ...serif, fontSize: 24, color: brand.light, marginRight: 9, lineHeight: 1 }}>{String(index).padStart(2, "0")}</Text>
        <Text style={{ ...serif, fontSize: 15 }}>{title}</Text>
      </View>
    );
  if (look === "bar")
    return (
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 9 }}>
        <View style={{ width: 3, height: 13, backgroundColor: brand.deep, marginRight: 8 }} />
        <Text style={{ fontFamily: F.body, fontSize: 11.5, fontWeight: 700, color: brand.heading }}>{title}</Text>
      </View>
    );
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ ...serif, fontSize: 15 }}>{title}</Text>
      <View style={{ height: 0.6, backgroundColor: brand.hairline, marginTop: 4 }} />
    </View>
  );
}

function BodySection({ section, index, look, nextExhibit, charts, b }: { section: NoteSection; index: number; look: HeadingLook; nextExhibit: () => number; charts: boolean; b: Briefing }) {
  let tone: Tone = "n";
  let context = section.title;
  const out: React.ReactNode[] = [];
  let pending: React.ReactNode[] = [<SectionHeading key="h" title={section.title} index={index} look={look} />];
  let pendingLen = 0;

  const flushWith = (el: React.ReactNode, len: number, key: string) => {
    // Headings and subheadings always travel with the start of the content they introduce.
    const keep = len + pendingLen <= KEEP_LIMIT;
    out.push(
      <View key={key} wrap={!keep}>
        {pending.length ? <View wrap={false}>{pending}</View> : null}
        {el}
      </View>
    );
    pending = [];
    pendingLen = 0;
  };

  section.blocks.forEach((blk, i) => {
    if (blk.type === "subheading") {
      tone = toneOf(blk.text);
      context = blk.text;
      pending.push(<BodyBlock key={blk.id} block={blk} tone={tone} look={look} exhibitNo={0} context={context} />);
      pendingLen += blk.text.length;
      return;
    }
    if (blk.type === "driver" && /positive|negative/i.test(blk.title)) tone = toneOf(blk.title);
    const exhibitNo = blk.type === "table" ? nextExhibit() : 0;
    const el = <BodyBlock key={blk.id} block={blk} tone={tone} look={look} exhibitNo={exhibitNo} context={context} sensitivity={/sensitivit/i.test(section.title)} />;
    const len = blockLength(blk);
    if (pending.length) flushWith(el, Math.min(len, 600), `${blk.id}-g`);
    else out.push(len <= KEEP_LIMIT && blk.type !== "table" ? <View key={blk.id} wrap={false}>{el}</View> : el);
    if (charts && blk.type === "table" && financialSeries(blk.table) && b.fin) {
      const n = nextExhibit();
      out.push(
        <View key={`${blk.id}-c`} style={{ marginBottom: 10 }} wrap={false}>
          <ExhibitLabel n={n} title="Chart of the preceding exhibit" />
          <View style={{ borderWidth: 0.5, borderColor: brand.hairline, padding: 9 }}>
            <FinanceChart b={b} width={470} title={false} />
          </View>
        </View>
      );
    }
    void i;
  });
  if (pending.length) out.push(<View key="tail" wrap={false}>{pending}</View>);
  return <View style={{ marginTop: 12 }}>{out}</View>;
}

export function FullBody({ note, look, firstExhibit, b }: { note: RatingNote; look: HeadingLook; firstExhibit: number; b: Briefing }) {
  let ex = firstExhibit;
  const nextExhibit = () => ++ex;
  const charts = !!note.options?.charts;
  return (
    <>
      {note.sections.map((s, i) => (
        <BodySection key={s.id} section={s} index={i + 1} look={look} nextExhibit={nextExhibit} charts={charts} b={b} />
      ))}
      <Contacts note={note} look={look} />
      <Disclaimer note={note} />
    </>
  );
}

export function Contacts({ note, look }: { note: RatingNote; look: HeadingLook }) {
  if (!note.contacts.length) return null;
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <SectionHeading title="Analytical Contacts" index={note.sections.length + 1} look={look} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {note.contacts.map((c, i) => (
          <View key={i} style={{ flex: 1, borderWidth: 0.6, borderColor: brand.hairline, borderTopWidth: 2, borderTopColor: brand.deep, padding: 9, borderRadius: look === "bar" ? 5 : 0 }}>
            <Text style={{ ...caps, color: brand.slate, marginBottom: 3 }}>{c.role}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 9.6, fontWeight: 700, color: brand.heading }}>{c.name}</Text>
            {c.phone ? <Text style={{ fontFamily: F.body, fontSize: 7.8, color: brand.ink, marginTop: 3 }}>{c.phone}</Text> : null}
            {c.email ? <Text style={{ fontFamily: F.body, fontSize: 7.8, color: brand.primary, marginTop: 1 }}>{c.email}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function Disclaimer({ note }: { note: RatingNote }) {
  if (!note.disclaimer) return null;
  return (
    <View style={{ marginTop: 16, padding: 10, backgroundColor: brand.mist }} wrap={false}>
      <Text style={{ ...caps, color: brand.slate, marginBottom: 4 }}>Disclaimer</Text>
      {note.disclaimer.split("\n\n").map((p, i) => (
        <Text key={i} style={{ fontFamily: F.body, fontSize: 6.6, lineHeight: 1.45, color: brand.slate, marginBottom: 3 }}>{p}</Text>
      ))}
      <Text style={{ fontFamily: F.body, fontSize: 6.6, lineHeight: 1.45, color: brand.slate, marginTop: 2 }}>For more information and the definition of ratings, please visit www.acerratings.com.</Text>
    </View>
  );
}
