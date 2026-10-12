import { describe, expect, it } from "vitest";

import { segmentText } from "@/lib/extract/segment";
import { deriveKeyFacts, formatAcerDate, showsDate } from "@/lib/note/derive";
import { northwindSample } from "@/lib/note/samples/northwind";
import { cleanDashes, checkStyle } from "@/lib/note/style";
import { parseHeuristic } from "@/lib/parse/heuristic";
import { checkArithmetic, checkTraceability, verifyNote } from "@/lib/verify/verify";

const clone = <T,>(v: T): T => structuredClone(v);

describe("house style", () => {
  it("removes em and en dashes", () => {
    expect(cleanDashes("Revenue grew — driven by orders")).toBe("Revenue grew, driven by orders");
    expect(cleanDashes("FY25–FY26")).toBe("FY25-FY26");
    expect(cleanDashes("12–15%")).toBe("12-15%");
  });
  it("flags stock AI phrasing", () => {
    const note = clone(northwindSample);
    note.sections[0].blocks[0] = { id: "x", type: "paragraph", text: "Notably, the company has a robust profile." };
    expect(checkStyle(note).some((i) => i.code === "style-phrase")).toBe(true);
  });
});

describe("traceability", () => {
  const source = "Revenue INR 312.40 crore. Rating ACER BBB+ (Stable). Total 100.00. Amount 60.00 and 40.00";
  it("accepts figures present in the source, ignoring formatting differences", () => {
    const note = clone(northwindSample);
    note.sections = [{ id: "s", title: "T", blocks: [{ id: "p", type: "paragraph", text: "Revenue was INR 312.4 crore." }] }];
    note.instruments = null;
    expect(checkTraceability(note, source).filter((i) => i.blockId === "p")).toHaveLength(0);
  });
  it("matches figures with unit suffixes", () => {
    const note = clone(northwindSample);
    note.instruments = null;
    note.sections = [{ id: "s", title: "T", blocks: [{ id: "p", type: "paragraph", text: "Gearing was 1.4 times and coverage 3.2x." }] }];
    expect(checkTraceability(note, "gearing 1.4x, coverage 3.2x in FY26").filter((i) => i.blockId === "p")).toHaveLength(0);
  });
  it("flags invented numbers and ratings", () => {
    const note = clone(northwindSample);
    note.sections = [{ id: "s", title: "T", blocks: [{ id: "p", type: "paragraph", text: "EBITDA was INR 999.10 crore; rated ACER AA." }] }];
    const issues = checkTraceability(note, source).filter((i) => i.blockId === "p");
    expect(issues.map((i) => i.code).sort()).toEqual(["untraced-number", "untraced-rating"]);
  });
});

describe("arithmetic", () => {
  it("passes the consistent sample", () => {
    expect(checkArithmetic(northwindSample)).toHaveLength(0);
  });
  it("catches a wrong total and a wrong margin", () => {
    const note = clone(northwindSample);
    note.instruments!.totalRow![4] = "110.00";
    const t = note.sections.find((s) => s.title.startsWith("Key Financial"))!.blocks[0];
    if (t.type === "table") t.table.rows[2][3] = "80.00%";
    const codes = checkArithmetic(note).map((i) => i.code);
    expect(codes).toContain("total-mismatch");
    expect(codes).toContain("margin-mismatch");
  });
});

describe("key facts and dates", () => {
  it("derives rating facts from the note itself", () => {
    expect(deriveKeyFacts(northwindSample)).toMatchObject({ rating: "ACER BBB+", outlook: "Stable", action: "Assigned", totalAmount: "100.00" });
  });
  it("formats dates in ACER style and respects No date", () => {
    expect(formatAcerDate("2026-08-24")).toBe("24th August 2026");
    expect(formatAcerDate("2026-10-01")).toBe("1st October 2026");
    expect(formatAcerDate("2026-10-12")).toBe("12th October 2026");
    const n = clone(northwindSample);
    n.options.dateMode = "none";
    expect(showsDate(n)).toBe(false);
    expect(verifyNote(n, "").some((i) => i.code === "missing-date")).toBe(false);
  });
});

describe("rules parser tables", () => {
  it("moves footnotes typed inside a table border below the table", () => {
    const note = parseHeuristic([
      { kind: "line", text: "Rating Action", bold: true, italic: false, size: 11, boldLead: "", bullet: false, gap: 20, indent: 0 },
      { kind: "table", rows: [["Instrument", "Amount", "Rating"], ["NCD", "55.00", "ACER BBB-"], ["#Please refer to Annexure V for regulators.", "", ""]] },
    ]);
    expect(note.instruments?.rows).toHaveLength(1);
    expect(note.instruments?.footnotes).toEqual(["#Please refer to Annexure V for regulators."]);
  });
});

describe("rules parser on raw text", () => {
  it("builds sections, drivers, bullets and tables from markdown-ish notes", () => {
    const text = [
      "**Press Release**",
      "**Acme Limited**",
      "**Long-term rating of ACER BBB (Stable) Assigned**",
      "",
      "## Analytical Approach",
      "ACER has considered the standalone profile.",
      "",
      "## Key Rating Drivers",
      "**Credit Strengths**",
      "**Strong order book** The order book was INR 500 crore.",
      "",
      "## Key Financial Indicators",
      "| Particulars | FY25 | FY26 |",
      "| --- | --- | --- |",
      "| Revenue (INR crore) | 100.00 | 120.00 |",
      "",
      "## Rating Sensitivities",
      "- Improvement in scale",
      "- Better margins",
    ].join("\n");
    const note = parseHeuristic(segmentText(text));
    expect(note.meta.companyName).toBe("Acme Limited");
    const titles = note.sections.map((s) => s.title);
    expect(titles).toContain("Analytical Approach");
    expect(titles).toContain("Rating Sensitivities");
    const drivers = note.sections.find((s) => s.title === "Key Rating Drivers")!.blocks;
    expect(drivers.some((b) => b.type === "driver" && b.title === "Strong order book")).toBe(true);
    const fin = note.sections.find((s) => /financial/i.test(s.title))!.blocks[0];
    expect(fin.type === "table" && fin.table.rows[0]).toEqual(["Revenue (INR crore)", "100.00", "120.00"]);
    const sens = note.sections.find((s) => s.title === "Rating Sensitivities")!.blocks[0];
    expect(sens.type === "bullets" && sens.items).toEqual(["Improvement in scale", "Better margins"]);
  });
});

describe("briefing KPIs", () => {
  it("never labels a margin row as an amount", async () => {
    const { buildBriefing } = await import("@/lib/note/briefing");
    const note = structuredClone(northwindSample);
    const t = note.sections.find((s) => s.title.startsWith("Key Financial"))!.blocks[0];
    if (t.type === "table") t.table.rows.push(["PAT margin (%)", "9.00%", "9.50%", "10.06%"]);
    const kpis = buildBriefing(note).kpis;
    expect(kpis.find((k) => k.label === "Profit after tax")).toBeUndefined();
  });
});
