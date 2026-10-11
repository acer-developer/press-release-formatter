import { readFileSync, writeFileSync } from "fs";
import { extractPdfLayout } from "../src/lib/extract/pdf-layout";
import { segmentPdf } from "../src/lib/extract/segment";
import { parseHeuristic } from "../src/lib/parse/heuristic";
import { renderNotePdf } from "../src/lib/pdf/render";
const note = process.argv[2].endsWith(".json")
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : parseHeuristic(segmentPdf(await extractPdfLayout(new Uint8Array(readFileSync(process.argv[2])))));
writeFileSync(process.argv[3], await renderNotePdf(note));
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(note, null, 2));
console.log("wrote", process.argv[3]);
