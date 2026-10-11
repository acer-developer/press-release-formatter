import React from "react";
import { Document, Page } from "@formepdf/react";
import type { FontRegistration } from "@formepdf/react";

import { PdfGraph } from "@/components/pdf/graph/graph";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/pdf/table/table";
import { PdfcnThemeProvider } from "@/components/pdf/theme-provider";
import { Fixed, Image, Text, View } from "@/lib/pdf-primitives";
import type { Style } from "@/lib/pdf-primitives";
import { acerTheme, brand, fonts } from "@/lib/pdf-themes/acer";
import { columnWidths, deriveKeyFacts, financialSeries, showsDate } from "@/lib/note/derive";
import type { NoteBlock, NoteSection, NoteTable, RatingNote } from "@/lib/note/schema";

export interface RenderAssets {
  fonts: FontRegistration[];
  logo?: string;
}

const S = {
  body: { fontFamily: fonts.body, fontSize: 9.2, lineHeight: 1.55, color: brand.ink } as Style,
  serif: { fontFamily: fonts.heading, fontWeight: 700, color: brand.heading } as Style,
  caps: { fontFamily: fonts.body, fontSize: 6.6, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 } as Style,
};

const isNumeric = (s: string) => /^[-(]?\s*[₹$]?\s*-?[\d,]+(\.\d+)?\s*(%|x|times)?\)?$|^[-]$/.test(s.trim());

type Tone = "strength" | "weakness" | "neutral";
const toneOf = (text: string): Tone =>
  /strength|positive/i.test(text) ? "strength" : /weakness|negative/i.test(text) ? "weakness" : "neutral";
const toneColor = (t: Tone) => (t === "strength" ? brand.accent : t === "weakness" ? brand.amber : brand.deep);

