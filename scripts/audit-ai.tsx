// Audit an AI draft: generate with a provider key from the environment and print every finding.
// Usage: GEMINI_KEY=... npx tsx --tsconfig scripts/tsconfig.json scripts/audit-ai.tsx <file|-text> [mode]
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateNote } from "../src/lib/generate";
import type { PdfJs } from "../src/lib/extract/pdf-layout";

const [input, mode] = process.argv.slice(2);
const ai = { keys: { gemini: process.env.GEMINI_KEY ?? "" }, models: {}, preferred: "gemini" as const };
const isText = input.startsWith("-");
const r = await generateNote({
  ...(isText ? { text: readFileSync(input.slice(1), "utf8") } : { fileName: input, data: new Uint8Array(readFileSync(input)) }),
  engine: "gemini",
  mode: mode as never,
  ai,
  pdfjs: pdfjs as unknown as PdfJs,
});
console.log("engine:", r.engine, "| sections:", r.note.sections.map((s) => s.title).join(" > "));
console.log("headline:", r.note.meta.headline);
for (const i of r.issues) console.log(" ", i.severity.padEnd(7), i.code.padEnd(22), i.message.slice(0, 150));
const dashes = JSON.stringify(r.note).match(/[–—]/g)?.length ?? 0;
console.log("em/en dashes in note:", dashes);
