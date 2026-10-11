"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RatingNote } from "@/lib/note/schema";
import { TEMPLATES, type TemplateId } from "@/lib/pdf/templates/templates";
import { loadPdfJs } from "@/lib/pdfjs-client";

type PdfJsModule = typeof import("pdfjs-dist");

async function paint(bytes: Uint8Array, width: number, pages: number | "all"): Promise<{ canvases: HTMLCanvasElement[]; total: number }> {
  const pdfjs = (await loadPdfJs()) as unknown as PdfJsModule;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const ratio = window.devicePixelRatio || 1;
  const count = pages === "all" ? doc.numPages : Math.min(pages, doc.numPages);
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${width}px`;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    canvases.push(canvas);
  }
  return { canvases, total: doc.numPages };
}

/**
 * Exact print output, rendered in the browser. Shows the first page of every template side by side
 * so people can compare and pick, then every page of the chosen template.
 */
export function PrintView({ note, onTemplate }: { note: RatingNote; onTemplate: (t: TemplateId) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const thumbs = useRef<Record<string, HTMLDivElement | null>>({});
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const current = (note.options?.template ?? "boardroom") as TemplateId;

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { renderNotePdf } = await import("@/lib/pdf/render");
        // Chosen template first (full document), then page-1 thumbnails of the others.
        const order = [current, ...TEMPLATES.map((t) => t.id).filter((t) => t !== current)];
        for (const t of order) {
          const bytes = await renderNotePdf({ ...note, options: { ...note.options, template: t } });
          if (id !== seq.current) return;
          if (t === current && holder.current) {
            const width = Math.min(holder.current.clientWidth || 820, 860);
            const { canvases, total } = await paint(bytes, width, "all");
            if (id !== seq.current) return;
            canvases.forEach((c) => (c.className = "paper mx-auto mb-6 block bg-white"));
            holder.current.replaceChildren(...canvases);
            setPages(total);
          }
          const box = thumbs.current[t];
          if (box) {
            const { canvases } = await paint(bytes, 180, 1);
            if (id !== seq.current) return;
            canvases[0].className = "block bg-white";
            box.replaceChildren(canvases[0]);
          }
        }
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : "Render failed");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [note, current]);

  return (
    <div className="relative mx-auto w-full max-w-[860px]">
      <div className="mb-5 rounded-lg border border-hairline bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-heading">Template</div>
            <div className="text-[11.5px] text-muted">Same content in three layouts. Pick one; you can switch at any time.</div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            {loading ? "Rendering" : pages ? `${pages} pages, A4` : ""}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplate(t.id)}
              aria-pressed={current === t.id}
              className={`group rounded-md border p-2 text-left transition ${current === t.id ? "border-accent ring-2 ring-accent/30" : "border-hairline hover:border-accent"}`}
            >
              <div ref={(el) => void (thumbs.current[t.id] = el)} className="mx-auto flex h-[255px] w-[180px] items-center justify-center overflow-hidden bg-mist shadow-sm">
                <Loader2 size={14} className="animate-spin text-muted" />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`flex h-5 w-5 items-center justify-center rounded text-[10.5px] font-bold ${current === t.id ? "bg-deep text-white" : "bg-mist text-muted"}`}>
                  {current === t.id ? <Check size={12} /> : t.letter}
                </span>
                <span className="text-[12.5px] font-semibold text-heading">{t.name}</span>
              </div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-muted">{t.blurb}</div>
            </button>
          ))}
        </div>
      </div>
      {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">{error}</div> : null}
      <div ref={holder} />
    </div>
  );
}
