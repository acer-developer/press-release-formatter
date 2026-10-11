import { newId, type BlockType, type NoteBlock, type NoteSection, type NoteTable, type RatingNote } from "./schema";

/** Pure editing helpers shared by the editor and tests. All return new arrays/objects. */

export const move = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const emptyTable = (columns = ["Particulars", "", ""]): NoteTable => ({
  title: "",
  columns,
  rows: [columns.map(() => "")],
  source: "",
  footnotes: [],
});

export function newBlock(type: BlockType): NoteBlock {
  const id = newId();
  switch (type) {
    case "paragraph":
      return { id, type, text: "" };
    case "subheading":
      return { id, type, text: "" };
    case "driver":
      return { id, type, title: "", text: "" };
    case "bullets":
      return { id, type, intro: "", items: [""] };
    case "table":
      return { id, type, table: emptyTable() };
  }
}

/** Section skeletons for the standard press-release structure (empty, never pre-filled with facts). */
export function sectionTemplate(title: string): NoteSection {
  const s: NoteSection = { id: newId("s"), title, blocks: [] };
  if (/key rating drivers/i.test(title)) {
    s.blocks = [
      { id: newId(), type: "subheading", text: "Credit Strengths" },
      { id: newId(), type: "driver", title: "", text: "" },
      { id: newId(), type: "subheading", text: "Credit Weaknesses" },
      { id: newId(), type: "driver", title: "", text: "" },
    ];
  } else if (/sensitivit/i.test(title)) {
    s.blocks = [
      { id: newId(), type: "subheading", text: "Positive sensitivities" },
      { id: newId(), type: "bullets", intro: "", items: [""] },
      { id: newId(), type: "subheading", text: "Negative sensitivities" },
      { id: newId(), type: "bullets", intro: "", items: [""] },
    ];
  } else if (/financial|indicators/i.test(title)) {
    s.blocks = [{ id: newId(), type: "table", table: { ...emptyTable(["Particulars", "FY__", "FY__"]), source: "" } }];
  } else if (/criteria/i.test(title)) {
    s.blocks = [{ id: newId(), type: "bullets", intro: "", items: [""] }];
  } else {
    s.blocks = [{ id: newId(), type: "paragraph", text: "" }];
  }
  return s;
}

export function addColumn(t: NoteTable, at = t.columns.length): NoteTable {
  const ins = <T,>(arr: T[], v: T) => [...arr.slice(0, at), v, ...arr.slice(at)];
  return { ...t, columns: ins(t.columns, ""), rows: t.rows.map((r) => ins(r, "")), totalRow: t.totalRow ? ins(t.totalRow, "") : undefined };
}

export function removeColumn(t: NoteTable, at: number): NoteTable {
  if (t.columns.length <= 1) return t;
  const del = <T,>(arr: T[]) => arr.filter((_, i) => i !== at);
  return { ...t, columns: del(t.columns), rows: t.rows.map(del), totalRow: t.totalRow ? del(t.totalRow) : undefined };
}

/** Deep-clones and applies a mutation; the editor's single write path. */
export function produce(note: RatingNote, fn: (draft: RatingNote) => void): RatingNote {
  const draft = structuredClone(note);
  fn(draft);
  return draft;
}
