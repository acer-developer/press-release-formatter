import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";

import { RatingNoteSchema, type RatingNote } from "@/lib/note/schema";

import { extractPdfLayout, layoutToText } from "./pdf-layout";
import { segmentPdf, segmentText, type DocItem } from "./segment";

export interface ExtractedDocument {
  kind: "pdf" | "docx" | "text" | "json";
  /** Flat text used for AI prompts and for traceability checks. */
  text: string;
  items: DocItem[];
  /** Set when the upload is already a structured note (exported JSON). */
  note?: RatingNote;
  pages?: number;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function extractDocument(name: string, data: Uint8Array): Promise<ExtractedDocument> {
  const lower = name.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46);
  if (isPdf) {
    const layout = await extractPdfLayout(data);
    const text = layoutToText(layout);
    if (text.replace(/\s/g, "").length < 40) {
      throw new Error("This PDF has no selectable text (it is probably a scan). Upload a text-based PDF or the DOCX source.");
    }
    return { kind: "pdf", text, items: segmentPdf(layout), pages: layout.pages };
  }
  if (lower.endsWith(".docx")) return extractDocx(data);
  const text = new TextDecoder("utf-8").decode(data);
  if (lower.endsWith(".json") || /^\s*\{/.test(text)) {
    const parsed = RatingNoteSchema.safeParse(JSON.parse(text));
    if (parsed.success) return { kind: "json", text: "", items: [], note: parsed.data };
    // Arbitrary JSON (e.g. a data export): treat as text so every value is still traceable.
    return { kind: "text", text, items: segmentText(jsonToLines(JSON.parse(text))) };
  }
  return { kind: "text", text, items: segmentText(text) };
}

function jsonToLines(value: unknown, prefix = ""): string {
  if (value === null || typeof value !== "object") return `${prefix}${String(value)}`;
  if (Array.isArray(value)) return value.map((v) => jsonToLines(v, prefix)).join("\n");
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => (v !== null && typeof v === "object" ? `## ${k}\n${jsonToLines(v)}` : `**${k}:** ${String(v)}`))
    .join("\n");
}

async function extractDocx(data: Uint8Array): Promise<ExtractedDocument> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  const root = parseHtml(html);
  const items: DocItem[] = [];
  const textParts: string[] = [];
  let gap = Infinity;

  const visit = (el: HTMLElement) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === "table") {
      const rows = el.querySelectorAll("tr").map((tr) => tr.querySelectorAll("td,th").map((c) => c.text.replace(/\s+/g, " ").trim()));
      if (rows.length) {
        items.push({ kind: "table", rows });
        textParts.push(rows.map((r) => r.join("   |   ")).join("\n"));
      }
      gap = 12;
      return;
    }
    if (tag && /^(p|h[1-6]|li)$/.test(tag)) {
      const text = el.text.replace(/\s+/g, " ").trim();
      if (!text) {
        gap = 12;
        return;
      }
      const strong = el.querySelectorAll("strong").map((s) => s.text).join("").replace(/\s+/g, " ").trim();
      const allBold = /^h[1-6]$/.test(tag) || (strong.length > 0 && strong === text);
      const leadingStrong = el.firstChild && (el.firstChild as HTMLElement).tagName?.toLowerCase() === "strong" ? (el.firstChild as HTMLElement).text.trim() : "";
      items.push({
        kind: "line",
        text,
        bold: allBold,
        italic: el.querySelectorAll("em").map((e) => e.text).join("").trim() === text,
        size: /^h[1-6]$/.test(tag) ? 14 - Number(tag[1]) : 11,
        boldLead: !allBold ? leadingStrong : "",
        bullet: tag === "li",
        gap: tag === "li" ? 0 : gap,
        indent: 0,
      });
      textParts.push(text);
      gap = 12;
      return;
    }
    for (const child of el.childNodes) if ((child as HTMLElement).tagName) visit(child as HTMLElement);
  };
  for (const child of root.childNodes) if ((child as HTMLElement).tagName) visit(child as HTMLElement);
  return { kind: "docx", text: textParts.join("\n"), items };
}
