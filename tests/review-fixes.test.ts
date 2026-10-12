import { describe, expect, it } from "vitest";

import { emptyAiSettings } from "@/lib/ai/providers";
import { extractDocument } from "@/lib/extract";
import type { PdfJs } from "@/lib/extract/pdf-layout";
import { segmentText } from "@/lib/extract/segment";
import { generateNote } from "@/lib/generate";
import { deriveKeyFacts, parseNumber } from "@/lib/note/derive";
import { edit, initHistory, redo, replace, undo } from "@/lib/note/history";
import { findRatings } from "@/lib/note/rating";
import { northwindSample } from "@/lib/note/samples/northwind";
import { emptyNote, type RatingNote } from "@/lib/note/schema";
import { cleanDashes } from "@/lib/note/style";
import { parseHeuristic } from "@/lib/parse/heuristic";
import { checkCompleteness, checkTraceability } from "@/lib/verify/verify";

/** One regression test per code-review finding. */
const clone = <T,>(v: T): T => structuredClone(v);
const noPdf = {} as PdfJs;

describe("rating symbols", () => {
  it.each([
    ["ACER Assigns ACER BBB- (Stable) to Foo Ltd", "ACER BBB-"],
    ["ACER Downgrades Foo to ACER BB (Negative)", "ACER BB"],
    ["Long-term rating of ACER A1+ reaffirmed", "ACER A1+"],
    ["ACER AA+(CE) (Stable) assigned", "ACER AA+(CE)"],
    ["ACER BBB– (Stable) assigned", "ACER BBB-"],
  ])("reads %j as %s", (headline, expected) => {
    const note = { ...emptyNote(), meta: { ...emptyNote().meta, headline } };
    expect(deriveKeyFacts(note).rating).toBe(expected);
  });
  it("does not read ACER's own name as a rating", () => {
    expect(findRatings("ACER Credit Rating Private Limited and ACER Downgrades")).toEqual([]);
  });
});

describe("rating traceability is exact", () => {
  const note = (text: string): RatingNote => ({ ...clone(northwindSample), instruments: null, sections: [{ id: "s", title: "T", blocks: [{ id: "p", type: "paragraph", text }] }] });
  it.each([
    ["ACER AA+ (Stable)", "The rating is ACER AA (Stable)."],
    ["ACER AAA (Stable)", "The rating is ACER A (Stable)."],
    ["ACER A1+", "The rating is ACER A1."],
    ["ACER BBB- (Stable)", "The rating is ACER BBB (Stable)."],
  ])("source %s does not support %s", (source, text) => {
    expect(checkTraceability(note(text), source).some((i) => i.code === "untraced-rating")).toBe(true);
  });
  it("accepts the same rating written with an en dash", () => {
    expect(checkTraceability(note("Rated ACER BBB- (Stable)."), "ACER BBB– (Stable)").some((i) => i.code === "untraced-rating" && i.blockId === "p")).toBe(false);
  });
  it("does not raise a false conflict for extra spaces", () => {
    const n = clone(northwindSample);
    n.meta.headline = "Long-term rating of ACER  BBB+ (Stable) Assigned";
    expect(checkCompleteness(n).some((i) => i.code === "rating-conflict")).toBe(false);
  });
});

describe("dash cleaning keeps meaning", () => {
  it.each([
    ["ACER BBB– (Stable)", "ACER BBB- (Stable)"],
    ["FY25 – FY26", "FY25-FY26"],
    ["12–15%", "12-15%"],
    ["Revenue grew — driven by orders", "Revenue grew, driven by orders"],
    ["–", "-"],
    ["Outlook —", "Outlook"],
    ["Delhi–Mumbai", "Delhi-Mumbai"],
  ])("%j -> %j", (input, expected) => expect(cleanDashes(input)).toBe(expected));
});

describe("numbers", () => {
  it.each([
    ["(3.2)", -3.2],
    ["-12.50", -12.5],
    ["−4.0", -4],
    ["1,234.56", 1234.56],
    ["NA", null],
    ["-", null],
  ])("parseNumber(%j) = %s", (s, v) => expect(parseNumber(s)).toBe(v));
});

describe("undo history is pure", () => {
  it("gives the same result when an updater runs twice (StrictMode)", () => {
    const h = initHistory(emptyNote());
    const once = edit(h, (d) => void (d.meta.companyName = "A"), true);
    const twice = edit(h, (d) => void (d.meta.companyName = "A"), true);
    expect(twice).toEqual(once);
    expect(h.past).toHaveLength(0); // the input is never mutated
  });
  it("undoes and redoes in order without duplicates", () => {
    let h = initHistory(emptyNote());
    for (const name of ["A", "B", "C"]) h = edit(h, (d) => void (d.meta.companyName = name), true);
    h = undo(undo(h));
    expect(h.present.meta.companyName).toBe("A");
    h = redo(h);
    expect(h.present.meta.companyName).toBe("B");
    expect(h.future.map((n) => n.meta.companyName)).toEqual(["C"]);
    h = replace(h, northwindSample);
    expect(h.future).toEqual([]);
    expect(undo(h).present.meta.companyName).toBe("B");
  });
  it("coalesces typing into one undo step", () => {
    let h = initHistory(emptyNote());
    h = edit(h, (d) => void (d.meta.companyName = "N"), true);
    for (const name of ["No", "Nor", "Nort"]) h = edit(h, (d) => void (d.meta.companyName = name), false);
    expect(undo(h).present.meta.companyName).toBe("");
  });
});

describe("inputs that used to crash", () => {
  it("reads text that starts with a brace as text", async () => {
    const d = await extractDocument("notes.txt", new TextEncoder().encode("{Company} Acme Limited\nRevenue INR 10.00 crore."), noPdf);
    expect(d.kind).toBe("text");
  });
  it("reads a malformed .json file as text", async () => {
    const d = await extractDocument("broken.json", new TextEncoder().encode('{"meta": {"companyName": "Acme"'), noPdf);
    expect(d.kind).toBe("text");
  });
  it("keeps an imported note's own template and chart choices", async () => {
    const n = { ...clone(northwindSample), options: { charts: true, dateMode: "none" as const, template: "report" as const } };
    const r = await generateNote({ fileName: "n.json", data: new TextEncoder().encode(JSON.stringify(n)), engine: "rules", ai: emptyAiSettings(), pdfjs: noPdf });
    expect(r.note.options).toEqual(n.options);
  });
});

describe("parser", () => {
  it("keeps a fully bold sentence as a paragraph, not an empty driver", () => {
    const note = parseHeuristic(segmentText("## About the Company\n**The company was founded in Pune and makes pumps.**"));
    const blocks = note.sections[0].blocks;
    expect(blocks.some((b) => b.type === "driver" && !b.text)).toBe(false);
  });
});

describe("bugs found by fuzzing", () => {
  it("a bold lead-in before any section becomes a driver, not null", () => {
    const note = parseHeuristic(segmentText("**Strong order book** - revenue grew"));
    expect(note.sections.flatMap((s) => s.blocks).every(Boolean)).toBe(true);
  });
  it("a bare bold lead with a stray character does not crash the parser", () => {
    expect(() => parseHeuristic(segmentText("**bold** #"))).not.toThrow();
  });
  it("runs of dashes and dashes at line ends are all removed, line breaks kept", () => {
    expect(cleanDashes("a \u2013 \u2013 b")).toBe("a, b");
    expect(cleanDashes("first \u2014\nsecond")).toBe("first\nsecond");
  });
});

