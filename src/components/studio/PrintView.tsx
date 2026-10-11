"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RatingNote } from "@/lib/note/schema";

/**
 * Exact print output: the server renders the PDF, and pdf.js paints each page onto a canvas so
 * the preview looks identical in every browser (no dependency on a built-in PDF viewer).
 */
export function PrintView({ note }: { note: RatingNote }) {
  const holder = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) });
        if (!res.ok) throw new Error((await res.json()).error || "Render failed");
        const bytes = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (id !== seq.current || !holder.current) return;
        const width = Math.min(holder.current.clientWidth || 820, 860);
        const ratio = window.devicePixelRatio || 1;
        const canvases: HTMLCanvasElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = "paper mx-auto mb-6 block bg-white";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          canvases.push(canvas);
        }
        if (id !== seq.current || !holder.current) return;
        holder.current.replaceChildren(...canvases);
        setPages(doc.numPages);
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : "Render failed");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [note]);

  return (
    <div className="relative mx-auto w-full max-w-[860px]">
      <div className="sticky top-0 z-10 mb-3 flex justify-end">
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] text-muted shadow-sm">
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          {loading ? "Rendering" : pages ? `${pages} page${pages > 1 ? "s" : ""}, A4` : ""}
        </span>
      </div>
      {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">{error}</div> : null}
      <div ref={holder} />
    </div>
  );
}
