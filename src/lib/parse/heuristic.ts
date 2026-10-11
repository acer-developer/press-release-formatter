import type { DocItem } from "@/lib/extract/segment";
import {
  DEFAULT_DISCLAIMER,
  newId,
  type NoteBlock,
  type NoteContact,
  type NoteSection,
  type NoteTable,
  type RatingNote,
} from "@/lib/note/schema";

/**
 * Deterministic parser: turns segmented document items into a RatingNote without any AI.
 * It only re-arranges text that exists in the source; it never writes new prose or figures.
 */

type LineItem = Extract<DocItem, { kind: "line" }>;

interface SectionRule {
  match: RegExp;
  title: string;
  kind?: "instruments" | "contacts" | "disclaimer" | "skip" | "criteria" | "drivers";
}

const SECTION_RULES: SectionRule[] = [
  { match: /^(details of (the )?instruments|rating action)\b/i, title: "Rating Action", kind: "instruments" },
  { match: /^brief summary/i, title: "Brief Summary of the Rating Action" },
  { match: /^analytical approach/i, title: "Analytical Approach" },
  { match: /^key rating drivers/i, title: "Key Rating Drivers", kind: "drivers" },
  { match: /^liquidity/i, title: "" },
  { match: /^applicable (rating )?criteria/i, title: "Applicable Rating Criteria", kind: "criteria" },
  { match: /^rating sensitivit/i, title: "Rating Sensitivities" },
  { match: /^about the (company|entity|issuer)/i, title: "About the Company" },
  { match: /^(financial snapshot|key financial indicators|key financials)/i, title: "" },
  { match: /^any other information/i, title: "Any Other Information" },
  { match: /^rating history/i, title: "Rating History for the Last Three Years" },
  { match: /^complexity level/i, title: "Complexity Level of Rated Instruments" },
  { match: /^annexure\b/i, title: "" },
  { match: /^analytical contacts?/i, title: "Analytical Contacts", kind: "contacts" },
  { match: /^disclaimer/i, title: "Disclaimer", kind: "disclaimer" },
  { match: /^about acer/i, title: "About ACER", kind: "skip" },
  { match: /^(status of non-cooperation|rationale|outlook)\b/i, title: "" },
];

const SUBHEADING_RE = /^(credit strengths?|credit weakness(es)?|positive sensitivit|negative sensitivit|financial snapshot|key financial indicators|comments on liquidity|a\.\s|b\.\s)/i;

const isHeadingLine = (it: LineItem) =>
  it.bold && it.text.length <= 110 && !/[.;,]$/.test(it.text) && !it.bullet;

const titleCase = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Annexure II: Facility-wise lender details: Not Applicable" -> title + inline value. */
function splitInlineValue(text: string): { title: string; value: string } {
  const m = text.match(/^(.*?):\s*(None|Not Applicable|NA|N\.A\.|Nil|Adequate|Strong|Stretched|Poor|Superior)\s*$/i);
  if (m && !/^liquidity/i.test(text)) return { title: m[1].trim(), value: m[2].trim() };
  return { title: text, value: "" };
}

const endsSentence = (s: string) => /[.:;!?)"'”]$/.test(s.trim());

function toTable(rows: string[][]): NoteTable {
  let body = rows.map((r) => r.map((c) => c.trim()));
  // Multi-row headers: a sparse first row (merged header cells) is folded into the second.
  if (body.length >= 3) {
    const empties = body[0].filter((c) => !c).length;
    const hasNumbers = body[1].some((c) => /^-?[\d,.]+%?x?$/.test(c));
    if (empties >= Math.ceil(body[0].length / 2) - 1 && empties > 0 && !hasNumbers) {
      body = [body[0].map((c, i) => [c, body[1][i]].filter(Boolean).join(" ")), ...body.slice(2)];
    }
  }
  const [columns, ...rest] = body;
  const width = columns.length;
  const norm = (r: string[]) => (r.length >= width ? r.slice(0, width) : [...r, ...Array(width - r.length).fill("")]);
  const totalIdx = rest.findIndex((r) => /^total\b/i.test(r[0] ?? ""));
  const totalRow = totalIdx >= 0 && totalIdx === rest.length - 1 ? norm(rest[totalIdx]) : undefined;
  return {
    title: "",
    columns,
    rows: (totalRow ? rest.slice(0, -1) : rest).map(norm),
    totalRow,
    source: "",
    footnotes: [],
  };
}

