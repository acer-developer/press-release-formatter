// Design exploration: renders two candidate consulting-style directions from a real note.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/preview-styles.tsx <note.json> <outDir>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import { Document, Page, Text, View, Image, Svg } from "@formepdf/react";
import type { Style } from "@formepdf/react";

import { PdfGraph } from "../src/components/pdf/graph/graph";
import { PdfcnThemeProvider } from "../src/components/pdf/theme-provider";
import { deriveKeyFacts, financialSeries, parseNumber } from "../src/lib/note/derive";
import type { NoteSection, NoteTable, RatingNote } from "../src/lib/note/schema";
import { acerTheme, brand } from "../src/lib/pdf-themes/acer";

const [jsonPath, outDir] = process.argv.slice(2);
const note: RatingNote = JSON.parse(readFileSync(jsonPath, "utf8"));
const pub = path.join(process.cwd(), "public");
const font = (f: string) => new Uint8Array(readFileSync(path.join(pub, "fonts", f)));
const fonts = [
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400 },
  { family: "Satoshi", src: font("Satoshi-Medium.ttf"), fontWeight: 500 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 700 },
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400, fontStyle: "italic" as const },
  { family: "Caladea", src: font("Caladea-400.ttf"), fontWeight: 400 },
  { family: "Caladea", src: font("Caladea-700.ttf"), fontWeight: 700 },
];
const logo = `data:image/png;base64,${readFileSync(path.join(pub, "acer-logo.png")).toString("base64")}`;

