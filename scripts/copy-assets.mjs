// Copies the browser engines (pdf.js worker, Forme WASM) from node_modules into public/.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
copyFileSync("node_modules/@formepdf/core/pkg-web/forme_bg.wasm", "public/forme_bg.wasm");
