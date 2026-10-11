import { generateStructured, defaultProvider, type AiSettings, type LlmNote, type ProviderId } from "@/lib/ai/providers";
import { buildUserPrompt, SYSTEM_PROMPT, type SourceMode } from "@/lib/ai/prompt";
import { extractDocument } from "@/lib/extract";
import { segmentText } from "@/lib/extract/segment";
import type { PdfJs } from "@/lib/extract/pdf-layout";
import { DEFAULT_DISCLAIMER, newId, type GenerationResult, type Issue, type NoteBlock, type NoteTable, type RatingNote } from "@/lib/note/schema";
import { parseHeuristic } from "@/lib/parse/heuristic";
import { cleanNote } from "@/lib/note/style";
import { verifyNote } from "@/lib/verify/verify";

export type EngineChoice = "auto" | "rules" | ProviderId;

export interface GenerateInput {
  fileName?: string;
  data?: Uint8Array;
  text?: string;
  engine: EngineChoice;
  mode?: SourceMode;
  instructions?: string;
  ai: AiSettings;
  pdfjs: PdfJs;
}

function fromLlm(llm: LlmNote): RatingNote {
  const table = (t: LlmNote["instruments"]): NoteTable => ({
    title: t.title,
    columns: t.columns,
    rows: t.rows,
    totalRow: t.totalRow.some((c) => c.trim()) ? t.totalRow : undefined,
    // Models sometimes repeat the label or cite the input generically; neither belongs in print.
    source: /^(source\s*:\s*)*(the\s+)?source( document| material)?\.?$/i.test(t.source.trim()) ? "" : t.source.replace(/^\s*source\s*:\s*/i, ""),
    footnotes: t.footnotes,
  });
  return {
    meta: { ...llm.meta, documentType: /release/i.test(llm.meta.documentType) || !llm.meta.documentType ? "Press Release" : llm.meta.documentType },
    instruments: llm.instruments.columns.length ? table(llm.instruments) : null,
    sections: llm.sections
      .map((s) => ({
        id: newId("s"),
        title: s.title,
        blocks: s.blocks
          .map((b): NoteBlock | null => {
            const id = newId();
            switch (b.type) {
              case "paragraph":
                return b.text.trim() ? { id, type: "paragraph", text: b.text } : null;
              case "subheading":
                return b.text.trim() ? { id, type: "subheading", text: b.text } : null;
              case "driver":
                return { id, type: "driver", title: b.title, text: b.text };
              case "bullets":
                return b.items.length ? { id, type: "bullets", intro: b.intro, items: b.items } : null;
              case "table":
                return b.table.columns.length ? { id, type: "table", table: table(b.table) } : null;
            }
          })
          .filter((b): b is NoteBlock => b !== null),
      }))
      .filter((s) => s.blocks.length),
    contacts: llm.contacts.filter((c) => c.name),
    disclaimer: llm.disclaimer || DEFAULT_DISCLAIMER,
    options: { charts: false, dateMode: "date", template: "boardroom" },
  };
}

/** Heuristic output quality: a recognisable press release has several standard sections. */
function heuristicLooksComplete(note: RatingNote) {
  const titles = note.sections.map((s) => s.title.toLowerCase()).join(" | ");
  const hits = ["summary", "analytical approach", "key rating drivers", "liquidity", "sensitivit", "about the company"].filter((k) => titles.includes(k));
  return hits.length >= 4;
}

export async function generateNote(input: GenerateInput): Promise<GenerationResult> {
  const doc = input.data
    ? await extractDocument(input.fileName ?? "upload", input.data, input.pdfjs)
    : { kind: "text" as const, text: input.text ?? "", items: segmentText(input.text ?? "") };

  if ("note" in doc && doc.note) {
    return { note: doc.note, issues: verifyNote(doc.note, ""), engine: "import", sourceText: "" };
  }
  if (!doc.text.trim()) throw new Error("The document is empty.");

  const ruleNote = parseHeuristic(doc.items);
  const provider = input.engine === "auto" ? defaultProvider(input.ai) : input.engine === "rules" ? null : input.engine;
  const mode: SourceMode = input.mode ?? (doc.kind === "pdf" || heuristicLooksComplete(ruleNote) ? "existing-note" : "raw-notes");

  // Existing ACER-format documents parse faithfully without AI; AI is used for raw material
  // or when explicitly requested.
  const useAi = provider !== null && (input.engine !== "auto" || mode === "raw-notes" || !heuristicLooksComplete(ruleNote));

  let note = ruleNote;
  let engine = "rules";
  const extra: Issue[] = [];
  if (useAi && provider) {
    const { note: llm, model } = await generateStructured(provider, input.ai, SYSTEM_PROMPT, buildUserPrompt(doc.text, mode, input.instructions ?? ""));
    note = fromLlm(llm);
    engine = `${provider}:${model}`;
    for (const q of llm.openQuestions) extra.push({ severity: "warning", code: "open-question", message: q });
  } else if (input.engine !== "rules" && !provider && !heuristicLooksComplete(ruleNote)) {
    extra.push({
      severity: "info",
      code: "no-ai",
      message: "No AI key is set, so the note was built by the rules engine. Add a free Gemini or Groq key in Settings to draft prose from raw notes.",
    });
  }

  note = cleanNote(note);
  return { note, issues: [...extra, ...verifyNote(note, doc.text, { coverage: engine !== "rules" })], engine, sourceText: doc.text };
}
