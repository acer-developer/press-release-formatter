import { init, renderDocument } from "@formepdf/core/worker";
import type { FontRegistration } from "@formepdf/react";

import { asset } from "@/lib/asset";
import type { RatingNote } from "@/lib/note/schema";

import { RatingNoteDocument, type RenderAssets } from "./RatingNoteDocument";

/**
 * Browser-side PDF rendering: the Forme engine runs as WebAssembly in the page, so no server
 * is involved. Fonts, logo and the engine binary are static files served alongside the site.
 */

const FONT_FILES: { family: string; file: string; weight: number; style?: "italic" }[] = [
  { family: "Satoshi", file: "Satoshi-Regular.ttf", weight: 400 },
  { family: "Satoshi", file: "Satoshi-Medium.ttf", weight: 500 },
  { family: "Satoshi", file: "Satoshi-Bold.ttf", weight: 600 },
  { family: "Satoshi", file: "Satoshi-Bold.ttf", weight: 700 },
  { family: "Caladea", file: "Caladea-400.ttf", weight: 400 },
  { family: "Caladea", file: "Caladea-700.ttf", weight: 700 },
  { family: "Caladea", file: "Caladea-400-italic.ttf", weight: 400, style: "italic" },
];

let assetsPromise: Promise<RenderAssets> | null = null;
let enginePromise: Promise<void> | null = null;

const bytes = async (path: string) => {
  const res = await fetch(asset(path));
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return new Uint8Array(await res.arrayBuffer());
};

async function loadAssets(): Promise<RenderAssets> {
  const fontBytes = new Map<string, Promise<Uint8Array>>();
  const load = (file: string) => {
    if (!fontBytes.has(file)) fontBytes.set(file, bytes(`/fonts/${file}`));
    return fontBytes.get(file)!;
  };
  const fonts: FontRegistration[] = await Promise.all(
    FONT_FILES.map(async (f) => ({ family: f.family, src: await load(f.file), fontWeight: f.weight, fontStyle: f.style ?? "normal" }))
  );
  // Satoshi has no italic cut bundled; map italics to the regular face so footnotes still render.
  fonts.push({ ...fonts[0], fontStyle: "italic" });
  const logoBytes = await bytes("/acer-logo.png");
  let binary = "";
  logoBytes.forEach((b) => (binary += String.fromCharCode(b)));
  return { fonts, logo: `data:image/png;base64,${btoa(binary)}` };
}

export async function renderNotePdf(note: RatingNote): Promise<Uint8Array> {
  enginePromise ??= init(new URL(asset("/forme_bg.wasm"), window.location.href));
  assetsPromise ??= loadAssets();
  const [, assets] = await Promise.all([enginePromise, assetsPromise]);
  // Forme expects the root element to be <Document>, so call the component directly.
  return renderDocument(RatingNoteDocument({ note, assets }));
}
