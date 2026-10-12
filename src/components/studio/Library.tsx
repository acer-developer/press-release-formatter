"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { RatingNoteSchema, type RatingNote } from "@/lib/note/schema";
import { deleteNote, getNote, listNotes } from "@/lib/store";

import { useEscape } from "./fields";

interface NoteRow {
  id: string;
  companyName: string;
  headline: string;
  updatedAt: string | number;
}

interface Loaded {
  id: string;
  version: number;
  note: RatingNote;
  sourceText: string;
  engine: string;
}

export function Library({ onClose, onOpen }: { onClose: () => void; onOpen: (n: Loaded) => void }) {
  useEscape(onClose);
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [versions, setVersions] = useState<Record<string, { version: number; createdAt: string | number }[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listNotes()
      .then((notes) => setRows(notes))
      .catch(() => setError("Could not load saved notes from this browser."));

  useEffect(() => {
    void load();
  }, []);

  const open = async (id: string, version?: number) => {
    const stored = await getNote(id);
    const v = stored?.versions.find((x) => x.version === version) ?? stored?.versions.at(-1);
    if (!stored || !v) return setError("Could not open note");
    // Saved notes may come from an older version of the app: validate and normalise them.
    const parsed = RatingNoteSchema.safeParse(v.note);
    if (!parsed.success) return setError("This saved note could not be read. It may come from an incompatible version.");
    onOpen({ id, version: v.version, note: parsed.data, sourceText: v.sourceText, engine: v.engine });
  };

  const showVersions = async (id: string) => {
    const stored = await getNote(id);
    if (stored) setVersions((v) => ({ ...v, [id]: [...stored.versions].reverse().map((x) => ({ version: x.version, createdAt: x.createdAt })) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-10" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="font-serif text-[18px] font-bold text-heading">Saved notes <span className="font-sans text-[11px] font-normal text-muted">(this browser)</span></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-mist">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin max-h-[70vh] overflow-y-auto p-3">
          {error ? <div className="p-3 text-[12px] text-red-700">{error}</div> : null}
          {!rows ? (
            <div className="flex items-center gap-2 p-4 text-[12px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-[12.5px] text-muted">Nothing saved in this browser yet. Use Save in the toolbar to keep a version.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="group rounded-md p-3 hover:bg-mist">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => open(r.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13.5px] font-semibold text-heading">{r.companyName || "Untitled note"}</div>
                    <div className="truncate text-[12px] text-muted">{r.headline}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Updated {new Date(r.updatedAt).toLocaleString()}</div>
                  </button>
                  <button type="button" onClick={() => showVersions(r.id)} className="text-[11.5px] text-teal-ink hover:underline">
                    Versions
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={async () => {
                      if (!confirm("Delete this note and all its versions?")) return;
                      await deleteNote(r.id);
                      void load();
                    }}
                    className="text-muted opacity-0 hover:text-red-700 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {versions[r.id] ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {versions[r.id].map((v) => (
                      <button key={v.version} type="button" onClick={() => open(r.id, v.version)} className="rounded border border-hairline bg-white px-2 py-0.5 text-[11px] hover:border-accent">
                        v{v.version}  |  {new Date(v.createdAt).toLocaleDateString()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