function NoteTableView({ table, exhibit, title }: { table: NoteTable; exhibit: number; title?: string }) {
  const widths = columnWidths(table);
  const numericCol = table.columns.map((_, i) => {
    const vals = table.rows.map((r) => r[i] ?? "").filter((v) => v.trim());
    return i > 0 && vals.length > 0 && vals.filter(isNumeric).length / vals.length >= 0.6;
  });
  const cell = (v: string, i: number, extra?: Style) => (
    <Text style={{ fontFamily: fonts.body, fontSize: 7.8, lineHeight: 1.35, color: brand.ink, textAlign: numericCol[i] ? "right" : "left", ...extra }}>{v}</Text>
  );
  const heading = title || table.title;
  return (
    <View style={{ marginTop: 4, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 5 }} wrap={false}>
        <Text style={{ ...S.caps, color: brand.accent, marginRight: 7 }}>{`Exhibit ${exhibit}`}</Text>
        {heading ? <Text style={{ fontFamily: fonts.body, fontSize: 8.4, fontWeight: 700, color: brand.heading }}>{heading}</Text> : null}
      </View>
      <Table variant="primary-header" style={{ marginBottom: 0, marginTop: 0, borderTopWidth: 0, borderBottomWidth: 0.8, borderBottomColor: brand.deep, borderRadius: 0 }}>
        <TableHeader>
          <TableRow header style={{ backgroundColor: brand.deep, borderRadius: 0 }}>
            {table.columns.map((c, i) => (
              <TableCell key={i} width={widths[i]} style={{ paddingVertical: 5, paddingHorizontal: 5 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 7.1, lineHeight: 1.3, fontWeight: 700, color: "#ffffff", textAlign: numericCol[i] ? "right" : "left" }}>{c}</Text>
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((r, ri) => (
            <TableRow key={ri} style={{ backgroundColor: "#ffffff", borderBottomWidth: 0.4, borderBottomColor: brand.hairline }}>
              {table.columns.map((_, i) => (
                <TableCell key={i} width={widths[i]} style={{ paddingVertical: 4, paddingHorizontal: 5 }}>
                  {cell(r[i] ?? "", i, i === 0 ? { fontWeight: 500, color: brand.heading } : undefined)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {table.totalRow ? (
            <TableRow style={{ borderTopWidth: 0.8, borderTopColor: brand.deep, backgroundColor: brand.tint }}>
              {table.columns.map((_, i) => (
                <TableCell key={i} width={widths[i]} style={{ paddingVertical: 4.5, paddingHorizontal: 5 }}>
                  {cell(table.totalRow![i] ?? "", i, { fontWeight: 700, color: brand.heading })}
                </TableCell>
              ))}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {table.source ? <Text style={{ fontFamily: fonts.body, fontSize: 6.6, color: brand.slate, marginTop: 4 }}>{`Source: ${table.source}`}</Text> : null}
      {table.footnotes.map((f, i) => (
        <Text key={i} style={{ fontFamily: fonts.body, fontSize: 6.4, lineHeight: 1.4, color: brand.slate, marginTop: i === 0 && !table.source ? 4 : 1 }}>{f}</Text>
      ))}
    </View>
  );
}

function FinancialChart({ table, exhibit }: { table: NoteTable; exhibit: number }) {
  const series = financialSeries(table);
  if (!series) return null;
  const pts = (vals: (number | null)[]) => series.periods.map((p, i) => ({ label: p, value: vals[i] ?? 0 })).filter((_, i) => vals[i] !== null);
  const rev = pts(series.revenue);
  const prof = pts(series.ebitda);
  if (rev.length < 2) return null;
  const paired = prof.length === rev.length;
  const data = paired
    ? [
        { name: series.revenueLabel || "Revenue", data: rev, color: brand.deep },
        { name: series.profitLabel || "EBITDA", data: prof, color: brand.light },
      ]
    : rev.map((p) => ({ ...p, color: brand.deep }));
  const label = `${series.revenueLabel || "Revenue"}${paired ? ` and ${series.profitLabel || "EBITDA"}` : ""}${series.unit ? ` (${series.unit})` : ""}`;
  return (
    <View style={{ marginTop: 2, marginBottom: 12 }} wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 6 }}>
        <Text style={{ ...S.caps, color: brand.accent, marginRight: 7 }}>{`Exhibit ${exhibit}`}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 8.4, fontWeight: 700, color: brand.heading }}>{label}</Text>
      </View>
      <View style={{ borderWidth: 0.5, borderColor: brand.hairline, padding: 10 }}>
        <PdfGraph variant="bar" data={data as never} width={480} height={150} showValues={false} legend="bottom" yTicks={4} />
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 6.4, color: brand.slate, marginTop: 4 }}>Plotted from the preceding exhibit. Exact figures are shown in the table.</Text>
    </View>
  );
}

function BlockView({ block, tone, exhibitNo, context }: { block: NoteBlock; tone: Tone; exhibitNo: number; context: string }) {
  switch (block.type) {
    case "paragraph":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.text.split("\n\n").map((p, i) => (
            <Text key={i} style={{ ...S.body, marginBottom: 5 }}>{p}</Text>
          ))}
        </View>
      );
    case "subheading": {
      const t = toneOf(block.text);
      if (t === "neutral") return <Text style={{ fontFamily: fonts.body, fontSize: 9.6, fontWeight: 700, color: brand.heading, marginTop: 4, marginBottom: 5 }}>{block.text}</Text>;
      return (
        <View style={{ flexDirection: "row", marginTop: 4, marginBottom: 7 }} wrap={false}>
          <View style={{ backgroundColor: t === "strength" ? brand.greenTint : brand.amberTint, paddingVertical: 3, paddingHorizontal: 7 }}>
            <Text style={{ ...S.caps, color: t === "strength" ? brand.primary : brand.amber }}>{block.text}</Text>
          </View>
        </View>
      );
    }
    case "driver":
      return (
        <View style={{ flexDirection: "row", marginBottom: 8 }}>
          <View style={{ width: 2, backgroundColor: toneColor(tone), marginRight: 9, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 9.4, fontWeight: 700, color: brand.heading, marginBottom: 2 }}>{block.title}</Text>
            {block.text.split("\n\n").map((p, i) => (
              <Text key={i} style={{ ...S.body, marginBottom: 3 }}>{p}</Text>
            ))}
          </View>
        </View>
      );
    case "bullets":
      return (
        <View style={{ marginBottom: 8 }}>
          {block.intro ? <Text style={{ ...S.body, marginBottom: 4 }}>{block.intro}</Text> : null}
          {block.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 2.5 }} wrap={false}>
              <View style={{ width: 3.6, height: 3.6, backgroundColor: toneColor(tone), marginTop: 4.6, marginRight: 8 }} />
              <Text style={{ ...S.body, flex: 1 }}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return <NoteTableView table={block.table} exhibit={exhibitNo} title={block.table.title || context} />;
  }
}

function SectionView({ section, index, exhibit, charts }: { section: NoteSection; index: number; exhibit: () => number; charts: boolean }) {
  let tone: Tone = "neutral";
  let context = section.title;
  const rendered: React.ReactNode[] = [];
  let pendingSub: React.ReactNode = null;
  section.blocks.forEach((b) => {
    if (b.type === "subheading") {
      tone = toneOf(b.text);
      context = b.text;
    }
    // Exhibit numbers are assigned here, in document order, before any lazy rendering.
    const el = <BlockView key={b.id} block={b} tone={tone} exhibitNo={b.type === "table" ? exhibit() : 0} context={context} />;
    if (b.type === "subheading") {
      pendingSub = el;
      return;
    }
    // A subheading never sits alone at the bottom of a page: it travels with what follows.
    const grouped = pendingSub ? (
      <View key={`${b.id}-g`} wrap={b.type === "table" || (b.type === "paragraph" && b.text.length > 900)}>
        <View wrap={false}>{pendingSub}</View>
        {el}
      </View>
    ) : el;
    pendingSub = null;
    rendered.push(grouped);
    if (charts && b.type === "table" && financialSeries(b.table)) rendered.push(<FinancialChart key={`${b.id}-chart`} table={b.table} exhibit={exhibit()} />);
  });
  if (pendingSub) rendered.push(pendingSub);

  const header = (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 8, fontWeight: 700, color: brand.accent, marginRight: 8, marginBottom: 1.8 }}>{String(index).padStart(2, "0")}</Text>
        <Text style={{ ...S.serif, fontSize: 14.5 }}>{section.title}</Text>
      </View>
      <View style={{ height: 0.6, backgroundColor: brand.hairline, marginTop: 4 }} />
    </View>
  );
  const [first, ...rest] = rendered;
  const firstSmall = section.blocks[0] && section.blocks[0].type !== "table";
  return (
    <View style={{ marginTop: 10 }}>
      {firstSmall ? (
        <View wrap={false}>
          {header}
          {first}
        </View>
      ) : (
        <>
          <View wrap={false}>{header}</View>
          {first}
        </>
      )}
      {rest}
    </View>
  );
}

function KeyFactsStrip({ note }: { note: RatingNote }) {
  const f = deriveKeyFacts(note);
  const tiles = [
    { label: "Rating", value: f.rating },
    { label: "Outlook", value: f.outlook },
    { label: "Rating action", value: f.action },
    { label: `Total rated${f.amountUnit ? ` (${f.amountUnit})` : ""}`, value: f.totalAmount },
  ].filter((t) => t.value);
  if (!tiles.length) return null;
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 4 }} wrap={false}>
      {tiles.map((t, i) => (
        <View key={t.label} style={{ flex: 1, borderWidth: 0.5, borderColor: brand.hairline, borderTopWidth: 2, borderTopColor: i === 0 ? brand.deep : brand.light, paddingVertical: 8, paddingHorizontal: 9 }}>
          <Text style={{ ...S.caps, color: brand.slate, marginBottom: 3 }}>{t.label}</Text>
          <Text style={{ ...S.serif, fontSize: 13.5 }}>{t.value}</Text>
        </View>
      ))}
    </View>
  );
}

