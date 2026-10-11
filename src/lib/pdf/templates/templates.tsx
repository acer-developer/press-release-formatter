import React from "react";
import { Image, Page, Text, View } from "@formepdf/react";
import type { Style } from "@formepdf/react";

import { PdfGraph } from "@/components/pdf/graph/graph";
import { PdfcnThemeProvider } from "@/components/pdf/theme-provider";
import { acerTheme, brand } from "@/lib/pdf-themes/acer";
import { showsDate } from "@/lib/note/derive";
import type { RatingNote } from "@/lib/note/schema";

import {
  Arrow,
  bodyText,
  buildBriefing,
  caps,
  CoverFooter,
  ExhibitLabel,
  F,
  FinanceChart,
  firstSentence,
  FullBody,
  MARGIN_X,
  NoteTableView,
  Pill,
  RunningFooter,
  RunningHeader,
  serif,
  Square,
  tidyItem,
  type Briefing,
  type Driver,
  type HeadingLook,
  type TemplateAssets,
} from "./shared";

export type TemplateId = "boardroom" | "scorecard" | "report";

export const TEMPLATES: { id: TemplateId; letter: string; name: string; blurb: string }[] = [
  { id: "boardroom", letter: "A", name: "Boardroom", blurb: "Cover banner, executive summary, strengths against weaknesses" },
  { id: "scorecard", letter: "B", name: "Scorecard", blurb: "Key-facts sidebar, driver scorecard, rating triggers" },
  { id: "report", letter: "C", name: "Report", blurb: "pdfcn report cards, badges, highlights and risks" },
];

/** Instruments go on the cover only when they fit; long lists move to the start of the body. */
const COVER_ROWS = 6;
const instrumentsOnCover = (note: RatingNote) => !!note.instruments && note.instruments.rows.length <= COVER_ROWS;

const BODY_MARGIN: [number, number, number, number] = [28, MARGIN_X, 26, MARGIN_X];

function BodyPages({ note, assets, look, b, rule }: { note: RatingNote; assets: TemplateAssets; look: HeadingLook; b: Briefing; rule?: "gradient" | "hairline" }) {
  const onCover = instrumentsOnCover(note);
  return (
    <Page size="A4" margin={BODY_MARGIN} style={{ fontFamily: F.body, color: brand.ink }}>
      <RunningHeader note={note} logo={assets.logo} rule={rule} />
      <RunningFooter />
      {!onCover && note.instruments ? (
        <View style={{ marginBottom: 6 }}>
          <ExhibitLabel n={1} title={note.instruments.title || "Rated instruments"} />
          <NoteTableView table={note.instruments} look={look === "bar" ? "soft" : "band"} compact />
        </View>
      ) : null}
      <FullBody note={note} look={look} firstExhibit={note.instruments ? 1 : 0} b={b} />
    </Page>
  );
}

const PageTop = ({ note, logo, rule = "gradient" }: { note: RatingNote; logo?: string; rule?: "gradient" | "hairline" }) => (
  <View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: MARGIN_X, paddingVertical: 14 }}>
      {logo ? <Image src={logo} style={{ width: 82 }} /> : <Text style={{ ...serif, fontSize: 16 }}>ACER</Text>}
      <Text style={{ ...caps, color: brand.slate }}>{note.meta.companyName}</Text>
    </View>
    <View style={{ height: rule === "gradient" ? 1.4 : 0.6, marginHorizontal: MARGIN_X, ...(rule === "gradient" ? { background: brand.gradient } : { backgroundColor: brand.hairline }) } as Style} />
  </View>
);

