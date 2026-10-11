import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

/** A run of text on one line, in PDF points (origin top-left after normalisation). */
export interface Span {
  text: string;
  x: number;
  x2: number;
  size: number;
  bold: boolean;
  italic: boolean;
}

/** A visual cell: spans on a line that sit close together horizontally. */
export interface Cell {
  text: string;
  x: number;
  x2: number;
  bold: boolean;
}

export interface Line {
  page: number;
  /** Distance from the top of the page. */
  y: number;
  size: number;
  spans: Span[];
  cells: Cell[];
  text: string;
  /** True when every non-blank span is bold. */
  bold: boolean;
  italic: boolean;
}

/** A drawn horizontal or vertical rule (table border), in top-down page coordinates. */
export interface Rule {
  page: number;
  dir: "h" | "v";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PdfLayout {
  pages: number;
  pageWidth: number;
  lines: Line[];
  rules: Rule[];
}

interface RawItem {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
}

const CELL_GAP = 9; // pt of horizontal whitespace that separates two table cells

export async function extractPdfLayout(data: Uint8Array): Promise<PdfLayout> {
  const pdf = await getDocumentProxy(data);
  const { OPS } = await getResolvedPDFJS();
  const lines: Line[] = [];
  const rules: Rule[] = [];
  let pageWidth = 595;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    // Loading the operator list populates commonObjs so we can read real font names (bold/italic),
    // and gives us the drawn paths from which table borders are recovered.
    const ops = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    pageWidth = viewport.width;
    collectRules(ops, OPS.constructPath, viewport.height, p, rules);
    const content = await page.getTextContent();

    const fontCache = new Map<string, string>();
    const fontName = (id: string) => {
      if (!fontCache.has(id)) {
        let name = "";
        try {
          name = (page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? "";
        } catch {
          name = "";
        }
        fontCache.set(id, name);
      }
      return fontCache.get(id)!;
    };

    const spans: (Span & { y: number })[] = [];
    for (const raw of content.items as RawItem[]) {
      if (!raw.str || !raw.str.trim()) {
        if (raw.str === " " && spans.length) spans[spans.length - 1].text += " ";
        continue;
      }
      const [a, , , d, e, f] = raw.transform;
      const size = Math.abs(d || a) || 10;
      const name = fontName(raw.fontName);
      spans.push({
        text: raw.str,
        x: e,
        x2: e + raw.width,
        size,
        y: viewport.height - f,
        bold: /bold|black|heavy|semibold/i.test(name),
        italic: /italic|oblique/i.test(name),
      });
    }

    // Group spans into lines. Superscripts ("24th") sit a few points higher, so the tolerance
    // is relative to font size and we always attach to the closest existing line.
    spans.sort((s1, s2) => s1.y - s2.y || s1.x - s2.x);
    const groups: { y: number; size: number; spans: Span[] }[] = [];
    for (const s of spans) {
      const g = groups.find((gr) => Math.abs(gr.y - s.y) <= Math.max(2.5, Math.min(gr.size, s.size) * 0.45));
      if (g) {
        g.spans.push(s);
        if (s.size > g.size) {
          g.size = s.size;
          g.y = s.y;
        }
      } else {
        groups.push({ y: s.y, size: s.size, spans: [s] });
      }
    }

    for (const g of groups.sort((g1, g2) => g1.y - g2.y)) {
      const sorted = g.spans.sort((s1, s2) => s1.x - s2.x);
      const cells: Cell[] = [];
      for (const s of sorted) {
        const last = cells[cells.length - 1];
        if (last && s.x - last.x2 < CELL_GAP) {
          const needsSpace = s.x - last.x2 > s.size * 0.15 && !last.text.endsWith(" ") && !s.text.startsWith(" ");
          last.text += (needsSpace ? " " : "") + s.text;
          last.x2 = Math.max(last.x2, s.x2);
          last.bold = last.bold && s.bold;
        } else {
          cells.push({ text: s.text, x: s.x, x2: s.x2, bold: s.bold });
        }
      }
      for (const c of cells) c.text = c.text.replace(/\s+/g, " ").trim();
      const nonBlank = sorted.filter((s) => s.text.trim());
      lines.push({
        page: p,
        y: g.y,
        size: g.size,
        spans: sorted,
        cells: cells.filter((c) => c.text),
        text: cells.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim(),
        bold: nonBlank.length > 0 && nonBlank.every((s) => s.bold),
        italic: nonBlank.length > 0 && nonBlank.every((s) => s.italic),
      });
    }
  }

  return { pages: pdf.numPages, pageWidth, lines: stripRunningHeadersFooters(lines, pdf.numPages), rules };
}

/**
 * Word/LibreOffice export table borders as thin filled rectangles or stroked lines. pdf.js
 * reports each path with its bounding box, which is all we need to find them.
 */
function collectRules(
  ops: { fnArray: number[]; argsArray: unknown[] },
  constructPath: number,
  pageHeight: number,
  page: number,
  out: Rule[]
) {
  ops.fnArray.forEach((fn, i) => {
    if (fn !== constructPath) return;
    const args = ops.argsArray[i] as unknown[];
    const bbox = args[args.length - 1] as ArrayLike<number> | null;
    if (!bbox || bbox.length < 4) return;
    const [x0, y0, x1, y1] = [bbox[0], bbox[1], bbox[2], bbox[3]];
    const w = x1 - x0;
    const h = y1 - y0;
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    if (h < 2 && w > 6) out.push({ page, dir: "h", x0, x1, y0: pageHeight - y1, y1: pageHeight - y0 });
    else if (w < 2 && h > 6) out.push({ page, dir: "v", x0, x1, y0: pageHeight - y1, y1: pageHeight - y0 });
  });
}

/** Removes page numbers and text that repeats on most pages (letterhead footers). */
function stripRunningHeadersFooters(lines: Line[], pages: number): Line[] {
  const counts = new Map<string, Set<number>>();
  for (const l of lines) {
    const key = l.text.replace(/\d+/g, "#");
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key)!.add(l.page);
  }
  const threshold = Math.max(2, Math.ceil(pages * 0.6));
  return lines.filter((l) => {
    if (/^page\s+\d+\s+of\s+\d+$/i.test(l.text)) return false;
    if (pages >= 3 && counts.get(l.text.replace(/\d+/g, "#"))!.size >= threshold) return false;
    return true;
  });
}

/** Plain-text rendering of a layout, preserving column gaps; used for LLM input and verification. */
export function layoutToText(layout: PdfLayout): string {
  const out: string[] = [];
  let prev: Line | undefined;
  for (const l of layout.lines) {
    if (prev && (l.page !== prev.page || l.y - prev.y > prev.size * 1.9)) out.push("");
    out.push(l.cells.map((c) => c.text).join("   |   "));
    prev = l;
  }
  return out.join("\n");
}
