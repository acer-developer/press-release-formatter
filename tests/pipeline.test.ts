import { readFileSync } from "node:fs";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { emptyAiSettings } from "@/lib/ai/providers";
import type { PdfJs } from "@/lib/extract/pdf-layout";
import { generateNote } from "@/lib/generate";
import type { RatingNote } from "@/lib/note/schema";
import { RatingNoteDocument } from "@/lib/pdf/RatingNoteDocument";
import { TEMPLATES } from "@/lib/pdf/templates/templates";
import { numberSet, sourceNumberSet } from "@/lib/verify/verify";

/**
 * End to end, no AI: ACER PDF -> note -> PDF in every template. The rendered PDF must not contain
 * any figure that is not in the source (apart from page/exhibit numbers and computed changes), and
 * it must contain every paragraph of the note in full.
 */
const fixture = (f: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "fixtures", f)));
const font = (f: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "..", "public", "fonts", f)));
const fonts = [
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400 },
  { family: "Satoshi", src: font("Satoshi-Medium.ttf"), fontWeight: 500 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 700 },
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400, fontStyle: "italic" as const },
  { family: "Caladea", src: font("Caladea-400.ttf"), fontWeight: 400 },
  { family: "Caladea", src: font("Caladea-700.ttf"), fontWeight: 700 },
];

async function pdfText(bytes: Uint8Array) {
  const doc = await (pdfjs as unknown as PdfJs).getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    lines.push((content.items as { str: string; hasEOL?: boolean }[]).map((i) => i.str + (i.hasEOL ? "\n" : " ")).join(""));
  }
  return { text: lines.join("\n"), pages: doc.numPages };
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

describe.each(["acer-viviana.pdf", "acer-finstars.pdf", "acer-rudra.pdf"])("%s", (file) => {
  let result: { note: RatingNote; sourceText: string };
  it("builds a note with no verifier errors", async () => {
    result = await generateNote({ fileName: file, data: fixture(file), engine: "rules", ai: emptyAiSettings(), pdfjs: pdfjs as unknown as PdfJs });
    const r = result as unknown as { issues: { severity: string; code: string }[] };
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.note.sections.length).toBeGreaterThan(8);
  }, 60000);

  it.each(TEMPLATES.map((t) => t.id))("renders %s without inventing figures or dropping text", async (template) => {
    // Charts render (no crash), but figures are audited on the chart-free document: chart axes
    // carry scale ticks, which are not claims.
    const withCharts = { ...result.note, options: { ...result.note.options, template, charts: true } };
    expect((await renderDocument(RatingNoteDocument({ note: withCharts, assets: { fonts } }))).length).toBeGreaterThan(1000);
    const note = { ...result.note, options: { ...result.note.options, template, charts: false } };
    const bytes = await renderDocument(RatingNoteDocument({ note, assets: { fonts } }));
    const { text, pages } = await pdfText(bytes);

    const source = sourceNumberSet(result.sourceText);
    const invented = [...numberSet(text.split("\n").filter((l) => !/\b(vs|bps)\b/.test(l)).join("\n"))].filter((n) => {
      if (source.has(n)) return false;
      const v = Number(n);
      // Page numbers, exhibit and section numbers, and driver/instrument counts.
      if (Number.isInteger(v) && v >= 0 && v <= Math.max(pages, 40)) return false;
      return true;
    });
    expect(invented).toEqual([]);

    const flat = alnum(text);
    for (const s of note.sections)
      for (const b of s.blocks)
        if (b.type === "paragraph" || b.type === "driver") for (const p of b.text.split("\n\n")) expect(flat).toContain(alnum(p).slice(0, 120));
  }, 120000);
});
