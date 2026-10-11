import type { Cell, Line, PdfLayout, Rule } from "./pdf-layout";

/**
 * Document items: the renderer-neutral stream the parser works on. PDF, DOCX and plain text
 * inputs are all converted to this before any interpretation happens.
 */
export type DocItem =
  | {
      kind: "line";
      text: string;
      bold: boolean;
      italic: boolean;
      size: number;
      /** Leading bold run, e.g. "Healthy Order Book-" in "Healthy Order Book- The company..." */
      boldLead: string;
      bullet: boolean;
      /** Vertical whitespace above the line in points (Infinity at a page break). */
      gap: number;
      indent: number;
    }
  | { kind: "table"; rows: string[][] };

const BULLET_RE = /^[●•▪◦‣⁃■□·o§➢►▪-]$/;
const BULLET_PREFIX_RE = /^[●•▪◦‣⁃■·➢►▪]\s*/;

interface Band {
  page: number;
  top: number;
  bottom: number;
  xs: number[];
}

const near = (a: number, b: number, tol = 2.5) => Math.abs(a - b) <= tol;
const uniqSorted = (values: number[], tol = 2.5) => {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || !near(out[out.length - 1], v, tol)) out.push(v);
  return out;
};

/** Finds bordered table rows: horizontal bands closed above and below, split by vertical rules. */
function findBands(rules: Rule[], page: number): Band[] {
  const vs = rules.filter((r) => r.page === page && r.dir === "v");
  const hs = rules.filter((r) => r.page === page && r.dir === "h");
  if (!vs.length || !hs.length) return [];
  // Group vertical rules by their vertical extent: each group is one row of one table.
  const groups: { top: number; bottom: number; xs: number[] }[] = [];
  for (const v of vs) {
    const g = groups.find((gr) => near(gr.top, v.y0, 3) && near(gr.bottom, v.y1, 3));
    const cx = (v.x0 + v.x1) / 2;
    if (g) g.xs.push(cx);
    else groups.push({ top: v.y0, bottom: v.y1, xs: [cx] });
  }
  return groups
    .map((g) => ({ page, top: g.top, bottom: g.bottom, xs: uniqSorted(g.xs) }))
    .filter((b) => b.xs.length >= 2 && b.bottom - b.top > 5)
    .sort((a, b) => a.top - b.top);
}

/** Chains bands that touch vertically into tables. */
function groupBands(bands: Band[]): Band[][] {
  const tables: Band[][] = [];
  for (const b of bands) {
    const t = tables[tables.length - 1];
    const last = t?.[t.length - 1];
    const sameFrame = last && near(last.xs[0], b.xs[0], 4) && near(last.xs[last.xs.length - 1], b.xs[b.xs.length - 1], 4);
    if (last && sameFrame && b.top - last.bottom < 4) t.push(b);
    else tables.push([b]);
  }
  return tables;
}

function bandsToRows(bands: Band[], lines: Line[], claimed: Set<Line>): string[][] {
  // Master columns come from the row with the most cells; narrower rows are merged cells.
  const master = bands.reduce((a, b) => (b.xs.length > a.xs.length ? b : a)).xs;
  const rows: string[][] = [];
  for (const band of bands) {
    // Per grid cell: one entry per visual line, built from spans so that header text that
    // visually runs across a border ("Ratings with  Regulator^") still splits correctly.
    const row: string[][] = Array.from({ length: master.length - 1 }, () => []);
    for (const line of lines) {
      if (line.y - line.size * 0.3 < band.top - 1 || line.y - line.size * 0.7 > band.bottom + 1) continue;
      let used = false;
      const perCell = new Map<number, { text: string; x2: number }>();
      for (const span of line.spans) {
        if (!span.text.trim()) continue;
        const cx = (span.x + span.x2) / 2;
        if (cx < band.xs[0] - 2 || cx > band.xs[band.xs.length - 1] + 2) continue;
        // Find the band cell, then map its left edge onto the master grid.
        let bi = band.xs.findIndex((x, i) => i < band.xs.length - 1 && cx >= x - 1 && cx <= band.xs[i + 1] + 1);
        if (bi < 0) bi = 0;
        const left = band.xs[bi];
        let mi = master.findIndex((x) => near(x, left, 4));
        if (mi < 0) mi = Math.max(0, master.findIndex((x, i) => i < master.length - 1 && cx >= x && cx <= master[i + 1]));
        mi = Math.min(mi, row.length - 1);
        const prev = perCell.get(mi);
        if (prev) {
          const space = span.x - prev.x2 > span.size * 0.15 && !prev.text.endsWith(" ") && !span.text.startsWith(" ");
          prev.text += (space ? " " : "") + span.text;
          prev.x2 = span.x2;
        } else {
          perCell.set(mi, { text: span.text, x2: span.x2 });
        }
        used = true;
      }
      for (const [mi, v] of perCell) row[mi].push(v.text);
      if (used) claimed.add(line);
    }
    const texts = row.map((parts) => parts.join(" ").replace(/\s+/g, " ").trim());
    if (texts.some(Boolean)) rows.push(texts);
  }
  return rows;
}

function mergeBulletCells(line: Line): { cells: Cell[]; bullet: boolean } {
  const cells = [...line.cells];
  if (cells.length >= 2 && BULLET_RE.test(cells[0].text)) {
    cells.shift();
    return { cells, bullet: true };
  }
  if (cells.length && BULLET_PREFIX_RE.test(cells[0].text)) {
    cells[0] = { ...cells[0], text: cells[0].text.replace(BULLET_PREFIX_RE, "") };
    return { cells, bullet: true };
  }
  return { cells, bullet: false };
}