const Triggers = ({ b, limit = 3, size = 7.7 }: { b: Briefing; limit?: number; size?: number }) => (
  <View>
    {b.upside.slice(0, limit).map((t) => (
      <View key={`u${t}`} style={{ flexDirection: "row", marginBottom: 4 }}>
        <Arrow up color={brand.accent} />
        <Text style={{ fontFamily: F.body, fontSize: size, lineHeight: 1.38, flex: 1 }}>{tidyItem(t)}</Text>
      </View>
    ))}
    {b.downside.slice(0, limit).map((t) => (
      <View key={`d${t}`} style={{ flexDirection: "row", marginBottom: 4 }}>
        <Arrow up={false} color={brand.amber} />
        <Text style={{ fontFamily: F.body, fontSize: size, lineHeight: 1.38, flex: 1 }}>{tidyItem(t)}</Text>
      </View>
    ))}
  </View>
);

const balanceLine = (b: Briefing) =>
  b.strengths.length && b.weaknesses.length
    ? `${b.strengths.length} credit strength${b.strengths.length > 1 ? "s" : ""} balanced against ${b.weaknesses.length} weakness${b.weaknesses.length > 1 ? "es" : ""}`
    : "Key rating drivers";

const unitOf = (b: Briefing) => b.facts.amountUnit || "INR crore";

