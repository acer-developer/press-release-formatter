import type { Issue, NoteBlock, NoteTable, RatingNote } from "./schema";

/**
 * House-style hygiene. Published notes use plain punctuation and plain analytical language:
 * no em/en dashes and none of the stock phrases that make text read as machine-written.
 */

/** Replaces em and en dashes: ranges become hyphens ("FY25-FY26"), asides become commas. */
export function cleanDashes(s: string): string {
  return s
    .replace(/(\w)\s*[–—]\s*(\w)/g, (m, a: string, b: string) => {
      const spaced = /\s[–—]\s/.test(m);
      const range = /\d/.test(a) && /\d|FY|Q/i.test(b);
      return spaced && !range ? `${a}, ${b}` : `${a}-${b}`;
    })
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/…/g, "...");
}

/** Phrases that read as AI-generated filler in a credit rating note. Matched case-insensitively. */
export const FLAGGED_PHRASES = [
  "delve",
  "it is worth noting",
  "it's worth noting",
  "it is important to note",
  "notably,",
  "furthermore,",
  "moreover,",
  "in conclusion",
  "overall,",
  "in summary",
  "navigate",
  "landscape",
  "robust",
  "seamless",
  "pivotal",
  "testament to",
  "underscores",
  "showcasing",
  "holistic",
  "game-changer",
  "cutting-edge",
  "a myriad of",
  "plays a crucial role",
  "plays a vital role",
  "in today's",
  "ever-evolving",
  "tapestry",
  "unlock",
  "embark",
  "foster",
  "bolster",
] as const;

const mapTable = (t: NoteTable, f: (s: string) => string): NoteTable => ({
  ...t,
  title: f(t.title),
  columns: t.columns.map(f),
  rows: t.rows.map((r) => r.map(f)),
  totalRow: t.totalRow?.map(f),
  source: f(t.source),
  footnotes: t.footnotes.map(f),
});

const mapBlock = (b: NoteBlock, f: (s: string) => string): NoteBlock => {
  switch (b.type) {
    case "paragraph":
    case "subheading":
      return { ...b, text: f(b.text) };
    case "driver":
      return { ...b, title: f(b.title), text: f(b.text) };
    case "bullets":
      return { ...b, intro: f(b.intro), items: b.items.map(f) };
    case "table":
      return { ...b, table: mapTable(b.table, f) };
  }
};

/** Applies a text transform to every string the note prints. */
export function mapNoteText(note: RatingNote, f: (s: string) => string): RatingNote {
  return {
    ...note,
    meta: { documentType: f(note.meta.documentType), date: f(note.meta.date), companyName: f(note.meta.companyName), headline: f(note.meta.headline) },
    instruments: note.instruments ? mapTable(note.instruments, f) : null,
    sections: note.sections.map((s) => ({ ...s, title: f(s.title), blocks: s.blocks.map((b) => mapBlock(b, f)) })),
    contacts: note.contacts.map((c) => ({ role: f(c.role), name: f(c.name), phone: f(c.phone), email: f(c.email) })),
    disclaimer: f(note.disclaimer),
  };
}

/**
 * Print-time substitutions for characters the brand fonts do not contain. "₹" becomes "INR",
 * ACER's own convention, so no figure changes and nothing prints as an empty box.
 */
export const printSafe = (note: RatingNote) =>
  mapNoteText(note, (s) => s.replace(/₹\s*/g, "INR ").replace(/[\u25CF\u25AA]/g, "\u2022"));

export function cleanNote(note: RatingNote): RatingNote {
  return {
    ...note,
    meta: {
      documentType: cleanDashes(note.meta.documentType),
      date: cleanDashes(note.meta.date),
      companyName: cleanDashes(note.meta.companyName),
      headline: cleanDashes(note.meta.headline),
    },
    instruments: note.instruments ? mapTable(note.instruments, cleanDashes) : null,
    sections: note.sections.map((s) => ({ ...s, title: cleanDashes(s.title), blocks: s.blocks.map((b) => mapBlock(b, cleanDashes)) })),
    disclaimer: note.disclaimer.replace(/[–—]/g, "-"),
  };
}

/** Flags style problems that the analyst introduced while editing (or that the model slipped in). */
export function checkStyle(note: RatingNote): Issue[] {
  const issues: Issue[] = [];
  const scan = (text: string, blockId?: string) => {
    if (/[–—]/.test(text)) issues.push({ severity: "info", code: "style-dash", message: "Contains an em/en dash. House style uses commas or hyphens.", blockId });
    const lower = text.toLowerCase();
    const hits = FLAGGED_PHRASES.filter((p) => new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(lower));
    if (hits.length) issues.push({ severity: "info", code: "style-phrase", message: `Generic wording: "${hits.join('", "')}". Prefer specific, plain analytical language.`, blockId });
  };
  scan(note.meta.headline);
  for (const s of note.sections) {
    for (const b of s.blocks) {
      if (b.type === "paragraph" || b.type === "subheading") scan(b.text, b.id);
      else if (b.type === "driver") scan(`${b.title} ${b.text}`, b.id);
      else if (b.type === "bullets") scan([b.intro, ...b.items].join(" "), b.id);
    }
  }
  return issues;
}