/** Columns for a borderless run: split points halfway between the cells of the widest line. */
function borderlessRows(run: Line[]): string[][] {
  const template = run.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  const splits: number[] = [];
  for (let i = 0; i < template.cells.length - 1; i++) splits.push((template.cells[i].x2 + template.cells[i + 1].x) / 2);
  return run.map((line) => {
    const row = Array.from({ length: template.cells.length }, () => "");
    for (const c of line.cells) {
      const cx = (c.x + c.x2) / 2;
      // Right-aligned numbers: use the right edge when it falls cleanly into a column.
      let idx = splits.findIndex((s) => cx < s);
      if (idx < 0) idx = splits.length;
      row[idx] = row[idx] ? `${row[idx]} ${c.text}` : c.text;
    }
    return row;
  });
}

export function segmentPdf(layout: PdfLayout): DocItem[] {
  const claimed = new Set<Line>();
  const tablesAt = new Map<Line, string[][]>();

  for (let p = 1; p <= layout.pages; p++) {
    const pageLines = layout.lines.filter((l) => l.page === p);
    for (const bands of groupBands(findBands(layout.rules, p))) {
      const rows = bandsToRows(bands, pageLines, claimed);
      const first = pageLines.find((l) => claimed.has(l) && l.y >= bands[0].top - 2);
      if (rows.length && first) tablesAt.set(first, rows);
    }
  }

  const leftMargin = Math.min(...layout.lines.map((l) => (l.cells[0] ? l.cells[0].x : 999)));
  const items: DocItem[] = [];
  let prev: Line | undefined;
  let i = 0;
  const lines = layout.lines;

  while (i < lines.length) {
    const line = lines[i];
    if (tablesAt.has(line)) {
      pushTable(items, tablesAt.get(line)!);
      prev = line;
      i++;
      continue;
    }
    if (claimed.has(line)) {
      prev = line;
      i++;
      continue;
    }

    const { cells, bullet } = mergeBulletCells(line);
    const isMulti = (l: Line) => !claimed.has(l) && mergeBulletCells(l).cells.length >= 2 && !l.italic;

    // Borderless table: two or more consecutive multi-cell lines.
    if (!bullet && cells.length >= 2 && i + 1 < lines.length && isMulti(lines[i + 1]) && lines[i + 1].page === line.page) {
      const run: Line[] = [line];
      let j = i + 1;
      while (j < lines.length && isMulti(lines[j]) && lines[j].page === run[run.length - 1].page && lines[j].y - run[run.length - 1].y < run[run.length - 1].size * 2.2) {
        run.push(lines[j]);
        j++;
      }
      pushTable(items, borderlessRows(run));
      prev = run[run.length - 1];
      i = j;
      continue;
    }

    const gap = !prev || prev.page !== line.page ? Infinity : line.y - prev.y - prev.size;
    const nonBlank = line.spans.filter((s) => s.text.trim());
    let boldLead = "";
    if (!line.bold && nonBlank[0]?.bold) {
      for (const s of nonBlank) {
        if (!s.bold) break;
        boldLead += s.text;
      }
    }
    const text = cells.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      items.push({
        kind: "line",
        text,
        bold: line.bold,
        italic: line.italic,
        size: line.size,
        boldLead: boldLead.replace(/\s+/g, " ").trim(),
        bullet,
        gap,
        indent: (cells[0]?.x ?? leftMargin) - leftMargin,
      });
    }
    prev = line;
    i++;
  }
  return items;
}

/** Appends a table, stitching it to the previous one when a table continues across a page. */
function pushTable(items: DocItem[], rows: string[][]) {
  const last = items[items.length - 1];
  if (last?.kind === "table" && last.rows[0]?.length === rows[0]?.length) {
    const repeatedHeader = rows[0].join("|") === last.rows[0].join("|");
    last.rows.push(...(repeatedHeader ? rows.slice(1) : rows));
    return;
  }
  items.push({ kind: "table", rows });
}

/** Plain text (paragraphs, DOCX-free text, markdown) to items. Tables use "|" or tab separators. */
export function segmentText(text: string): DocItem[] {
  const items: DocItem[] = [];
  let gap = Infinity;
  let pendingTable: string[][] = [];
  const flush = () => {
    if (pendingTable.length) items.push({ kind: "table", rows: pendingTable.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || !c)) });
    pendingTable = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      gap = 12;
      continue;
    }
    const cells = line.includes("|")
      ? line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim())
      : line.includes("\t")
        ? line.split("\t").map((c) => c.trim())
        : null;
    if (cells && cells.length >= 2) {
      pendingTable.push(cells);
      continue;
    }
    flush();
    const md = line.match(/^(#{1,6})\s+(.*)$/);
    const bulletMatch = line.match(/^\s*(?:[-*•●]|\d+[.)])\s+(.*)$/);
    const boldMd = line.match(/^\s*\*\*(.+?)\*\*\s*(.*)$/);
    const content = md ? md[2] : bulletMatch ? bulletMatch[1] : line.trim();
    const isHeadingLike = !!md || (boldMd !== null && !boldMd[2]);
    items.push({
      kind: "line",
      text: content.replace(/\*\*/g, "").trim(),
      bold: isHeadingLike,
      italic: false,
      size: md ? 14 - md[1].length : 11,
      boldLead: boldMd && boldMd[2] ? boldMd[1].trim() : "",
      bullet: !!bulletMatch,
      gap,
      indent: raw.length - raw.trimStart().length,
    });
    gap = 0;
  }
  flush();
  return items;
}
