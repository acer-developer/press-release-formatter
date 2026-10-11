// Audit: run the full no-AI pipeline on documents and report every verifier finding.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/audit.tsx file1.pdf [file2 ...]
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateNote } from "../src/lib/generate";
import type { PdfJs } from "../src/lib/extract/pdf-layout";
import { emptyAiSettings } from "../src/lib/ai/providers";

for (const f of process.argv.slice(2)) {
  const r = await generateNote({ fileName: f, data: new Uint8Array(readFileSync(f)), engine: "rules", ai: emptyAiSettings(), pdfjs: pdfjs as unknown as PdfJs });
  const by = (c: string) => r.issues.filter((i) => i.code === c).length;
  console.log(`${f.split("/").pop()}: sections=${r.note.sections.length} issues=${r.issues.length} untraced-number=${by("untraced-number")} untraced-rating=${by("untraced-rating")} untraced-name=${by("untraced-name")} unsupported=${by("unsupported-sentence")}`);
  for (const i of r.issues.filter((x) => x.severity !== "info")) console.log("   ", i.severity, i.code, i.message.slice(0, 140));
}
