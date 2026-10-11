"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { RatingNote } from "@/lib/note/schema";

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
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [versions, setVersions] = useState<Record<string, { version: number; createdAt: string | number }[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/notes")
      .then((r) => r.json())
      .then((d) => setRows(d.notes ?? []))
      .catch(() => setError("Could not load saved notes."));

  useEffect(() => {
    void load();
  }, []);

  const open = async (id: string, version?: number) => {
    const res = await fetch(`/api/notes/${id}${version ? `?version=${version}` : ""}`);
    const d = await res.json();
    if (!res.ok) return setError(d.error || "Could not open note");
    setVersions((v) => ({ ...v, [id]: d.versions }));
    onOpen({ id, version: d.current.version, note: d.current.content, sourceText: d.current.sourceText, engine: d.current.engine });
  };

  const showVersions = async (id: string) => {
    const res = await fetch(`/api/notes/${id}`);
    const d = await res.json();
    if (res.ok) setVersions((v) => ({ ...v, [id]: d.versions }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-10" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="font-serif text-[18px] font-bold text-heading">Saved notes</div>
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
            <div className="p-4 text-[12.5px] text-muted">Nothing saved yet. Use Save in the toolbar to keep a version.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="group rounded-md p-3 hover:bg-mist">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => open(r.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13.5px] font-semibold text-heading">{r.companyName || "Untitled note"}</div>
                    <div className="truncate text-[12px] text-muted">{r.headline}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Updated {new Date(r.updatedAt).toLocaleString()}</div>
                  </button>
                  <button type="button" onClick={() => showVersions(r.id)} className="text-[11.5px] text-primary hover:underline">
                    Versions
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={async () => {
                      if (!confirm("Delete this note and all its versions?")) return;
                      await fetch(`/api/notes/${r.id}`, { method: "DELETE" });
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