// ── Content helpers (everything comes from the note; only arithmetic is added) ──────────────
const facts = deriveKeyFacts(note);
const sec = (re: RegExp) => note.sections.find((s) => re.test(s.title));
const firstSentence = (t: string) => (t.match(/^.+?[.](?=\s+[A-Z(]|$)/)?.[0] ?? t).trim();
const summary = sec(/summary/i);
const keyMessages = (summary?.blocks ?? []).flatMap((b) => (b.type === "paragraph" ? [firstSentence(b.text)] : [])).slice(0, 3);
const drivers = (s?: NoteSection) => {
  const out: { tone: "s" | "w"; title: string; text: string }[] = [];
  let tone: "s" | "w" = "s";
  for (const b of s?.blocks ?? []) {
    if (b.type === "subheading") tone = /weak/i.test(b.text) ? "w" : "s";
    if (b.type === "driver") out.push({ tone, title: b.title, text: b.text });
  }
  return out;
};
const drv = drivers(sec(/key rating drivers/i));
const strengths = drv.filter((d) => d.tone === "s");
const weaknesses = drv.filter((d) => d.tone === "w");
const sens = (() => {
  const s = sec(/sensitivit/i);
  const up: string[] = [];
  const down: string[] = [];
  let mode: "up" | "down" = "up";
  for (const b of s?.blocks ?? []) {
    if (b.type === "subheading" || b.type === "driver") mode = /neg/i.test(b.type === "driver" ? b.title : b.text) ? "down" : "up";
    if (b.type === "bullets") (mode === "up" ? up : down).push(...b.items);
  }
  return { up, down };
})();
const liquidity = sec(/liquidity/i);
const liquidityLevel = liquidity?.title.split(":")[1]?.trim() ?? "";
const finTable = note.sections.flatMap((s) => s.blocks).find((b) => b.type === "table" && financialSeries(b.table)) as { table: NoteTable } | undefined;
const fin = finTable ? financialSeries(finTable.table) : null;
const finRow = (re: RegExp) => finTable?.table.rows.find((r) => re.test(r[0]));
const tidy = (s: string) => s.replace(/,?\s*(and|a)$/i, "").replace(/[;,]\s*$/, "");

/** KPI from two reported periods; the change is computed, never sourced elsewhere. */
function kpi(re: RegExp, label: string, kind: "amount" | "pct" | "x") {
  const row = finRow(re);
  if (!row || !fin) return null;
  // Compare the last two full years (skip quarterly columns).
  const idx = fin.periods.map((p, i) => ({ p, i })).filter((x) => !/Q\d/i.test(x.p));
  if (idx.length < 2) return null;
  const [a, b] = idx.slice(-2);
  const va = parseNumber(row[a.i + 1] ?? "");
  const vb = parseNumber(row[b.i + 1] ?? "");
  if (va === null || vb === null) return null;
  let change = "";
  let up = vb >= va;
  if (kind === "amount") change = `${up ? "+" : ""}${(((vb - va) / Math.abs(va)) * 100).toFixed(1)}% YoY`;
  else if (kind === "pct") change = `${up ? "+" : ""}${Math.round((vb - va) * 100)} bps YoY`;
  else change = `${a.p}: ${row[a.i + 1]}`;
  if (kind === "x") up = vb <= va; // lower leverage reads as an improvement
  return { label, value: row[b.i + 1], period: b.p, change, good: up };
}
const kpis = [
  kpi(/^revenue/i, "Revenue (INR crore)", "amount"),
  kpi(/^ebitda \(/i, "EBITDA (INR crore)", "amount"),
  kpi(/^ebitda margin/i, "EBITDA margin", "pct"),
  kpi(/leverage|gearing/i, "Net adjusted leverage (x)", "x"),
].filter(Boolean) as NonNullable<ReturnType<typeof kpi>>[];

const caps: Style = { fontSize: 6.6, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 700 };
const serif: Style = { fontFamily: "Caladea", fontWeight: 700, color: brand.heading };
const body: Style = { fontSize: 8.6, lineHeight: 1.5, color: brand.ink };
const W = 595.28;
const Arrow = ({ up, color }: { up: boolean; color: string }) => (
  <Svg width={6} height={6} viewBox="0 0 10 10" style={{ marginTop: 2.5, marginRight: 5 }} content={up ? `<path d="M5 0 L10 10 L0 10 Z" fill="${color}"/>` : `<path d="M0 0 L10 0 L5 10 Z" fill="${color}"/>`} />
);

function Footer({ page, inset = 40 }: { page: number; inset?: number }) {
  return (
    <View style={{ position: "absolute", left: inset, right: inset, bottom: 20 }}>
      <View style={{ height: 0.5, backgroundColor: brand.hairline, marginBottom: 5 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 5.8, color: brand.slate }}>ACER Credit Rating Private Limited  |  CIN: U66190HR2024PTC118388  |  SEBI Reg. No.: IN/CRA/009/2025  |  www.acerratings.com</Text>
        <Text style={{ fontSize: 6.4, color: brand.heading, fontWeight: 700 }}>{`Page ${page}`}</Text>
      </View>
    </View>
  );
}

function InstrumentsTable({ compact }: { compact?: boolean }) {
  const t = note.instruments;
  if (!t) return null;
  const keep = t.columns.map((c, i) => ({ c, i })).filter(({ c }) => !/regulator/i.test(c) || !compact);
  const widths = keep.map(({ i }) => (i === 0 ? 2.2 : /rating/i.test(t.columns[i]) ? 1.8 : /date/i.test(t.columns[i]) ? 1.25 : 1));
  const sum = widths.reduce((a, b) => a + b, 0);
  const cell = (v: string, k: number, st: Style = {}) => (
    <View style={{ width: `${(widths[k] / sum) * 100}%`, paddingVertical: 4.5, paddingHorizontal: 5 }}>
      <Text style={{ fontSize: 7.4, lineHeight: 1.3, textAlign: k > 0 && /^[\d.,-]+%?$/.test(v) ? "right" : "left", ...st }}>{v}</Text>
    </View>
  );
  return (
    <View>
      <View style={{ flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: brand.deep }}>
        {keep.map(({ c }, k) => cell(c.replace(/\*+|\^/g, ""), k, { fontSize: 6.8, fontWeight: 700, color: brand.slate }))}
      </View>
      {t.rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: brand.hairline }}>
          {keep.map(({ i }, k) => cell(r[i] ?? "", k, i === 0 ? { fontWeight: 700, color: brand.heading } : {}))}
        </View>
      ))}
      {t.totalRow ? (
        <View style={{ flexDirection: "row", backgroundColor: brand.tint }}>
          {keep.map(({ i }, k) => cell(t.totalRow![i] ?? "", k, { fontWeight: 700, color: brand.heading }))}
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════ Direction A: Boardroom ═════════════════════════════
function BoardroomCover() {
  return (
    <Page size="A4" margin={0} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40, paddingVertical: 16 }}>
        <Image src={logo} style={{ width: 96 }} />
        <Text style={{ ...caps, color: brand.slate }}>{`Press Release  |  ${note.meta.date}`}</Text>
      </View>
      {/* Hero band */}
      <View style={{ backgroundColor: brand.deep, paddingHorizontal: 40, paddingTop: 26, paddingBottom: 0 }}>
        <Text style={{ ...caps, color: brand.bannerLabel, marginBottom: 10 }}>Credit rating action</Text>
        <Text style={{ ...serif, color: "#ffffff", fontSize: 30, lineHeight: 1.1 }}>{note.meta.companyName}</Text>
        <Text style={{ fontSize: 12, color: "#D6E6E0", marginTop: 8, lineHeight: 1.4, maxWidth: 440 }}>{note.meta.headline}</Text>
        <View style={{ flexDirection: "row", marginTop: 22, borderTopWidth: 0.6, borderTopColor: "#4F7A6E" }}>
          {[
            ["Rating", facts.rating],
            ["Outlook", facts.outlook],
            ["Action", facts.action],
            [`Rated (${facts.amountUnit || "INR crore"})`, facts.totalAmount],
          ].map(([l, v], i) => (
            <View key={l} style={{ flex: 1, paddingVertical: 12, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: "#4F7A6E" }}>
              <Text style={{ ...caps, color: "#9FC7BA", marginBottom: 4 }}>{l}</Text>
              <Text style={{ ...serif, color: "#ffffff", fontSize: 17 }}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ height: 3, background: brand.gradient } as Style} />

      {/* Executive summary + sidebar */}
      <View style={{ flexDirection: "row", paddingHorizontal: 40, paddingTop: 24, gap: 22 }}>
        <View style={{ flex: 62 }}>
          <Text style={{ ...caps, color: brand.accent, marginBottom: 4 }}>Executive summary</Text>
          <Text style={{ ...serif, fontSize: 16, marginBottom: 12 }}>What drives the rating</Text>
          {keyMessages.map((m, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 11 }}>
              <Text style={{ ...serif, fontSize: 22, color: brand.light, width: 30, lineHeight: 1 }}>{i + 1}</Text>
              <Text style={{ ...body, flex: 1, fontSize: 9 }}>{m}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 38, backgroundColor: brand.mist, padding: 12 }}>
          <Text style={{ ...caps, color: brand.slate, marginBottom: 8 }}>Drivers at a glance</Text>
          {strengths.map((d) => (
            <View key={d.title} style={{ flexDirection: "row", marginBottom: 5 }}>
              <Arrow up color={brand.accent} />
              <Text style={{ fontSize: 8, lineHeight: 1.35, flex: 1, color: brand.heading }}>{d.title}</Text>
            </View>
          ))}
          <View style={{ height: 0.5, backgroundColor: brand.hairline, marginVertical: 6 }} />
          {weaknesses.map((d) => (
            <View key={d.title} style={{ flexDirection: "row", marginBottom: 5 }}>
              <Arrow up={false} color={brand.amber} />
              <Text style={{ fontSize: 8, lineHeight: 1.35, flex: 1, color: brand.heading }}>{d.title}</Text>
            </View>
          ))}
          {liquidityLevel ? (
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ ...caps, color: brand.slate }}>Liquidity</Text>
              <View style={{ backgroundColor: brand.deep, paddingVertical: 2.5, paddingHorizontal: 7 }}>
                <Text style={{ ...caps, color: "#ffffff" }}>{liquidityLevel}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 40, marginTop: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 6 }}>
          <Text style={{ ...caps, color: brand.accent, marginRight: 8 }}>Exhibit 1</Text>
          <Text style={{ fontSize: 8.6, fontWeight: 700, color: brand.heading }}>Rated instruments</Text>
        </View>
        <InstrumentsTable />
      </View>
      <Footer page={1} />
    </Page>
  );
}