function contactsFromTable(rows: string[][]): NoteContact[] {
  const out: NoteContact[] = [];
  // Column layout: each column is one analyst (role / name / phone / email stacked).
  if (!rows.some((r) => /name/i.test(r[0] ?? "")) && (rows[0]?.length ?? 0) >= 2) {
    for (let c = 0; c < rows[0].length; c++) {
      const cells = rows.map((r) => r[c] ?? "").filter(Boolean);
      if (!cells.length) continue;
      const contact: NoteContact = { role: cells[0], name: "", phone: "", email: "" };
      // Bordered cells may hold several visual lines joined together, so pick fields by pattern.
      let rest = cells.slice(1).join(" ");
      const email = rest.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (email) {
        contact.email = email[0];
        rest = rest.replace(email[0], " ");
      }
      const phone = rest.match(/\+?\d[\d\s-]{6,}\d(\s*\((?:extn|ext|x)[^)]*\))?/i);
      if (phone) {
        contact.phone = phone[0].trim();
        rest = rest.replace(phone[0], " ");
      }
      contact.name = rest.replace(/\s+/g, " ").trim();
      out.push(contact);
    }
    return out;
  }
  for (const r of rows) {
    const [label = "", value = ""] = r.filter(Boolean);
    if (/name/i.test(label)) out.push({ role: label.replace(/\s*name\s*$/i, "").trim(), name: value, phone: "", email: "" });
    else if (out.length && /(contact|phone|number|tel)/i.test(label)) out[out.length - 1].phone = value;
    else if (out.length && /mail/i.test(label)) out[out.length - 1].email = value;
  }
  return out;
}