function NoteBody({ note, logo }: { note: RatingNote; logo?: string }) {
  let exhibitNo = 0;
  const exhibit = () => ++exhibitNo;
  const docType = note.meta.documentType || "Press Release";
  const charts = !!note.options?.charts;
  return (
    <>
      <Fixed position="header" style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {logo ? <Image src={logo} style={{ width: 104 }} /> : <Text style={{ ...S.serif, fontSize: 20 }}>ACER</Text>}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ ...S.caps, color: brand.slate }}>{docType}</Text>
            {showsDate(note) ? <Text style={{ fontFamily: fonts.body, fontSize: 7.6, color: brand.heading, marginTop: 2 }}>{note.meta.date}</Text> : null}
          </View>
        </View>
        <View style={{ height: 1.4, marginTop: 7, background: brand.gradient } as Style} />
      </Fixed>

      <Fixed position="footer" style={{ marginTop: 12 }}>
        <View style={{ height: 0.5, backgroundColor: brand.hairline, marginBottom: 6 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: fonts.body, fontSize: 6.2, color: brand.heading, fontWeight: 700 }}>ACER Credit Rating Private Limited</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 5.9, color: brand.slate, marginTop: 1 }}>CIN: U66190HR2024PTC118388  |  SEBI Reg. No.: IN/CRA/009/2025  |  www.acerratings.com  |  contact@acerratings.com</Text>
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 6.6, color: brand.heading, fontWeight: 700 }}>{"Page {{pageNumber}} of {{totalPages}}"}</Text>
        </View>
      </Fixed>

      <View style={{ marginBottom: 4, marginTop: 6 }}>
        <Text style={{ ...S.caps, color: brand.accent, marginBottom: 6 }}>{`Credit Rating  |  ${docType}`}</Text>
        {note.meta.companyName ? <Text style={{ ...S.serif, fontSize: 25, lineHeight: 1.15 }}>{note.meta.companyName}</Text> : null}
        {note.meta.headline ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 11.5, fontWeight: 500, color: brand.ink, lineHeight: 1.4, marginTop: 6 }}>{note.meta.headline}</Text>
        ) : null}
      </View>
      <KeyFactsStrip note={note} />

      {note.instruments ? (
        <View style={{ marginTop: 12 }}>
          <NoteTableView table={note.instruments} exhibit={exhibit()} title={note.instruments.title || "Details of instruments"} />
        </View>
      ) : null}

      {note.sections.map((s, i) => (
        <SectionView key={s.id} section={s} index={i + 1} exhibit={exhibit} charts={charts} />
      ))}

      {note.contacts.length ? (
        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={{ ...S.serif, fontSize: 14.5, marginBottom: 8 }}>Analytical Contacts</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {note.contacts.map((c, i) => (
              <View key={i} style={{ flex: 1, borderWidth: 0.5, borderColor: brand.hairline, borderTopWidth: 2, borderTopColor: brand.deep, padding: 9 }}>
                <Text style={{ ...S.caps, color: brand.slate, marginBottom: 3 }}>{c.role}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 9.6, fontWeight: 700, color: brand.heading }}>{c.name}</Text>
                {c.phone ? <Text style={{ fontFamily: fonts.body, fontSize: 7.8, color: brand.ink, marginTop: 3 }}>{c.phone}</Text> : null}
                {c.email ? <Text style={{ fontFamily: fonts.body, fontSize: 7.8, color: brand.primary, marginTop: 1 }}>{c.email}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {note.disclaimer ? (
        <View style={{ marginTop: 16, padding: 10, backgroundColor: brand.mist }}>
          <Text style={{ ...S.caps, color: brand.slate, marginBottom: 4 }}>Disclaimer</Text>
          {note.disclaimer.split("\n\n").map((p, i) => (
            <Text key={i} style={{ fontFamily: fonts.body, fontSize: 6.7, lineHeight: 1.45, color: brand.slate, marginBottom: 3 }}>{p}</Text>
          ))}
          <Text style={{ fontFamily: fonts.body, fontSize: 6.7, lineHeight: 1.45, color: brand.slate, marginTop: 2 }}>
            For more information and the definition of ratings, please visit www.acerratings.com.
          </Text>
        </View>
      ) : null}
    </>
  );
}

export function RatingNoteDocument({ note, assets }: { note: RatingNote; assets: RenderAssets }) {
  return (
    <Document title={`${note.meta.companyName} | ${note.meta.documentType}`} author="ACER Credit Rating Private Limited" fonts={assets.fonts} lang="en-IN">
      <Page size="A4" margin={[30, 46, 28, 46]} style={{ fontFamily: fonts.body, fontSize: 9, color: brand.ink }}>
        <PdfcnThemeProvider theme={acerTheme}>
          <NoteBody note={note} logo={assets.logo} />
        </PdfcnThemeProvider>
      </Page>
    </Document>
  );
}