// ═════════════════════════════════════ A: Boardroom ═════════════════════════════════════
function BoardroomPages({ note, assets }: { note: RatingNote; assets: TemplateAssets }) {
  const b = buildBriefing(note);
  const f = b.facts;
  const tiles = [
    ["Rating", f.rating],
    ["Outlook", f.outlook],
    ["Action", f.action],
    [`Rated (${unitOf(b)})`, f.totalAmount],
  ].filter(([, v]) => v);
  const charts = !!note.options?.charts;

  const Column = ({ title, items, color }: { title: string; items: Driver[]; color: string }) =>
    items.length ? (
      <View style={{ flex: 1 }}>
        <View style={{ backgroundColor: color, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 }}>
          <Text style={{ ...caps, color: "#ffffff" }}>{`${title}  (${items.length})`}</Text>
        </View>
        {items.map((d) => (
          <View key={d.title} style={{ marginBottom: 9 }}>
            <Text style={{ fontFamily: F.body, fontSize: 8.8, fontWeight: 700, color: brand.heading, marginBottom: 2 }}>{d.title}</Text>
            <Text style={{ ...bodyText, fontSize: 7.9 }}>{firstSentence(d.text)}</Text>
          </View>
        ))}
      </View>
    ) : null;

  return (
    <>
      <Page size="A4" margin={0} style={{ fontFamily: F.body, color: brand.ink }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: MARGIN_X, paddingVertical: 16 }}>
          {assets.logo ? <Image src={assets.logo} style={{ width: 96 }} /> : <Text style={{ ...serif, fontSize: 18 }}>ACER</Text>}
          <Text style={{ ...caps, color: brand.slate }}>{`${note.meta.documentType || "Press Release"}${showsDate(note) ? `  |  ${note.meta.date}` : ""}`}</Text>
        </View>
        <View style={{ backgroundColor: brand.deep, paddingHorizontal: MARGIN_X, paddingTop: 26 }}>
          <Text style={{ ...caps, color: brand.lime, marginBottom: 10 }}>Credit rating action</Text>
          <Text style={{ ...serif, color: "#ffffff", fontSize: 30, lineHeight: 1.1 }}>{note.meta.companyName}</Text>
          {note.meta.headline ? <Text style={{ fontFamily: F.body, fontSize: 12, color: "#D6E6E0", marginTop: 8, lineHeight: 1.4, maxWidth: 440 }}>{note.meta.headline}</Text> : null}
          {tiles.length ? (
            <View style={{ flexDirection: "row", marginTop: 22, borderTopWidth: 0.6, borderTopColor: "#4F7A6E" }}>
              {tiles.map(([l, v], i) => (
                <View key={l} style={{ flex: 1, paddingVertical: 12, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: "#4F7A6E" }}>
                  <Text style={{ ...caps, color: "#9FC7BA", marginBottom: 4 }}>{l}</Text>
                  <Text style={{ ...serif, color: "#ffffff", fontSize: 17 }}>{v}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ height: 22 }} />
          )}
        </View>
        <View style={{ height: 3, background: brand.gradient } as Style} />

        <View style={{ flexDirection: "row", paddingHorizontal: MARGIN_X, paddingTop: 24, gap: 22 }}>
          <View style={{ flex: 62 }}>
            <Text style={{ ...caps, color: brand.accent, marginBottom: 4 }}>Executive summary</Text>
            <Text style={{ ...serif, fontSize: 16, marginBottom: 12 }}>What drives the rating</Text>
            {b.keyMessages.map((m, i) => (
              <View key={i} style={{ flexDirection: "row", marginBottom: 11 }}>
                <Text style={{ ...serif, fontSize: 22, color: brand.light, width: 28, lineHeight: 1 }}>{i + 1}</Text>
                <Text style={{ ...bodyText, flex: 1 }}>{m}</Text>
              </View>
            ))}
          </View>
          {b.drivers.length || b.liquidity ? (
            <View style={{ flex: 38, backgroundColor: brand.mist, padding: 12 }}>
              <Text style={{ ...caps, color: brand.slate, marginBottom: 8 }}>Drivers at a glance</Text>
              {b.strengths.map((d) => (
                <View key={d.title} style={{ flexDirection: "row", marginBottom: 5 }}>
                  <Arrow up color={brand.accent} />
                  <Text style={{ fontFamily: F.body, fontSize: 8, lineHeight: 1.35, flex: 1, color: brand.heading }}>{d.title}</Text>
                </View>
              ))}
              {b.strengths.length && b.weaknesses.length ? <View style={{ height: 0.5, backgroundColor: brand.hairline, marginVertical: 6 }} /> : null}
              {b.weaknesses.map((d) => (
                <View key={d.title} style={{ flexDirection: "row", marginBottom: 5 }}>
                  <Arrow up={false} color={brand.amber} />
                  <Text style={{ fontFamily: F.body, fontSize: 8, lineHeight: 1.35, flex: 1, color: brand.heading }}>{d.title}</Text>
                </View>
              ))}
              {b.liquidity ? (
                <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ ...caps, color: brand.slate }}>Liquidity</Text>
                  <View style={{ backgroundColor: brand.deep, paddingVertical: 2.5, paddingHorizontal: 7 }}>
                    <Text style={{ ...caps, color: "#ffffff" }}>{b.liquidity}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {instrumentsOnCover(note) ? (
          <View style={{ paddingHorizontal: MARGIN_X, marginTop: 16 }}>
            <ExhibitLabel n={1} title={note.instruments!.title || "Rated instruments"} />
            <NoteTableView table={note.instruments!} look="rule" compact />
          </View>
        ) : null}
        <CoverFooter />
      </Page>

      {b.drivers.length || b.kpis.length ? (
        <Page size="A4" margin={0} style={{ fontFamily: F.body, color: brand.ink }}>
          <PageTop note={note} logo={assets.logo} />
          <View style={{ paddingHorizontal: MARGIN_X, paddingTop: 18 }}>
            {b.drivers.length ? (
              <>
                <Text style={{ ...caps, color: brand.accent }}>Key rating drivers</Text>
                <Text style={{ ...serif, fontSize: 18, marginTop: 3, marginBottom: 12 }}>{balanceLine(b)}</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Column title="Credit strengths" items={b.strengths} color={brand.accent} />
                  <Column title="Credit weaknesses" items={b.weaknesses} color={brand.amber} />
                </View>
              </>
            ) : null}
            {b.kpis.length ? (
              <>
                <Text style={{ ...caps, color: brand.accent, marginTop: 10 }}>Financial profile</Text>
                <Text style={{ ...serif, fontSize: 18, marginTop: 3, marginBottom: 10 }}>Reported performance at a glance</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {b.kpis.map((k) => (
                    <View key={k.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: brand.deep, backgroundColor: brand.mist, padding: 9 }}>
                      <Text style={{ ...caps, fontSize: 5.8, color: brand.slate }}>{`${k.label}, ${k.period}`}</Text>
                      <Text style={{ ...serif, fontSize: 19, marginTop: 4 }}>{k.value}</Text>
                      {k.change ? <Text style={{ fontFamily: F.body, fontSize: 7, fontWeight: 700, marginTop: 2, color: k.good ? brand.accent : brand.amber }}>{k.change}</Text> : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            <View style={{ marginTop: 14, flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
              {charts && b.fin ? (
                <View style={{ flex: 58 }}>
                  <FinanceChart b={b} width={290} />
                </View>
              ) : null}
              {b.upside.length || b.downside.length ? (
                <View style={{ flex: 42 }}>
                  <Text style={{ ...caps, color: brand.slate, marginBottom: 6 }}>What could change the rating</Text>
                  <Triggers b={b} />
                </View>
              ) : null}
            </View>
            {b.kpis.some((k) => k.change) ? <Text style={{ fontFamily: F.body, fontSize: 6.2, color: brand.slate, marginTop: 8 }}>Changes are computed from the reported figures in this note.</Text> : null}
          </View>
          <CoverFooter />
        </Page>
      ) : null}

      <BodyPages note={note} assets={assets} look="kicker" b={b} />
    </>
  );
}

// ═════════════════════════════════════ B: Scorecard ═════════════════════════════════════
function ScorecardPages({ note, assets }: { note: RatingNote; assets: TemplateAssets }) {
  const b = buildBriefing(note);
  const f = b.facts;
  const side = 176;
  const charts = !!note.options?.charts;
  const sideFacts = [
    ["Rating", f.rating, 22],
    ["Outlook", f.outlook, 15],
    ["Rating action", f.action, 15],
    [`Total rated (${unitOf(b)})`, f.totalAmount, 15],
    ["Liquidity", b.liquidity, 15],
    ["Date", showsDate(note) ? note.meta.date : "", 11],
  ].filter(([, v]) => v) as [string, string, number][];

  const miniCharts = () => {
    if (!charts || !b.finTable || !b.fin) return null;
    const rows = b.finTable.rows.filter((r) => /^(revenue|total income|ebitda|pat|profit|interest coverage|net worth|total assets|gearing|crar)/i.test(r[0])).slice(0, 4);
    if (!rows.length) return null;
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {rows.map((r) => {
          const data = b.fin!.periods.map((p, i) => ({ label: p, value: Number.parseFloat((r[i + 1] ?? "").replace(/[,%x]/g, "")) || 0, color: /Q\d/i.test(p) ? brand.light : brand.deep }));
          return (
            <View key={r[0]} style={{ width: "48.5%", marginBottom: 9, borderWidth: 0.5, borderColor: brand.hairline, padding: 8 }} wrap={false}>
              <Text style={{ fontFamily: F.body, fontSize: 7.8, fontWeight: 700, color: brand.heading, marginBottom: 4 }}>{r[0]}</Text>
              <FinanceChartMini data={data} />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <Page size="A4" margin={0} style={{ fontFamily: F.body, color: brand.ink }}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: side, backgroundColor: brand.mist }} />
        <View style={{ position: "absolute", left: side, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, #8EC641 0%, #54B69C 60%, #43927D 100%)" } as Style} />
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: side, paddingHorizontal: 20, paddingTop: 26 }}>
            {assets.logo ? <Image src={assets.logo} style={{ width: 104, marginBottom: 30 }} /> : null}
            {sideFacts.map(([l, v, size]) => (
              <View key={l} style={{ marginBottom: 13, paddingBottom: 11, borderBottomWidth: 0.5, borderBottomColor: brand.hairline }}>
                <Text style={{ ...caps, color: brand.slate, marginBottom: 3 }}>{l}</Text>
                <Text style={{ ...serif, fontSize: size }}>{v}</Text>
              </View>
            ))}
            {b.strengths.length || b.weaknesses.length ? (
              <>
                <Text style={{ ...caps, color: brand.slate, marginBottom: 6 }}>Driver balance</Text>
                <View style={{ flexDirection: "row", height: 8, marginBottom: 4 }}>
                  {b.strengths.length ? <View style={{ flex: b.strengths.length, backgroundColor: brand.accent }} /> : null}
                  {b.strengths.length && b.weaknesses.length ? <View style={{ width: 2 }} /> : null}
                  {b.weaknesses.length ? <View style={{ flex: b.weaknesses.length, backgroundColor: brand.amber }} /> : null}
                </View>
                <Text style={{ fontFamily: F.body, fontSize: 7, color: brand.slate }}>{`${b.strengths.length} strengths  |  ${b.weaknesses.length} weaknesses`}</Text>
              </>
            ) : null}
          </View>
          <View style={{ flex: 1, paddingLeft: 30, paddingRight: 38, paddingTop: 30 }}>
            <Text style={{ ...caps, color: brand.accent, marginBottom: 8 }}>{`${note.meta.documentType || "Press Release"}  |  Credit rating`}</Text>
            <Text style={{ ...serif, fontSize: 26, lineHeight: 1.12 }}>{note.meta.companyName}</Text>
            <View style={{ height: 2.5, width: 46, backgroundColor: brand.deep, marginVertical: 12 }} />
            {note.meta.headline ? <Text style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 500, color: brand.heading, lineHeight: 1.4 }}>{note.meta.headline}</Text> : null}
            {b.keyMessages.length ? <Text style={{ ...caps, color: brand.accent, marginTop: 20, marginBottom: 6 }}>The rating in brief</Text> : null}
            {b.keyMessages.map((m, i) => (
              <View key={i} style={{ marginBottom: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: i === 0 ? brand.deep : brand.light }}>
                <Text style={bodyText}>{m}</Text>
              </View>
            ))}
            {instrumentsOnCover(note) ? (
              <View style={{ marginTop: 14 }}>
                <ExhibitLabel n={1} title={note.instruments!.title || "Rated instruments"} />
                <NoteTableView table={note.instruments!} look="rule" compact />
              </View>
            ) : null}
          </View>
        </View>
        <CoverFooter />
      </Page>

      {b.drivers.length || b.upside.length || b.downside.length ? (
        <Page size="A4" margin={0} style={{ fontFamily: F.body, color: brand.ink }}>
          <PageTop note={note} logo={assets.logo} />
          <View style={{ paddingHorizontal: MARGIN_X, paddingTop: 16 }}>
            {b.drivers.length ? (
              <>
                <Text style={{ ...serif, fontSize: 17, marginBottom: 10 }}>Rating driver scorecard</Text>
                <View style={{ flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: brand.deep, paddingBottom: 4 }}>
                  <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "30%" }}>Driver</Text>
                  <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "15%" }}>Assessment</Text>
                  <Text style={{ ...caps, fontSize: 6, color: brand.slate, width: "55%" }}>Evidence from the note</Text>
                </View>
                {b.drivers.map((d) => (
                  <View key={d.title} style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.4, borderBottomColor: brand.hairline }} wrap={false}>
                    <Text style={{ fontFamily: F.body, fontSize: 8.2, fontWeight: 700, color: brand.heading, width: "30%", paddingRight: 8, lineHeight: 1.35 }}>{d.title}</Text>
                    <View style={{ width: "15%" }}>
                      <Pill text={d.tone === "s" ? "Strength" : "Weakness"} tone={d.tone === "s" ? "good" : "warn"} filled />
                    </View>
                    <Text style={{ fontFamily: F.body, fontSize: 7.7, lineHeight: 1.4, width: "55%" }}>{firstSentence(d.text)}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {miniCharts() ? (
              <>
                <Text style={{ ...serif, fontSize: 17, marginTop: 16, marginBottom: 10 }}>{`Financial profile${b.fin?.unit ? ` (${b.fin.unit})` : ""}`}</Text>
                {miniCharts()}
              </>
            ) : b.kpis.length ? (
              <>
                <Text style={{ ...serif, fontSize: 17, marginTop: 16, marginBottom: 10 }}>Financial profile</Text>
                <View style={{ flexDirection: "row", borderTopWidth: 1.2, borderTopColor: brand.deep }}>
                  {b.kpis.map((k, i) => (
                    <View key={k.label} style={{ flex: 1, paddingVertical: 9, paddingLeft: i ? 10 : 0, borderLeftWidth: i ? 0.5 : 0, borderLeftColor: brand.hairline }}>
                      <Text style={{ ...caps, fontSize: 5.8, color: brand.slate }}>{`${k.label}, ${k.period}`}</Text>
                      <Text style={{ ...serif, fontSize: 18, marginTop: 3 }}>{k.value}</Text>
                      {k.change ? <Text style={{ fontFamily: F.body, fontSize: 7, fontWeight: 700, color: k.good ? brand.accent : brand.amber }}>{k.change}</Text> : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {b.upside.length || b.downside.length ? (
              <>
                <Text style={{ ...serif, fontSize: 17, marginTop: 16, marginBottom: 8 }}>What could change the rating</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {(
                    [
                      ["Upward triggers", b.upside, brand.accent, true],
                      ["Downward triggers", b.downside, brand.amber, false],
                    ] as const
                  ).map(([title, items, color, up]) =>
                    items.length ? (
                      <View key={title} style={{ flex: 1, borderTopWidth: 2, borderTopColor: color, paddingTop: 6 }}>
                        <Text style={{ ...caps, color, marginBottom: 6 }}>{title}</Text>
                        {items.slice(0, 4).map((t) => (
                          <View key={t} style={{ flexDirection: "row", marginBottom: 4 }}>
                            <Arrow up={up} color={color} />
                            <Text style={{ fontFamily: F.body, fontSize: 7.7, lineHeight: 1.38, flex: 1 }}>{tidyItem(t)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null
                  )}
                </View>
              </>
            ) : null}
          </View>
          <CoverFooter />
        </Page>
      ) : null}

      <BodyPages note={note} assets={assets} look="numbered" b={b} />
    </>
  );
}

function FinanceChartMini({ data }: { data: { label: string; value: number; color: string }[] }) {
  return (
    <PdfcnThemeProvider theme={acerTheme}>
      <PdfGraph variant="bar" data={data as never} width={225} height={74} showValues={false} legend="none" yTicks={3} />
    </PdfcnThemeProvider>
  );
}

// ══════════════════════════════════════ C: Report ══════════════════════════════════════
const Card = ({ title, children, style }: { title?: string; children: React.ReactNode; style?: Style }) => (
  <View style={{ borderWidth: 0.8, borderColor: brand.hairline, borderRadius: 6, padding: 12, ...style }} wrap={false}>
    {title ? <Text style={{ ...caps, color: brand.slate, marginBottom: 9 }}>{title}</Text> : null}
    {children}
  </View>
);

function ReportPages({ note, assets }: { note: RatingNote; assets: TemplateAssets }) {
  const b = buildBriefing(note);
  const f = b.facts;
  const metrics = [
    f.rating ? { l: "Rating", v: f.rating, p: f.action, t: "good" as const } : null,
    f.outlook ? { l: "Outlook", v: f.outlook, p: "", t: "info" as const } : null,
    ...b.kpis.slice(0, 2).map((k) => ({ l: `${k.label}, ${k.period}`, v: k.value, p: k.change, t: (k.good ? "good" : "warn") as "good" | "warn" })),
    f.totalAmount ? { l: `Total rated (${unitOf(b)})`, v: f.totalAmount, p: "", t: "info" as const } : null,
  ].filter(Boolean).slice(0, 4) as { l: string; v: string; p: string; t: "good" | "warn" | "info" }[];

  return (
    <>
      <Page size="A4" margin={[30, MARGIN_X, 50, MARGIN_X]} style={{ fontFamily: F.body, color: brand.ink }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {assets.logo ? <Image src={assets.logo} style={{ width: 96 }} /> : <Text style={{ ...serif, fontSize: 18 }}>ACER</Text>}
          {showsDate(note) ? <Text style={{ fontFamily: F.body, fontSize: 8, color: brand.slate }}>{note.meta.date}</Text> : null}
        </View>
        <View style={{ height: 0.6, backgroundColor: brand.hairline, marginBottom: 16 }} />
        <Text style={{ ...caps, color: brand.accent, marginBottom: 6 }}>{`${note.meta.documentType || "Press Release"}  |  Credit rating`}</Text>
        <Text style={{ ...serif, fontSize: 26, lineHeight: 1.12 }}>{note.meta.companyName}</Text>
        {note.meta.headline ? <Text style={{ fontFamily: F.body, fontSize: 11.5, color: brand.slate, marginTop: 6, lineHeight: 1.4 }}>{note.meta.headline}</Text> : null}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 16 }}>
          {f.rating ? (
            <View style={{ backgroundColor: brand.greenTint, borderRadius: 9, paddingVertical: 2.5, paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: F.body, fontSize: 7, fontWeight: 700, color: brand.primary }}>{`Rating: ${f.rating}${f.outlook ? ` (${f.outlook})` : ""}`}</Text>
            </View>
          ) : null}
          {b.liquidity ? (
            <View style={{ backgroundColor: brand.mist, borderRadius: 9, paddingVertical: 2.5, paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: F.body, fontSize: 7, fontWeight: 700, color: brand.heading }}>{`Liquidity: ${b.liquidity}`}</Text>
            </View>
          ) : null}
        </View>

        {metrics.length ? (
          <Card title="Executive summary">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {metrics.map((m) => (
                <View key={m.l} style={{ width: "48.6%", borderLeftWidth: 2.5, borderLeftColor: m.t === "warn" ? brand.amber : brand.accent, borderWidth: 0.6, borderColor: brand.hairline, padding: 9 }}>
                  <Text style={{ ...caps, fontSize: 5.8, color: brand.slate }}>{m.l}</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: brand.heading, marginTop: 3, marginBottom: m.p ? 4 : 0 }}>{m.v}</Text>
                  {m.p ? <Pill text={m.p} tone={m.t} /> : null}
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {b.drivers.length ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Card title="Highlights and risks" style={{ flex: 58 }}>
              {b.drivers.map((d) => (
                <View key={d.title} style={{ flexDirection: "row", marginBottom: 6 }}>
                  <Square color={d.tone === "s" ? brand.accent : brand.amber} size={8} radius={2} />
                  <Text style={{ fontFamily: F.body, fontSize: 8, lineHeight: 1.35, flex: 1 }}>{d.title}</Text>
                </View>
              ))}
            </Card>
            <Card title="At a glance" style={{ flex: 42 }}>
              {[
                ["Credit strengths", String(b.strengths.length)],
                ["Credit weaknesses", String(b.weaknesses.length)],
                ["Instruments rated", String(note.instruments?.rows.length ?? 0)],
                [`Total rated (${unitOf(b)})`, f.totalAmount],
              ]
                .filter(([, v]) => v)
                .map(([k, v], i, a) => (
                  <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: i < a.length - 1 ? 0.5 : 0, borderBottomColor: brand.hairline }}>
                    <Text style={{ fontFamily: F.body, fontSize: 7.8, color: brand.slate }}>{k}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 7.8, fontWeight: 700, color: brand.heading }}>{v}</Text>
                  </View>
                ))}
            </Card>
          </View>
        ) : null}

        {instrumentsOnCover(note) ? (
          <Card title={note.instruments!.title || "Rated instruments"} style={{ marginTop: 10 }}>
            <NoteTableView table={note.instruments!} look="rule" compact />
          </Card>
        ) : null}
        <CoverFooter />
      </Page>

      <BodyPages note={note} assets={assets} look="bar" b={b} rule="hairline" />
    </>
  );
}

export function TemplatePages({ note, assets }: { note: RatingNote; assets: TemplateAssets }) {
  const t = (note.options?.template ?? "boardroom") as TemplateId;
  if (t === "scorecard") return <ScorecardPages note={note} assets={assets} />;
  if (t === "report") return <ReportPages note={note} assets={assets} />;
  return <BoardroomPages note={note} assets={assets} />;
}
