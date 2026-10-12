import { readFileSync } from "node:fs";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";

import { emptyAiSettings } from "@/lib/ai/providers";
import { extractDocument } from "@/lib/extract";
import type { PdfJs } from "@/lib/extract/pdf-layout";
import { segmentText } from "@/lib/extract/segment";
import { generateNote } from "@/lib/generate";
import { findRatings } from "@/lib/note/rating";
import { RatingNoteSchema, type NoteBlock, type NoteTable, type RatingNote } from "@/lib/note/schema";
import { cleanDashes, cleanNote } from "@/lib/note/style";
import { parseHeuristic } from "@/lib/parse/heuristic";
import { RatingNoteDocument } from "@/lib/pdf/RatingNoteDocument";
import { TEMPLATES } from "@/lib/pdf/templates/templates";
import { checkTraceability, numberSet, sourceNumberSet, verifyNote } from "@/lib/verify/verify";

/** Property and mutation tests with a seeded generator, so every failure is reproducible. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = ReturnType<typeof prng>;
const int = (r: Rand, n: number) => Math.floor(r() * n);
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[int(r, xs.length)];

const WORDS = ["revenue", "EBITDA", "margin", "order", "book", "liquidity", "Stable", "ACER", "crore", "FY2025", "Q1", "the", "of", "and", "₹", "INR", "12.5", "(3.4)", "1,250.00", "x", "%", "–", "—", "-", "Ünïcødé", "日本", "", "  ", "\t", "ACER BBB+", "ACER A1+", "(CE)", "*", "#", "|", "**bold**", "•"];
const sentence = (r: Rand, max = 30) => Array.from({ length: int(r, max) }, () => pick(r, WORDS)).join(pick(r, [" ", " ", " ", "\n", ""]));
const garbage = (r: Rand, n: number) => Array.from({ length: n }, () => String.fromCharCode(pick(r, [int(r, 128), 0x2013, 0x2014, 0x20b9, 0x00a0, 0x0a, 0x09, 0x7c, 0x2022, int(r, 0xffff)]))).join("");

function randomTable(r: Rand): NoteTable {
  const cols = 1 + int(r, 6);
  const row = () => Array.from({ length: cols - int(r, 2) }, () => sentence(r, 4));
  return {
    title: sentence(r, 4),
    columns: Array.from({ length: cols }, () => sentence(r, 3)),
    rows: Array.from({ length: int(r, 40) }, row),
    ...(r() < 0.5 ? { totalRow: row() } : {}),
    source: sentence(r, 5),
    footnotes: Array.from({ length: int(r, 3) }, () => sentence(r, 8)),
  };
}

function randomBlock(r: Rand, id: string): NoteBlock {
  switch (int(r, 5)) {
    case 0: return { id, type: "paragraph", text: r() < 0.05 ? sentence(r, 1500) : sentence(r, 120) };
    case 1: return { id, type: "subheading", text: sentence(r, 6) };
    case 2: return { id, type: "driver", title: sentence(r, 6), text: sentence(r, 100) };
    case 3: return { id, type: "bullets", intro: sentence(r, 10), items: Array.from({ length: int(r, 12) }, () => sentence(r, 25)) };
    default: return { id, type: "table", table: randomTable(r) };
  }
}

function randomNote(r: Rand): RatingNote {
  return {
    meta: { documentType: sentence(r, 3), date: pick(r, ["", "2026-08-24", "not a date", "24th August 2026"]), companyName: sentence(r, 6), headline: sentence(r, 15) },
    instruments: r() < 0.7 ? randomTable(r) : null,
    sections: Array.from({ length: int(r, 14) }, (_, i) => ({
      id: `s${i}`,
      title: pick(r, ["Rating Action", "Key Rating Drivers", "Financial Performance", "Liquidity", "Rating Sensitivities", "About the Company", sentence(r, 5)]),
      blocks: Array.from({ length: int(r, 8) }, (_, j) => randomBlock(r, `s${i}b${j}`)),
    })),
    contacts: Array.from({ length: int(r, 4) }, () => ({ role: sentence(r, 3), name: sentence(r, 3), phone: sentence(r, 2), email: sentence(r, 2) })),
    disclaimer: sentence(r, 200),
    options: { charts: r() < 0.5, dateMode: pick(r, ["date", "none"] as const), template: pick(r, TEMPLATES.map((t) => t.id)) },
  };
}

const font = (f: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "..", "public", "fonts", f)));
const fonts = [
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400 },
  { family: "Satoshi", src: font("Satoshi-Medium.ttf"), fontWeight: 500 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 700 },
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400, fontStyle: "italic" as const },
  { family: "Caladea", src: font("Caladea-400.ttf"), fontWeight: 400 },
  { family: "Caladea", src: font("Caladea-700.ttf"), fontWeight: 700 },
];

describe("mutation: every changed figure or rating in a real note is caught", () => {
  const notes: { file: string; note: RatingNote; source: string }[] = [];
  beforeAll(async () => {
    for (const file of ["acer-viviana.pdf", "acer-finstars.pdf", "acer-rudra.pdf"]) {
      const data = new Uint8Array(readFileSync(path.join(import.meta.dirname, "fixtures", file)));
      const res = await generateNote({ fileName: file, data, engine: "rules", ai: emptyAiSettings(), pdfjs: pdfjs as unknown as PdfJs });
      notes.push({ file, note: res.note, source: res.sourceText });
    }
  }, 120000);

  it("flags 300 random digit mutations in paragraphs, drivers, bullets and tables", () => {
    const r = prng(42);
    let tried = 0;
    let caught = 0;
    const missed: string[] = [];
    for (let k = 0; tried < 300 && k < 5000; k++) {
      const { file, note, source } = pick(r, notes);
      const srcNums = sourceNumberSet(source);
      const m = structuredClone(note);
      const blocks = m.sections.flatMap((s) => s.blocks);
      const b = pick(r, blocks);
      // Pick a text slot in the block that contains a figure.
      const slots: { get: () => string; set: (v: string) => void }[] = [];
      if (b.type === "paragraph" || b.type === "driver") slots.push({ get: () => b.text, set: (v) => (b.text = v) });
      if (b.type === "bullets") b.items.forEach((_, i) => slots.push({ get: () => b.items[i], set: (v) => (b.items[i] = v) }));
      if (b.type === "table") b.table.rows.forEach((row, i) => row.forEach((_, j) => slots.push({ get: () => b.table.rows[i][j], set: (v) => (b.table.rows[i][j] = v) })));
      const withNums = slots.filter((s) => [...s.get().matchAll(/\d[\d,]*(?:\.\d+)?/g)].length);
      if (!withNums.length) continue;
      const slot = pick(r, withNums);
      const text = slot.get();
      const nums = [...text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\dA-WYZa-wyz])/g)];
      if (!nums.length) continue;
      const hit = pick(r, nums);
      const digits = [...hit[0]].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
      const di = pick(r, digits);
      const nd = String((Number(hit[0][di]) + 1 + int(r, 9)) % 10);
      const mutated = hit[0].slice(0, di) + nd + hit[0].slice(di + 1);
      const fresh = [...numberSet(mutated)].filter((n) => !srcNums.has(n));
      if (!fresh.length) continue; // the new value happens to exist in the source
      slot.set(text.slice(0, hit.index!) + mutated + text.slice(hit.index! + hit[0].length));
      tried++;
      const flagged = checkTraceability(m, source).some((i) => i.code === "untraced-number" && i.blockId === b.id);
      if (flagged) caught++;
      else missed.push(`${file} ${b.id}: ${hit[0]} -> ${mutated}`);
    }
    expect(tried).toBe(300);
    expect(missed).toEqual([]);
    expect(caught).toBe(300);
  });

  it("flags every rating symbol swapped for one not in the source", () => {
    const SYMBOLS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "C", "D", "A1+", "A1", "A2+", "A2", "A3+", "A3", "A4+", "A4"];
    for (const { note, source } of notes) {
      const inSource = new Set(findRatings(source));
      for (const sym of SYMBOLS) {
        const rating = `ACER ${sym}`;
        if (inSource.has(rating)) continue;
        const m = structuredClone(note);
        m.sections[0].blocks.unshift({ id: "mut", type: "paragraph", text: `The rating is ${rating} (Stable).` });
        expect(checkTraceability(m, source).some((i) => i.code === "untraced-rating" && i.blockId === "mut"), rating).toBe(true);
      }
    }
  });
});

describe("random input never breaks the pipeline", () => {
  it("segmentText + parseHeuristic always return a schema-valid note (500 inputs)", () => {
    const r = prng(7);
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: int(r, 80) }, () => (r() < 0.3 ? garbage(r, int(r, 120)) : sentence(r, 40)));
      const text = lines.join(pick(r, ["\n", "\n\n", "\r\n"]));
      const note = parseHeuristic(segmentText(text));
      const parsed = RatingNoteSchema.safeParse(note);
      expect(parsed.success, `seed 7 case ${i}`).toBe(true);
    }
  });

  it("verifyNote and cleanNote never throw on random notes (500 notes)", () => {
    const r = prng(11);
    for (let i = 0; i < 500; i++) {
      const note = randomNote(r);
      const source = r() < 0.5 ? sentence(r, 400) : garbage(r, int(r, 2000));
      expect(() => verifyNote(cleanNote(note), source, { coverage: r() < 0.5 })).not.toThrow();
    }
  });

  it("cleanDashes is idempotent and leaves no en or em dash (2,000 strings)", () => {
    const r = prng(3);
    for (let i = 0; i < 2000; i++) {
      const s = r() < 0.5 ? sentence(r, 30) : garbage(r, int(r, 80));
      const once = cleanDashes(s);
      expect(once).not.toMatch(/[–—]/);
      expect(cleanDashes(once)).toBe(once);
    }
  });

  it("cleanDashes keeps the rating notch however the dash is written", () => {
    for (const d of ["-", "‐", "‑", "‒", "–", "—", "−"]) {
      expect(findRatings(cleanDashes(`Rated ACER BBB${d} (Stable) and ACER A${d}.`))).toEqual(["ACER BBB-", "ACER A-"]);
    }
  });

  it("renders 24 random notes across all templates, charts on and off, without throwing", async () => {
    const r = prng(99);
    for (let i = 0; i < 24; i++) {
      const note = randomNote(r);
      note.options = { ...note.options, template: TEMPLATES[i % TEMPLATES.length].id, charts: i % 2 === 0 };
      const bytes = await renderDocument(RatingNoteDocument({ note: cleanNote(note), assets: { fonts } }));
      expect(bytes.length, `case ${i}`).toBeGreaterThan(500);
    }
  }, 300000);

  it("corrupt or random files of every type either extract or fail with a readable error", async () => {
    const r = prng(5);
    const real = readFileSync(path.join(import.meta.dirname, "fixtures", "acer-rudra.pdf"));
    for (let i = 0; i < 40; i++) {
      const ext = pick(r, ["pdf", "docx", "json", "txt", "md", "csv"]);
      let data: Uint8Array;
      if (i % 4 === 0) data = new Uint8Array(real.subarray(0, int(r, real.length))); // truncated PDF
      else data = Uint8Array.from({ length: int(r, 4000) }, () => int(r, 256));
      try {
        await extractDocument(`f.${ext}`, data, pdfjs as unknown as PdfJs);
      } catch (e) {
        expect(e, `case ${i} .${ext}`).toBeInstanceOf(Error);
        expect((e as Error).message.length).toBeGreaterThan(0);
      }
    }
  }, 120000);
});
