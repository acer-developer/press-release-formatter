import { createStore, del, entries, get, set } from "idb-keyval";

import type { RatingNote } from "@/lib/note/schema";

/**
 * Saved notes and their versions, kept in the browser's IndexedDB. Nothing is uploaded:
 * notes stay on the computer where they were saved.
 */

export interface NoteVersion {
  version: number;
  note: RatingNote;
  sourceText: string;
  engine: string;
  createdAt: number;
}

export interface StoredNote {
  id: string;
  companyName: string;
  headline: string;
  createdAt: number;
  updatedAt: number;
  versions: NoteVersion[];
}

const store = typeof indexedDB !== "undefined" ? createStore("press-release-formatter", "notes") : undefined;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function saveNote(input: { id?: string | null; note: RatingNote; sourceText: string; engine: string }) {
  const now = Date.now();
  const id = input.id ?? newId();
  const existing = await get<StoredNote>(id, store);
  const prev = existing?.versions.at(-1);
  const version = (prev?.version ?? 0) + 1;
  const record: StoredNote = {
    id,
    companyName: input.note.meta.companyName,
    headline: input.note.meta.headline,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    // The source document stays attached to every version so traceability checks keep working.
    versions: [...(existing?.versions ?? []), { version, note: input.note, sourceText: input.sourceText || prev?.sourceText || "", engine: input.engine, createdAt: now }],
  };
  await set(id, record, store);
  return { id, version };
}

export async function listNotes(): Promise<StoredNote[]> {
  const all = await entries<string, StoredNote>(store);
  return all.map(([, v]) => v).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getNote = (id: string) => get<StoredNote>(id, store);
export const deleteNote = (id: string) => del(id, store);