function BoardroomInside() {
  const chartData = fin
    ? [
        { name: fin.revenueLabel || "Revenue", color: brand.deep, data: fin.periods.map((p, i) => ({ label: p, value: fin.revenue[i] ?? 0 })) },
        { name: fin.profitLabel || "EBITDA", color: brand.light, data: fin.periods.map((p, i) => ({ label: p, value: fin.ebitda[i] ?? 0 })) },
      ]
    : [];
  const Column = ({ title, items, color }: { title: string; items: typeof strengths; color: string }) => (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: color, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 }}>
        <Text style={{ ...caps, color: "#ffffff" }}>{`${title}  (${items.length})`}</Text>
      </View>
      {items.map((d) => (
        <View key={d.title} style={{ marginBottom: 9 }} wrap={false}>
          <Text style={{ fontSize: 8.8, fontWeight: 700, color: brand.heading, marginBottom: 2 }}>{d.title}</Text>
          <Text style={{ ...body, fontSize: 7.9 }}>{firstSentence(d.text)}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <Page size="A4" margin={0} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40, paddingVertical: 14 }}>
        <Image src={logo} style={{ width: 78 }} />
        <Text style={{ ...caps, color: brand.slate }}>{note.meta.companyName}</Text>
      </View>
      <View style={{ height: 1.4, background: brand.gradient, marginHorizontal: 40 } as Style} />
      <View style={{ paddingHorizontal: 40, paddingTop: 18 }}>
        <Text style={{ ...caps, color: brand.accent }}>Key rating drivers</Text>
        <Text style={{ ...serif, fontSize: 18, marginTop: 3, marginBottom: 12 }}>{`${strengths.length} credit strengths are balanced against ${weaknesses.length} weaknesses`}</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Column title="Credit strengths" items={strengths} color={brand.accent} />
          <Column title="Credit weaknesses" items={weaknesses} color={brand.amber} />
        </View>

        <Text style={{ ...caps, color: brand.accent, marginTop: 10 }}>Financial profile</Text>
        <Text style={{ ...serif, fontSize: 18, marginTop: 3, marginBottom: 10 }}>Reported performance at a glance</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {kpis.map((k) => (
            <View key={k.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: brand.deep, backgroundColor: brand.mist, padding: 9 }}>
              <Text style={{ ...caps, fontSize: 5.8, color: brand.slate }}>{`${k.label}, ${k.period}`}</Text>
              <Text style={{ ...serif, fontSize: 19, marginTop: 4 }}>{k.value}</Text>
              <Text style={{ fontSize: 7, fontWeight: 700, marginTop: 2, color: k.good ? brand.accent : brand.amber }}>{k.change}</Text>
            </View>
          ))}
        </View>
        {fin ? (
          <View style={{ marginTop: 12, flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
            <View style={{ flex: 60 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 4 }}>
                <Text style={{ ...caps, color: brand.accent, marginRight: 8 }}>Exhibit 2</Text>
                <Text style={{ fontSize: 8.4, fontWeight: 700, color: brand.heading }}>{`Revenue and EBITDA (${fin.unit})`}</Text>
              </View>
              <PdfcnThemeProvider theme={acerTheme}>
                <PdfGraph variant="bar" data={chartData as never} width={300} height={140} showValues={false} legend="bottom" yTicks={4} />
              </PdfcnThemeProvider>
            </View>
            <View style={{ flex: 40 }}>
              <Text style={{ ...caps, color: brand.slate, marginBottom: 6 }}>Rating sensitivities</Text>
              {sens.up.slice(0, 3).map((t) => (
                <View key={t} style={{ flexDirection: "row", marginBottom: 4 }}>
                  <Arrow up color={brand.accent} />
                  <Text style={{ fontSize: 7.6, lineHeight: 1.35, flex: 1 }}>{tidy(t)}</Text>
                </View>
              ))}
              {sens.down.slice(0, 3).map((t) => (
                <View key={t} style={{ flexDirection: "row", marginBottom: 4 }}>
                  <Arrow up={false} color={brand.amber} />
                  <Text style={{ fontSize: 7.6, lineHeight: 1.35, flex: 1 }}>{tidy(t)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <Text style={{ fontSize: 6.2, color: brand.slate, marginTop: 6 }}>Year-on-year changes are computed from the reported figures in the note. Source: company, ACER.</Text>
      </View>
      <Footer page={2} />
    </Page>
  );
}

// ═════════════════════════════ Direction B: Scorecard ═════════════════════════════
function ScorecardCover() {
  const side = 178;
  return (
    <Page size="A4" margin={0} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: side, backgroundColor: brand.mist }} />
      <View style={{ position: "absolute", left: side, top: 0, bottom: 0, width: 3, background: brand.gradientV } as Style} />
      <View style={{ flexDirection: "row" }}>
        {/* Sidebar */}
        <View style={{ width: side, paddingHorizontal: 20, paddingTop: 26 }}>
          <Image src={logo} style={{ width: 104, marginBottom: 30 }} />
          {[
            ["Rating", facts.rating, 22],
            ["Outlook", facts.outlook, 15],
            ["Rating action", facts.action, 15],
            [`Total rated (${facts.amountUnit || "INR crore"})`, facts.totalAmount, 15],
            ["Liquidity", liquidityLevel, 15],
            ["Date", note.meta.date, 11],
          ]
            .filter(([, v]) => v)
            .map(([l, v, size]) => (
              <View key={String(l)} style={{ marginBottom: 14, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: brand.hairline }}>
                <Text style={{ ...caps, color: brand.slate, marginBottom: 3 }}>{String(l)}</Text>
                <Text style={{ ...serif, fontSize: Number(size) }}>{String(v)}</Text>
              </View>
            ))}
          <Text style={{ ...caps, color: brand.slate, marginBottom: 6 }}>Driver balance</Text>
          <View style={{ flexDirection: "row", height: 8, marginBottom: 4 }}>
            <View style={{ flex: strengths.length || 1, backgroundColor: brand.accent }} />
            <View style={{ width: 2 }} />
            <View style={{ flex: weaknesses.length || 1, backgroundColor: brand.amber }} />
          </View>
          <Text style={{ fontSize: 7, color: brand.slate }}>{`${strengths.length} strengths  |  ${weaknesses.length} weaknesses`}</Text>
        </View>
        {/* Main */}
        <View style={{ flex: 1, paddingLeft: 30, paddingRight: 36, paddingTop: 30 }}>
          <Text style={{ ...caps, color: brand.accent, marginBottom: 8 }}>Press release  |  Credit rating</Text>
          <Text style={{ ...serif, fontSize: 27, lineHeight: 1.12 }}>{note.meta.companyName}</Text>
          <View style={{ height: 2.5, width: 46, backgroundColor: brand.deep, marginVertical: 12 }} />
          <Text style={{ fontSize: 12.5, fontWeight: 500, color: brand.heading, lineHeight: 1.4 }}>{note.meta.headline}</Text>

          <Text style={{ ...caps, color: brand.accent, marginTop: 22, marginBottom: 6 }}>The rating in brief</Text>
          {keyMessages.map((m, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: i === 0 ? brand.deep : brand.light }}>
              <Text style={{ ...body, fontSize: 9 }}>{m}</Text>
            </View>
          ))}

          <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 16, marginBottom: 6 }}>
            <Text style={{ ...caps, color: brand.accent, marginRight: 8 }}>Exhibit 1</Text>
            <Text style={{ fontSize: 8.6, fontWeight: 700, color: brand.heading }}>Rated instruments</Text>
          </View>
          <InstrumentsTable compact />
        </View>
      </View>
      <Footer page={1} />
    </Page>
  );
}

