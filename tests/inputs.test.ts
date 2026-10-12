import { readFileSync } from "node:fs";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { emptyAiSettings } from "@/lib/ai/providers";
import type { PdfJs } from "@/lib/extract/pdf-layout";
import { generateNote } from "@/lib/generate";
import { northwindSample } from "@/lib/note/samples/northwind";
import { emptyNote } from "@/lib/note/schema";
import { RatingNoteDocument } from "@/lib/pdf/RatingNoteDocument";
import { TEMPLATES } from "@/lib/pdf/templates/templates";

const base = { engine: "rules" as const, ai: emptyAiSettings(), pdfjs: pdfjs as unknown as PdfJs };
const font = (f: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "..", "public", "fonts", f)));
const fonts = [
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 700 },
  { family: "Caladea", src: font("Caladea-700.ttf"), fontWeight: 700 },
];

describe("every input type", () => {
  it("reads a DOCX note: headings, bold lead-ins, bullets and tables", async () => {
    const data = new Uint8Array(readFileSync(path.join(import.meta.dirname, "fixtures", "sample-note.docx")));
    const r = await generateNote({ ...base, fileName: "sample-note.docx", data });
    expect(r.note.meta.companyName).toBe("Kestrel Logistics Limited (Test)");
    expect(r.note.instruments?.rows[0][1]).toBe("40.00");
    expect(r.note.instruments?.totalRow?.[1]).toBe("40.00");
    const drivers = r.note.sections.find((s) => /drivers/i.test(s.title))!.blocks;
    expect(drivers.some((b) => b.type === "driver" && b.title === "Diversified customer base")).toBe(true);
    const sens = r.note.sections.find((s) => /sensitiv/i.test(s.title))!.blocks.find((b) => b.type === "bullets");
    expect(sens?.type === "bullets" && sens.items).toEqual(["Improvement in EBITDA margin above 9%", "Net leverage above 3.5x"]);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("reads pasted text", async () => {
    const r = await generateNote({ ...base, text: "## About the Company\nAcme Limited makes pumps in Pune. Revenue was INR 120.50 crore in FY26." });
    expect(r.note.sections[0].title).toBe("About the Company");
    expect(r.issues.some((i) => i.code === "untraced-number")).toBe(false);
  });

  it("imports an exported note JSON unchanged", async () => {
    const data = new TextEncoder().encode(JSON.stringify(northwindSample));
    const r = await generateNote({ ...base, fileName: "note.json", data });
    expect(r.engine).toBe("import");
    expect(r.note.sections.map((s) => s.title)).toEqual(northwindSample.sections.map((s) => s.title));
  });

  it("rejects an empty document with a clear message", async () => {
    await expect(generateNote({ ...base, text: "   " })).rejects.toThrow(/empty/i);
  });
});

describe("rendering edge cases", () => {
  it.each(TEMPLATES.map((t) => t.id))("renders a blank note in %s without crashing", async (template) => {
    const note = { ...emptyNote(), options: { charts: true, dateMode: "none" as const, template, palette: "teal" as const } };
    expect((await renderDocument(RatingNoteDocument({ note, assets: { fonts } }))).length).toBeGreaterThan(500);
  });

  it("prints the rupee sign as INR so no glyph is missing", async () => {
    const note = structuredClone(northwindSample);
    note.sections[0].blocks = [{ id: "p", type: "paragraph", text: "Revenue was ₹312.40 crore." }];
    const bytes = await renderDocument(RatingNoteDocument({ note, assets: { fonts } }));
    const doc = await (pdfjs as unknown as PdfJs).getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    let text = "";
    for (let n = 1; n <= doc.numPages; n++) text += ((await (await doc.getPage(n)).getTextContent()).items as { str: string }[]).map((i) => i.str).join(" ");
    expect(text).toContain("INR 312.40");
    expect(text).not.toContain("₹");
  });
});
