import Database from "better-sqlite3";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

import type { RatingNote } from "@/lib/note/schema";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  headline: text("headline").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const noteVersions = sqliteTable("note_versions", {
  id: text("id").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content", { mode: "json" }).$type<RatingNote>().notNull(),
  sourceText: text("source_text").notNull().default(""),
  engine: text("engine").notNull().default(""),
  comment: text("comment").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

type DB = ReturnType<typeof drizzle>;
let db: DB | null = null;

function getDb(): DB {
  if (db) return db;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ratingnotes.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, company_name TEXT NOT NULL, headline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, content TEXT NOT NULL, source_text TEXT NOT NULL DEFAULT '',
      engine TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_versions_note ON note_versions(note_id, version);
  `);
  db = drizzle(sqlite);
  return db;
}

export interface SaveInput {
  id?: string;
  note: RatingNote;
  sourceText?: string;
  engine?: string;
  comment?: string;
}

export function saveNote(input: SaveInput) {
  const d = getDb();
  const now = new Date();
  const id = input.id ?? nanoid(12);
  return d.transaction((tx) => {
    const existing = tx.select().from(notes).where(eq(notes.id, id)).get();
    if (existing) {
      tx.update(notes).set({ companyName: input.note.meta.companyName, headline: input.note.meta.headline, updatedAt: now }).where(eq(notes.id, id)).run();
    } else {
      tx.insert(notes).values({ id, companyName: input.note.meta.companyName, headline: input.note.meta.headline, createdAt: now, updatedAt: now }).run();
    }
    const last = tx
      .select({ v: sql<number>`coalesce(max(${noteVersions.version}), 0)` })
      .from(noteVersions)
      .where(eq(noteVersions.noteId, id))
      .get();
    const prevSource = last?.v
      ? tx.select({ s: noteVersions.sourceText }).from(noteVersions).where(eq(noteVersions.noteId, id)).orderBy(desc(noteVersions.version)).limit(1).get()?.s
      : "";
    const version = (last?.v ?? 0) + 1;
    tx.insert(noteVersions)
      .values({
        id: nanoid(12),
        noteId: id,
        version,
        content: input.note,
        // The source document stays attached to every version so traceability checks keep working.
        sourceText: input.sourceText ?? prevSource ?? "",
        engine: input.engine ?? "",
        comment: input.comment ?? "",
        createdAt: now,
      })
      .run();
    return { id, version };
  });
}

export function listNotes() {
  return getDb().select().from(notes).orderBy(desc(notes.updatedAt)).limit(200).all();
}

export function getNote(id: string, version?: number) {
  const d = getDb();
  const meta = d.select().from(notes).where(eq(notes.id, id)).get();
  if (!meta) return null;
  const versions = d
    .select({ version: noteVersions.version, engine: noteVersions.engine, comment: noteVersions.comment, createdAt: noteVersions.createdAt })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, id))
    .orderBy(desc(noteVersions.version))
    .all();
  const target = version ?? versions[0]?.version;
  const row = d
    .select()
    .from(noteVersions)
    .where(sql`${noteVersions.noteId} = ${id} AND ${noteVersions.version} = ${target}`)
    .get();
  return row ? { meta, versions, current: row } : null;
}

export function deleteNote(id: string) {
  getDb().delete(notes).where(eq(notes.id, id)).run();
}