function ScorecardInside() {
  const mini = (label: string, re: RegExp) => {
    const row = finRow(re);
    if (!row || !fin) return null;
    const data = fin.periods.map((p, i) => ({ label: p, value: parseNumber(row[i + 1] ?? "") ?? 0, color: /Q\d/i.test(p) ? brand.light : brand.deep }));
    return (
      <View key={label} style={{ width: "48%", marginBottom: 10, borderWidth: 0.5, borderColor: brand.hairline, padding: 8 }} wrap={false}>
        <Text style={{ fontSize: 8, fontWeight: 700, color: brand.heading, marginBottom: 4 }}>{label}</Text>
        <PdfcnThemeProvider theme={acerTheme}>
          <PdfGraph variant="bar" data={data as never} width={225} height={74} showValues={false} legend="none" showGrid yTicks={3} />
        </PdfcnThemeProvider>
      </View>
    );
  };
  return (
    <Page size="A4" margin={0} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40, paddingVertical: 14 }}>
        <Image src={logo} style={{ width: 78 }} />
        <Text style={{ ...caps, color: brand.slate }}>{note.meta.companyName}</Text>
      </View>
      <View style={{ height: 1.4, background: brand.gradient, marginHorizontal: 40 } as Style} />
      <View style={{ paddingHorizontal: 40, paddingTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 10 }}>
          <Text style={{ ...serif, fontSize: 30, color: brand.light, marginRight: 10, lineHeight: 1 }}>01</Text>
          <Text style={{ ...serif, fontSize: 17 }}>Rating driver scorecard</Text>
        </View>
        <View style={{ flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: brand.deep, paddingBottom: 4 }}>
          <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "30%" }}>Driver</Text>
          <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "14%" }}>Assessment</Text>
          <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "56%" }}>Evidence from the note</Text>
        </View>
        {drv.map((d) => (
          <View key={d.title} style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.4, borderBottomColor: brand.hairline }} wrap={false}>
            <Text style={{ fontSize: 8.2, fontWeight: 700, color: brand.heading, width: "30%", paddingRight: 8, lineHeight: 1.35 }}>{d.title}</Text>
            <View style={{ width: "14%" }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: d.tone === "s" ? brand.tealTint : brand.amberTint, paddingVertical: 2, paddingHorizontal: 5 }}>
                <Text style={{ ...caps, fontSize: 5.8, color: d.tone === "s" ? brand.primary : brand.amber }}>{d.tone === "s" ? "Strength" : "Weakness"}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 7.7, lineHeight: 1.4, width: "56%" }}>{firstSentence(d.text)}</Text>
          </View>
        ))}

        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 16, marginBottom: 10 }}>
          <Text style={{ ...serif, fontSize: 30, color: brand.light, marginRight: 10, lineHeight: 1 }}>02</Text>
          <Text style={{ ...serif, fontSize: 17 }}>{`Financial profile${fin?.unit ? ` (${fin.unit})` : ""}`}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {[mini("Revenue (INR crore)", /^revenue/i), mini("EBITDA (INR crore)", /^ebitda \(/i), mini("EBITDA margin (%)", /^ebitda margin/i), mini("Interest coverage (x)", /interest coverage/i)]}
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4, marginBottom: 8 }}>
          <Text style={{ ...serif, fontSize: 30, color: brand.light, marginRight: 10, lineHeight: 1 }}>03</Text>
          <Text style={{ ...serif, fontSize: 17 }}>What could change the rating</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {(
            [
              ["Upward triggers", sens.up, brand.accent, "up"],
              ["Downward triggers", sens.down, brand.amber, "down"],
            ] as const
          ).map(([title, items, color, mark]) => (
            <View key={title} style={{ flex: 1, borderTopWidth: 2, borderTopColor: color, paddingTop: 6 }}>
              <Text style={{ ...caps, color, marginBottom: 6 }}>{title}</Text>
              {items.slice(0, 3).map((t) => (
                <View key={t} style={{ flexDirection: "row", marginBottom: 4 }}>
                  <Arrow up={mark === "up"} color={color} />
                  <Text style={{ fontSize: 7.7, lineHeight: 1.35, flex: 1 }}>{tidy(t)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
      <Footer page={2} />
    </Page>
  );
}


// ═════════════════════ Direction C: pdfcn Report (cards, badges, dashboard) ═════════════════════
const Card = ({ title, children, style }: { title?: string; children: React.ReactNode; style?: Style }) => (
  <View style={{ borderWidth: 0.8, borderColor: brand.hairline, borderRadius: 6, padding: 12, ...style }} wrap={false}>
    {title ? <Text style={{ ...caps, color: brand.slate, marginBottom: 9 }}>{title}</Text> : null}
    {children}
  </View>
);
const Pill = ({ text, tone }: { text: string; tone: "good" | "warn" | "info" }) => {
  const c = tone === "good" ? brand.accent : tone === "warn" ? brand.amber : brand.primary;
  return (
    <View style={{ flexDirection: "row", marginTop: 4 }}>
      <View style={{ borderWidth: 0.8, borderColor: c, borderRadius: 9, paddingVertical: 1.5, paddingHorizontal: 6 }}>
        <Text style={{ fontSize: 6.4, fontWeight: 700, color: c }}>{text}</Text>
      </View>
    </View>
  );
};

function ReportCover() {
  return (
    <Page size="A4" margin={[30, 40, 50, 40]} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Image src={logo} style={{ width: 96 }} />
        <Text style={{ fontSize: 8, color: brand.slate }}>{note.meta.date}</Text>
      </View>
      <View style={{ height: 0.6, backgroundColor: brand.hairline, marginBottom: 16 }} />
      <Text style={{ ...caps, color: brand.accent, marginBottom: 6 }}>Press release  |  Credit rating</Text>
      <Text style={{ ...serif, fontSize: 26, lineHeight: 1.12 }}>{note.meta.companyName}</Text>
      <Text style={{ fontSize: 11.5, color: brand.slate, marginTop: 6, lineHeight: 1.4 }}>{note.meta.headline}</Text>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 16 }}>
        <View style={{ backgroundColor: brand.tealTint, borderRadius: 9, paddingVertical: 2.5, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 7, fontWeight: 700, color: brand.primary }}>{`Rating: ${facts.rating} (${facts.outlook})`}</Text>
        </View>
        {liquidityLevel ? (
          <View style={{ backgroundColor: brand.mist, borderRadius: 9, paddingVertical: 2.5, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: brand.heading }}>{`Liquidity: ${liquidityLevel}`}</Text>
          </View>
        ) : null}
      </View>

      <Card title="Executive summary">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { l: "Rating", v: facts.rating, p: facts.action, t: "good" as const },
            { l: "Outlook", v: facts.outlook, p: "Unchanged", t: "info" as const },
            ...kpis.slice(0, 2).map((k) => ({ l: `${k.label}, ${k.period}`, v: k.value, p: k.change, t: (k.good ? "good" : "warn") as "good" | "warn" })),
          ].map((m) => (
            <View key={m.l} style={{ width: "48.6%", borderLeftWidth: 2.5, borderLeftColor: m.t === "warn" ? brand.amber : brand.accent, borderWidth: 0.6, borderColor: brand.hairline, padding: 9 }}>
              <Text style={{ ...caps, fontSize: 5.8, color: brand.slate }}>{m.l}</Text>
              <Text style={{ fontSize: 15, fontWeight: 700, color: brand.heading, marginTop: 3 }}>{m.v}</Text>
              {m.p ? <Pill text={m.p} tone={m.t} /> : null}
            </View>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <Card title="Highlights and risks" style={{ flex: 58 }}>
          {drv.map((d) => (
            <View key={d.title} style={{ flexDirection: "row", marginBottom: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: d.tone === "s" ? brand.accent : brand.amber, marginTop: 1.5, marginRight: 8 }} />
              <Text style={{ fontSize: 8, lineHeight: 1.35, flex: 1 }}>{d.title}</Text>
            </View>
          ))}
        </Card>
        <Card title="At a glance" style={{ flex: 42 }}>
          {[
            ["Credit strengths", String(strengths.length)],
            ["Credit weaknesses", String(weaknesses.length)],
            ["Instruments rated", String(note.instruments?.rows.length ?? 0)],
            [`Total rated (${facts.amountUnit || "INR crore"})`, facts.totalAmount],
          ].map(([k, v], i, a) => (
            <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: i < a.length - 1 ? 0.5 : 0, borderBottomColor: brand.hairline }}>
              <Text style={{ fontSize: 7.8, color: brand.slate }}>{k}</Text>
              <Text style={{ fontSize: 7.8, fontWeight: 700, color: brand.heading }}>{v}</Text>
            </View>
          ))}
        </Card>
      </View>

      <Card title="Rated instruments" style={{ marginTop: 10 }}>
        <InstrumentsTable compact />
      </Card>
      <Footer page={1} inset={0} />
    </Page>
  );
}

function ReportInside() {
  const series = fin
    ? [
        { name: fin.revenueLabel || "Revenue", color: brand.deep, data: fin.periods.filter((p) => !/Q\d/i.test(p)).map((p) => ({ label: p, value: fin.revenue[fin.periods.indexOf(p)] ?? 0 })) },
        { name: fin.profitLabel || "EBITDA", color: brand.light, data: fin.periods.filter((p) => !/Q\d/i.test(p)).map((p) => ({ label: p, value: fin.ebitda[fin.periods.indexOf(p)] ?? 0 })) },
      ]
    : [];
  return (
    <Page size="A4" margin={[30, 40, 50, 40]} style={{ fontFamily: "Satoshi", color: brand.ink }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Image src={logo} style={{ width: 78 }} />
        <Text style={{ fontSize: 8, color: brand.slate }}>{note.meta.companyName}</Text>
      </View>
      <View style={{ height: 0.6, backgroundColor: brand.hairline, marginBottom: 14 }} />
      <Text style={{ ...caps, color: brand.slate, marginBottom: 8 }}>Key rating drivers</Text>
      {drv.map((d) => (
        <Card key={d.title} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: d.tone === "s" ? brand.accent : brand.amber }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={{ fontSize: 9.2, fontWeight: 700, color: brand.heading, flex: 1, paddingRight: 10 }}>{d.title}</Text>
            <Pill text={d.tone === "s" ? "Strength" : "Weakness"} tone={d.tone === "s" ? "good" : "warn"} />
          </View>
          <Text style={{ ...body, fontSize: 7.9, marginTop: 4 }}>{firstSentence(d.text)}</Text>
        </Card>
      ))}
      {fin ? (
        <Card title="Performance trend" style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: 700, color: brand.heading }}>{`Revenue and EBITDA (${fin.unit})`}</Text>
          <Text style={{ fontSize: 7, color: brand.slate, marginBottom: 6 }}>Full financial years, as reported</Text>
          <PdfcnThemeProvider theme={acerTheme}>
            <PdfGraph variant="line" data={series as never} width={500} height={120} showValues={false} legend="bottom" yTicks={4} showDots />
          </PdfcnThemeProvider>
        </Card>
      ) : null}
      <Footer page={2} inset={0} />
    </Page>
  );
}

const write = async (name: string, pages: React.ReactNode) => {
  const doc = (
    <Document title={name} fonts={fonts}>
      {pages}
    </Document>
  );
  writeFileSync(path.join(outDir, `${name}.pdf`), await renderDocument(doc));
};
await write("A-boardroom", [<BoardroomCover key="1" />, <BoardroomInside key="2" />]);
await write("B-scorecard", [<ScorecardCover key="1" />, <ScorecardInside key="2" />]);
await write("C-report", [<ReportCover key="1" />, <ReportInside key="2" />]);
console.log("ok", W);