export function parseHeuristic(items: DocItem[]): RatingNote {
  const note: RatingNote = {
    meta: { documentType: "Press Release", date: "", companyName: "", headline: "" },
    instruments: null,
    sections: [],
    contacts: [],
    disclaimer: "",
    options: { charts: false, dateMode: "date" },
  };

  let idx = 0;
  // ── Title block: bold lines before the first recognised section heading or table.
  const titleLines: string[] = [];
  while (idx < items.length) {
    const it = items[idx];
    if (it.kind !== "line" || !it.bold || SECTION_RULES.some((r) => r.match.test(it.text))) break;
    titleLines.push(it.text);
    idx++;
    if (titleLines.length >= 6) break;
  }
  for (const t of titleLines) {
    if (/^(press release|rating rationale|rating note|credit rating note)$/i.test(t)) note.meta.documentType = titleCase(t);
    else if (!note.meta.date && /\b(\d{1,2}(st|nd|rd|th)?\s+[A-Z][a-z]+,?\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/.test(t)) note.meta.date = t;
    else if (!note.meta.companyName && !/rating|acer/i.test(t)) note.meta.companyName = t;
    else note.meta.headline = note.meta.headline ? `${note.meta.headline} ${t}` : t;
  }

  let section: NoteSection | null = null;
  let rule: SectionRule | undefined;
  let lastDriver: Extract<NoteBlock, { type: "driver" }> | null = null;
  let pendingDriverTitle = "";
  const disclaimer: string[] = [];

  const startSection = (title: string, r?: SectionRule) => {
    rule = r;
    lastDriver = null;
    pendingDriverTitle = "";
    if (r?.kind === "skip" || r?.kind === "disclaimer" || r?.kind === "contacts") {
      section = null;
      return;
    }
    section = { id: newId("s"), title, blocks: [] };
    note.sections.push(section);
  };
  const blocks = () => {
    if (!section) startSection("Overview");
    return section!.blocks;
  };
  const lastBlock = () => {
    const b = section?.blocks;
    return b && b.length ? b[b.length - 1] : undefined;
  };

  for (; idx < items.length; idx++) {
    const it = items[idx];

    if (it.kind === "table") {
      if (rule?.kind === "contacts") {
        note.contacts.push(...contactsFromTable(it.rows));
        continue;
      }
      if (rule?.kind === "skip") continue;
      const table = toTable(it.rows);
      if (rule?.kind === "instruments" && !note.instruments) {
        note.instruments = { ...table, title: "Details of instruments" };
        continue;
      }
      blocks().push({ id: newId(), type: "table", table });
      lastDriver = null;
      continue;
    }

    // ── "Any other information: None" written as a bold lead-in followed by a plain value.
    if (it.boldLead && SECTION_RULES.some((sr) => sr.match.test(it.boldLead)) && it.text.length - it.boldLead.length < 40) {
      const r = SECTION_RULES.find((sr) => sr.match.test(it.boldLead))!;
      const title = it.boldLead.replace(/[:\-\u2013]\s*$/, "").trim();
      const value = it.text.slice(it.boldLead.length).replace(/^[\s:\-\u2013]+/, "").trim();
      if (/^status of non-cooperation/i.test(title) && section) {
        blocks().push({ id: newId(), type: "driver", title, text: value });
        continue;
      }
      startSection(r.title || title, r);
      if (value && section) blocks().push({ id: newId(), type: "paragraph", text: value });
      continue;
    }

    // ── Headings
    if (isHeadingLine(it)) {
      const r = SECTION_RULES.find((sr) => sr.match.test(it.text));
      if (r) {
        const { title, value } = splitInlineValue(it.text);
        if (r.match.test("financial snapshot") && section && /any other information/i.test((section as NoteSection).title)) {
          blocks().push({ id: newId(), type: "subheading", text: title });
          continue;
        }
        startSection(r.title || title, r);
        if (value && section) blocks().push({ id: newId(), type: "paragraph", text: value });
        continue;
      }
      if (rule?.kind === "skip" || rule?.kind === "disclaimer") continue;
      if (SUBHEADING_RE.test(it.text)) {
        blocks().push({ id: newId(), type: "subheading", text: titleCase(it.text) });
        lastDriver = null;
        pendingDriverTitle = "";
        continue;
      }
      if (rule?.kind === "drivers" || (it.gap < 30 && section)) {
        // Standalone bold title inside a section: the next paragraph is its body.
        pendingDriverTitle = it.text.replace(/[-–—:]\s*$/, "").trim();
        lastDriver = null;
        continue;
      }
      startSection(titleCase(it.text));
      continue;
    }

    if (rule?.kind === "skip") continue;
    if (rule?.kind === "disclaimer") {
      if (disclaimer.length && it.gap < 6 && !endsSentence(disclaimer[disclaimer.length - 1])) disclaimer[disclaimer.length - 1] += ` ${it.text}`;
      else if (disclaimer.length && it.gap < 6) disclaimer[disclaimer.length - 1] += ` ${it.text}`;
      else disclaimer.push(it.text);
      continue;
    }
    if (rule?.kind === "contacts") continue;

    const prevBlock = lastBlock();

    // ── Footnotes and sources under tables (or under the instruments table)
    if (it.italic || /^source\s*:/i.test(it.text) || (/^[*^#~+@]/.test(it.text) && prevBlock?.type === "table")) {
      const target =
        prevBlock?.type === "table" ? prevBlock.table : rule?.kind === "instruments" && note.instruments ? note.instruments : null;
      if (target) {
        if (/^source\s*:/i.test(it.text)) target.source = it.text.replace(/^source\s*:\s*/i, "");
        else if (target.footnotes.length && it.gap < 3 && !/^[*^#~+@]/.test(it.text)) target.footnotes[target.footnotes.length - 1] += ` ${it.text}`;
        else target.footnotes.push(it.text);
        continue;
      }
    }

    // ── Criteria: one line per criterion
    if (rule?.kind === "criteria") {
      if (prevBlock?.type === "bullets") prevBlock.items.push(it.text);
      else blocks().push({ id: newId(), type: "bullets", intro: "", items: [it.text] });
      continue;
    }

    // ── Bullets
    if (it.bullet) {
      if (prevBlock?.type === "bullets") prevBlock.items.push(it.text);
      else {
        // An intro sentence directly above ("Events that could ... are") becomes the list intro.
        let intro = "";
        if (prevBlock?.type === "paragraph" && /(are|include|:)$/i.test(prevBlock.text.trim())) {
          intro = prevBlock.text;
          section!.blocks.pop();
        }
        blocks().push({ id: newId(), type: "bullets", intro, items: [it.text] });
      }
      lastDriver = null;
      continue;
    }
    if (prevBlock?.type === "bullets" && it.gap < 6 && prevBlock.items.length && !endsSentence(prevBlock.items[prevBlock.items.length - 1])) {
      prevBlock.items[prevBlock.items.length - 1] += ` ${it.text}`;
      continue;
    }
    if (prevBlock?.type === "bullets" && it.gap < 6 && it.indent > 4) {
      prevBlock.items[prevBlock.items.length - 1] += ` ${it.text}`;
      continue;
    }

    // ── Lead-in paragraphs: "Title- body"
    if (it.boldLead && it.boldLead.length < it.text.length + 1) {
      const title = it.boldLead.replace(/[-–—:]\s*$/, "").trim();
      const body = it.text.slice(it.text.indexOf(it.boldLead) + it.boldLead.length).replace(/^[\s\-–—:]+/, "");
      lastDriver = { id: newId(), type: "driver", title, text: body };
      blocks().push(lastDriver);
      pendingDriverTitle = "";
      continue;
    }

    // ── Paragraph text
    const continues = it.gap < 6 || (it.gap === Infinity && prevBlock && !endsSentence(textOf(prevBlock)));
    if (pendingDriverTitle) {
      lastDriver = { id: newId(), type: "driver", title: pendingDriverTitle, text: it.text };
      blocks().push(lastDriver);
      pendingDriverTitle = "";
      continue;
    }
    if (continues && prevBlock && (prevBlock.type === "paragraph" || prevBlock.type === "driver")) {
      prevBlock.text += ` ${it.text}`;
      continue;
    }
    if (lastDriver && prevBlock === lastDriver && rule?.kind === "drivers") {
      // A second paragraph belonging to the same driver.
      lastDriver.text += `\n\n${it.text}`;
      continue;
    }
    blocks().push({ id: newId(), type: "paragraph", text: it.text });
  }

  note.disclaimer = disclaimer.length ? disclaimer.join("\n\n") : DEFAULT_DISCLAIMER;
  note.sections = note.sections.filter((s) => s.blocks.length > 0);
  for (const s of note.sections) {
    for (const b of s.blocks) {
      if (b.type === "paragraph" || b.type === "driver") b.text = tidy(b.text);
      if (b.type === "bullets") b.items = b.items.map(tidy);
    }
  }
  return note;
}

const textOf = (b: NoteBlock) =>
  b.type === "paragraph" || b.type === "subheading" ? b.text : b.type === "driver" ? b.text : b.type === "bullets" ? b.items[b.items.length - 1] ?? "" : "";

/** Repairs hyphenation and whitespace introduced by line wrapping. */
function tidy(s: string) {
  return s
    .split("\n\n")
    .map((p) => p.replace(/(\w)- (\w)/g, (m, a, b) => (/[a-z]/.test(b) && /[a-z]/.test(a) ? `${a}-${b}` : m)).replace(/\s+/g, " ").trim())
    .join("\n\n");
}
