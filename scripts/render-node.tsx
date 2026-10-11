// Dev tool: render a source document (PDF/DOCX/TXT) or note JSON to a PDF from Node.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/render-node.tsx <input> <output.pdf> [note.json]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import { extractDocument } from "../src/lib/extract";
import type { PdfJs } from "../src/lib/extract/pdf-layout";
import { cleanNote } from "../src/lib/note/style";
import { parseHeuristic } from "../src/lib/parse/heuristic";
import { RatingNoteDocument } from "../src/lib/pdf/RatingNoteDocument";

const [input, output, jsonOut] = process.argv.slice(2);
const pub = path.join(process.cwd(), "public");
const font = (f: string) => new Uint8Array(readFileSync(path.join(pub, "fonts", f)));
const fonts = [
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400 },
  { family: "Satoshi", src: font("Satoshi-Medium.ttf"), fontWeight: 500 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 600 },
  { family: "Satoshi", src: font("Satoshi-Bold.ttf"), fontWeight: 700 },
  { family: "Satoshi", src: font("Satoshi-Regular.ttf"), fontWeight: 400, fontStyle: "italic" as const },
  { family: "Caladea", src: font("Caladea-400.ttf"), fontWeight: 400 },
  { family: "Caladea", src: font("Caladea-700.ttf"), fontWeight: 700 },
];
const logo = `data:image/png;base64,${readFileSync(path.join(pub, "acer-logo.png")).toString("base64")}`;

const note = input.endsWith(".json")
  ? JSON.parse(readFileSync(input, "utf8"))
  : cleanNote(parseHeuristic((await extractDocument(input, new Uint8Array(readFileSync(input)), pdfjs as unknown as PdfJs)).items));
writeFileSync(output, await renderDocument(RatingNoteDocument({ note, assets: { fonts, logo } })));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(note, null, 2));
console.log("wrote", output);
