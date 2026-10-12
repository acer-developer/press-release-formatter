"use client";

import { asset } from "@/lib/asset";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileJson,
  FileText,
  FileUp,
  FolderOpen,
  KeyRound,
  Info,
  Loader2,
  Printer,
  Redo2,
  Save,
  Sparkles,
  Type,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { isAvailable, PROVIDERS, type AiSettings } from "@/lib/ai/providers";
import type { EngineChoice } from "@/lib/generate";
import { produce } from "@/lib/note/ops";
import { loadPdfJs } from "@/lib/pdfjs-client";
import { loadAiSettings, saveAiSettings } from "@/lib/settings";
import { saveNote } from "@/lib/store";
import { TEMPLATES } from "@/lib/pdf/templates/templates";
import { northwindSample } from "@/lib/note/samples/northwind";
import { emptyNote, type Issue, type RatingNote } from "@/lib/note/schema";
import { verifyNote } from "@/lib/verify/verify";

import { NoteEditor } from "./NoteEditor";
import { PrintView } from "./PrintView";
import { Library } from "./Library";
import { SettingsDialog } from "./SettingsDialog";


const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.json,.csv";

export function Studio() {
  const [note, setNote] = useState<RatingNote>(() => emptyNote());
  const [past, setPast] = useState<RatingNote[]>([]);
  const [future, setFuture] = useState<RatingNote[]>([]);
  const lastPush = useRef(0);

  const [sourceText, setSourceText] = useState("");
  const [engineUsed, setEngineUsed] = useState("");
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const [inputMode, setInputMode] = useState<"document" | "text">("document");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [engine, setEngine] = useState("auto");
  const [sourceKind, setSourceKind] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ai, setAi] = useState<AiSettings>({ keys: {}, models: {}, preferred: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [panel, setPanel] = useState<"source" | "review">("source");
  const [view, setView] = useState<"page" | "print">("page");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setAi(loadAiSettings());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /** Single write path for edits, with coalesced undo history while typing. */
  const mutate = useCallback((fn: (draft: RatingNote) => void) => {
    setNote((prev) => {
      const now = Date.now();
      if (now - lastPush.current > 700) {
        setPast((p) => [...p.slice(-80), prev]);
        setFuture([]);
      }
      lastPush.current = now;
      return produce(prev, fn);
    });
    setDirty(true);
  }, []);

  const replaceNote = (next: RatingNote) => {
    setPast((p) => [...p.slice(-80), note]);
    setFuture([]);
    setNote(next);
  };

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [note, ...f]);
      setNote(prev);
      return p.slice(0, -1);
    });
  }, [note]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setPast((p) => [...p, note]);
      setNote(next);
      return rest;
    });
  }, [note]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Live verification against the source document as the analyst edits.
  const deferredNote = useDeferredValue(note);
  const liveIssues = useMemo(() => verifyNote(deferredNote, sourceText, { coverage: !!engineUsed && engineUsed !== "rules" && engineUsed !== "sample" }), [deferredNote, sourceText, engineUsed]);
  const issues = useMemo(() => {
    const advisory = serverIssues.filter((i) => i.code === "open-question" || i.code === "no-ai");
    return [...advisory, ...liveIssues];
  }, [serverIssues, liveIssues]);
  const issuesByBlock = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) if (i.blockId) m.set(i.blockId, [...(m.get(i.blockId) ?? []), i]);
    return m;
  }, [issues]);
  const counts = useMemo(
    () => ({
      error: issues.filter((i) => i.severity === "error").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    }),
    [issues]
  );

  async function generate() {
    setError(null);
    let data: Uint8Array | undefined;
    if (inputMode === "document") {
      if (!file) return setError("Choose a document first.");
      if (file.size > 15 * 1024 * 1024) return setError("File is larger than 15 MB.");
      data = new Uint8Array(await file.arrayBuffer());
    } else if (!rawText.trim()) {
      return setError("Paste or type the source material first.");
    }
    setBusy("Reading the source and building the note");
    try {
      // Heavy engines (PDF/DOCX readers, AI SDK) load on first use to keep the page fast.
      const { generateNote } = await import("@/lib/generate");
      const result = await generateNote({
        fileName: file?.name,
        data,
        text: inputMode === "text" ? rawText : undefined,
        engine: engine as EngineChoice,
        mode: sourceKind === "existing-note" || sourceKind === "raw-notes" ? sourceKind : undefined,
        instructions,
        ai,
        pdfjs: await loadPdfJs(),
      });
      // Presentation choices made before generating (charts, date, template) carry over to the new note.
      replaceNote({ ...result.note, options: { charts: note.options?.charts ?? false, dateMode: note.options?.dateMode ?? "date", template: note.options?.template ?? "boardroom" } });
      setSourceText(result.sourceText);
      setServerIssues(result.issues);
      setEngineUsed(result.engine);
      setNoteId(null);
      setVersion(null);
      setDirty(true);
      setPanel("review");
      setView("page");
      setToast(result.engine === "rules" ? "Note built from the document without AI" : `Note drafted with ${result.engine}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("Saving version");
    try {
      const saved = await saveNote({ id: noteId, note, sourceText, engine: engineUsed });
      setNoteId(saved.id);
      setVersion(saved.version);
      setDirty(false);
      setToast(`Saved as version ${saved.version} in this browser`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    if (counts.error > 0 && !confirm(`${counts.error} unresolved error(s) in the review panel. Export anyway as a draft?`)) return;
    setBusy("Rendering PDF");
    try {
      const { renderNotePdf } = await import("@/lib/pdf/render");
      const pdf = await renderNotePdf(note);
      const blob = new Blob([pdf as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(note.meta.companyName || "rating-note").replace(/[^\w]+/g, "-")}-press-release.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(null);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(note, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(note.meta.companyName || "rating-note").replace(/[^\w]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const jumpTo = (id?: string) => {
    if (!id) return;
    setView("page");
    setFocusId(id);
    requestAnimationFrame(() => document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    setTimeout(() => setFocusId(null), 1800);
  };

  const charts = !!note.options?.charts;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-white px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/acer-logo.png")} alt="ACER" className="h-7 w-auto" />
        <div className="h-6 w-px bg-hairline" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-heading">Rating Note Studio</div>
          <div className="truncate text-[11px] text-muted">
            {note.meta.companyName || "Untitled note"}
            {version ? `  |  v${version}` : ""}
            {dirty ? "  |  unsaved changes" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ToolbarButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}>
            <Undo2 size={15} />
          </ToolbarButton>
          <ToolbarButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length}>
            <Redo2 size={15} />
          </ToolbarButton>
          <div className="mx-1 h-6 w-px bg-hairline" />
          <div className="inline-flex h-8 items-center rounded-md border border-hairline p-0.5" role="group" aria-label="Template">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={`${t.letter}: ${t.name}. ${t.blurb}`}
                onClick={() => mutate((d) => void (d.options = { ...d.options, template: t.id }))}
                className={`h-full rounded px-2.5 text-[12px] font-semibold ${(note.options?.template ?? "boardroom") === t.id ? "bg-deep text-white" : "text-muted hover:text-heading"}`}
              >
                {t.letter} <span className="font-medium">{t.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => mutate((d) => void (d.options = { ...d.options, charts: !charts }))}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition ${charts ? "border-accent bg-tint text-primary" : "border-hairline text-muted hover:text-heading"}`}
            title="Charts are added only when this is on"
          >
            <BarChart3 size={14} /> Charts {charts ? "on" : "off"}
          </button>
          <ToolbarButton title="AI keys and models" onClick={() => setSettingsOpen(true)} label="Settings">
            <KeyRound size={15} />
          </ToolbarButton>
          <ToolbarButton title="Open saved notes" onClick={() => setLibraryOpen(true)} label="Library">
            <FolderOpen size={15} />
          </ToolbarButton>
          <ToolbarButton title="Save a new version (Ctrl+S)" onClick={save} label="Save">
            <Save size={15} />
          </ToolbarButton>
          <ToolbarButton title="Download JSON" onClick={exportJson}>
            <FileJson size={15} />
          </ToolbarButton>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-deep px-3 text-[12px] font-semibold text-white transition hover:bg-primary"
          >
            <Download size={14} /> Export PDF
          </button>
        </div>
        <div className="brand-gradient absolute inset-x-0 bottom-0 h-[2px]" />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-hairline bg-white">
          <div className="flex border-b border-hairline px-3 pt-2">
            {(["source", "review"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPanel(p)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold ${panel === p ? "border-accent text-heading" : "border-transparent text-muted hover:text-heading"}`}
              >
                {p === "source" ? "Source" : "Review"}
                {p === "review" && issues.length ? (
                  <span className={`rounded-full px-1.5 text-[10.5px] ${counts.error ? "bg-red-100 text-red-700" : counts.warning ? "bg-amber-100 text-amber" : "bg-mist text-muted"}`}>
                    {counts.error || counts.warning || counts.info}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
            {panel === "source" ? (
              <div className="space-y-4">
                <div>
                  <Label>Input</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-mist p-1">
                    {(
                      [
                        ["document", "Document", <FileUp key="d" size={14} />],
                        ["text", "Text", <Type key="t" size={14} />],
                      ] as const
                    ).map(([id, label, icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setInputMode(id)}
                        className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] font-medium ${inputMode === id ? "bg-white text-heading shadow-sm" : "text-muted"}`}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>

                {inputMode === "document" ? (
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) setFile(f);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-7 text-center transition ${dragOver ? "border-accent bg-tint" : "border-hairline hover:border-accent"}`}
                  >
                    <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    {file ? (
                      <>
                        <FileText size={22} className="text-accent" />
                        <div className="mt-2 max-w-full truncate text-[13px] font-semibold text-heading">{file.name}</div>
                        <div className="text-[11px] text-muted">{(file.size / 1024).toFixed(0)} KB  |  click to replace</div>
                      </>
                    ) : (
                      <>
                        <FileUp size={22} className="text-muted" />
                        <div className="mt-2 text-[13px] font-semibold text-heading">Drop one file or click to browse</div>
                        <div className="mt-0.5 text-[11px] text-muted">PDF, DOCX, TXT, MD, JSON or CSV, up to 15 MB</div>
                      </>
                    )}
                  </label>
                ) : (
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={"Paste analyst notes, extracts or structured data.\n\nCompany: ...\nInstrument: NCD, INR 50 crore\nRating: ACER BBB (Stable), Assigned\nRevenue FY26: ...\nKey strengths: ..."}
                    className="h-60 w-full resize-y rounded-lg border border-hairline p-3 text-[12.5px] leading-relaxed outline-none focus:border-accent"
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Engine</Label>
                    <select value={engine} onChange={(e) => setEngine(e.target.value)} className="h-9 w-full rounded-md border border-hairline bg-white px-2 text-[12.5px] outline-none focus:border-accent">
                      <option value="auto">Automatic</option>
                      <option value="rules">No AI (rules only)</option>
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id} disabled={!isAvailable(ai, p.id)}>
                          {p.label}
                          {isAvailable(ai, p.id) ? "" : " (add key in Settings)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Source type</Label>
                    <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} className="h-9 w-full rounded-md border border-hairline bg-white px-2 text-[12.5px] outline-none focus:border-accent">
                      <option value="">Detect</option>
                      <option value="existing-note">Existing note</option>
                      <option value="raw-notes">Raw notes</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Instructions (optional)</Label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="For example: keep the liquidity section brief"
                    className="h-16 w-full resize-none rounded-md border border-hairline p-2 text-[12.5px] outline-none focus:border-accent"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-md border border-hairline px-3 py-2.5">
                  <span>
                    <span className="block text-[12.5px] font-semibold text-heading">Include charts</span>
                    <span className="block text-[11px] text-muted">Plots financial tables. Off unless you switch it on.</span>
                  </span>
                  <input type="checkbox" checked={charts} onChange={() => mutate((d) => void (d.options = { ...d.options, charts: !charts }))} className="h-4 w-4 accent-[var(--color-primary)]" />
                </label>

                <div className="flex items-center justify-between rounded-md border border-hairline px-3 py-2.5">
                  <span>
                    <span className="block text-[12.5px] font-semibold text-heading">Date on the note</span>
                    <span className="block text-[11px] text-muted">{note.options?.dateMode === "none" ? "No date will be printed." : "Set or pick it on the page header."}</span>
                  </span>
                  <div className="inline-flex rounded-md bg-mist p-0.5 text-[11px] font-medium">
                    {(
                      [
                        ["date", "Add date"],
                        ["none", "No date"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => mutate((d) => void (d.options = { ...d.options, dateMode: id }))}
                        className={`rounded px-2 py-1 ${(note.options?.dateMode ?? "date") === id ? "bg-white text-heading shadow-sm" : "text-muted"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generate}
                  disabled={!!busy}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-deep text-[13px] font-semibold text-white transition hover:bg-primary disabled:opacity-60"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate note
                </button>

                {error ? <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-800">{error}</div> : null}

                <div className="flex items-center justify-between border-t border-hairline pt-3 text-[11.5px]">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      replaceNote(northwindSample);
                      setSourceText("");
                      setServerIssues([]);
                      setEngineUsed("sample");
                    }}
                  >
                    Load dummy sample
                  </button>
                  <button
                    type="button"
                    className="text-muted hover:text-heading"
                    onClick={() => {
                      replaceNote(emptyNote());
                      setSourceText("");
                      setServerIssues([]);
                    }}
                  >
                    Start blank
                  </button>
                </div>

                <p className="text-[11px] leading-relaxed text-muted">
                  Everything runs in your browser. Documents are not uploaded to any server; only if you choose an AI engine is the extracted text sent to that provider. The generator only re-uses facts from your source. Every figure and rating in the note is checked against it, and anything it cannot find is flagged in Review. Ratings are never changed automatically.
                </p>
              </div>
            ) : (
              <ReviewPanel issues={issues} counts={counts} engine={engineUsed} hasSource={!!sourceText} onJump={jumpTo} />
            )}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline bg-white/70 px-4 backdrop-blur">
            {(
              [
                ["page", "Edit on page", <Type key="p" size={13} />],
                ["print", "Print view", <Printer key="r" size={13} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold ${view === id ? "bg-mist text-heading" : "text-muted hover:text-heading"}`}
              >
                {icon} {label}
              </button>
            ))}
            <span className="ml-3 text-[11px] text-muted">
              {view === "page" ? "Click any text, heading or table cell to edit it in place. Layout is chosen in Print view or the toolbar." : "Exact PDF output in the chosen template, refreshed as you edit."}
            </span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 py-8">
            {view === "page" ? <NoteEditor note={note} mutate={mutate} issuesByBlock={issuesByBlock} focusId={focusId} /> : <PrintView note={note} onTemplate={(t) => mutate((d) => void (d.options = { ...d.options, template: t }))} />}
          </div>
        </main>
      </div>

      {busy ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-heading px-4 py-2 text-[12px] font-medium text-white shadow-lg">
          <Loader2 size={14} className="animate-spin" /> {busy}
        </div>
      ) : toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-deep px-4 py-2 text-[12px] font-medium text-white shadow-lg">
          <CheckCircle2 size={14} /> {toast}
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          value={ai}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            setAi(next);
            saveAiSettings(next);
            setSettingsOpen(false);
            setToast("Settings saved in this browser");
          }}
        />
      ) : null}

      {libraryOpen ? (
        <Library
          onClose={() => setLibraryOpen(false)}
          onOpen={(loaded) => {
            replaceNote(loaded.note);
            setSourceText(loaded.sourceText);
            setEngineUsed(loaded.engine);
            setServerIssues([]);
            setNoteId(loaded.id);
            setVersion(loaded.version);
            setDirty(false);
            setLibraryOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{children}</div>;
}

function ToolbarButton({ title, onClick, children, disabled, label }: { title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted transition hover:bg-mist hover:text-heading disabled:opacity-30"
    >
      {children}
      {label ? <span>{label}</span> : null}
    </button>
  );
}

function ReviewPanel({
  issues,
  counts,
  engine,
  hasSource,
  onJump,
}: {
  issues: Issue[];
  counts: { error: number; warning: number; info: number };
  engine: string;
  hasSource: boolean;
  onJump: (id?: string) => void;
}) {
  const icon = (s: Issue["severity"]) =>
    s === "error" ? <XCircle size={14} className="mt-0.5 shrink-0 text-red-600" /> : s === "warning" ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" /> : <Info size={14} className="mt-0.5 shrink-0 text-muted" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Errors", counts.error, "text-red-700"],
            ["Warnings", counts.warning, "text-amber"],
            ["Notes", counts.info, "text-muted"],
          ] as const
        ).map(([label, n, cls]) => (
          <div key={label} className="rounded-md border border-hairline p-2.5">
            <div className={`font-serif text-[22px] font-bold ${cls}`}>{n}</div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md bg-mist p-2.5 text-[11.5px] leading-relaxed text-muted">
        {hasSource ? (
          <>
            Built by <span className="font-semibold text-heading">{engine === "rules" ? "the rules engine (no AI)" : engine}</span>. Figures and rating symbols are checked live against the uploaded source while you edit.
          </>
        ) : (
          <>No source document is attached, so figures cannot be traced. Arithmetic, completeness and style checks still run.</>
        )}
      </div>
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-hairline p-3 text-[12.5px] text-primary">
          <CheckCircle2 size={15} /> No issues found.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {issues.map((iss, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump(iss.blockId)}
                className={`flex w-full gap-2 rounded-md border border-hairline p-2.5 text-left text-[12px] leading-snug ${iss.blockId ? "hover:border-accent" : "cursor-default"}`}
              >
                {icon(iss.severity)}
                <span className="text-ink">{iss.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="rounded p-1 text-muted hover:bg-mist hover:text-heading">
      <X size={16} />
    </button>
  );
}
