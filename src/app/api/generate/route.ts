import { NextResponse } from "next/server";

import { MAX_UPLOAD_BYTES } from "@/lib/extract";
import { generateNote, type EngineChoice } from "@/lib/generate";
import type { SourceMode } from "@/lib/ai/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const text = String(form.get("text") ?? "");
    const engine = (String(form.get("engine") ?? "auto") || "auto") as EngineChoice;
    const modeRaw = String(form.get("mode") ?? "");
    const mode = modeRaw === "existing-note" || modeRaw === "raw-notes" ? (modeRaw as SourceMode) : undefined;
    const instructions = String(form.get("instructions") ?? "");

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File is larger than 15 MB." }, { status: 413 });
      const data = new Uint8Array(await file.arrayBuffer());
      return NextResponse.json(await generateNote({ fileName: file.name, data, engine, mode, instructions }));
    }
    if (!text.trim()) return NextResponse.json({ error: "Upload a file or paste some text." }, { status: 400 });
    return NextResponse.json(await generateNote({ text, engine, mode, instructions }));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed." }, { status: 500 });
  }
}
