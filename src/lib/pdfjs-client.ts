import type { PdfJs } from "@/lib/extract/pdf-layout";
import { asset } from "@/lib/asset";

let cached: Promise<PdfJs> | null = null;

/** Lazily loads pdf.js in the browser with its worker served from the site. */
export function loadPdfJs(): Promise<PdfJs> {
  cached ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = asset("/pdf.worker.min.mjs");
    return pdfjs as unknown as PdfJs;
  });
  return cached;
}
