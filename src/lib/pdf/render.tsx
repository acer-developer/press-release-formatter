import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderDocument } from "@formepdf/core";
import type { FontRegistration } from "@formepdf/react";

import type { RatingNote } from "@/lib/note/schema";

import { RatingNoteDocument, type RenderAssets } from "./RatingNoteDocument";

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

async function loadAssets(): Promise<RenderAssets> {
  const pub = path.join(process.cwd(), "public");
  const fonts: FontRegistration[] = await Promise.all(
    FONT_FILES.map(async (f) => ({
      family: f.family,
      src: new Uint8Array(await readFile(path.join(pub, "fonts", f.file))),
      fontWeight: f.weight,
      fontStyle: f.style ?? "normal",
    }))
  );
  // Satoshi has no italic cut bundled; map italics to the regular face so footnotes still render.
  fonts.push({ ...fonts[0], fontStyle: "italic" });
  let logo: string | undefined;
  try {
    logo = `data:image/png;base64,${(await readFile(path.join(pub, "acer-logo.png"))).toString("base64")}`;
  } catch {
    logo = undefined;
  }
  return { fonts, logo };
}

export async function renderNotePdf(note: RatingNote): Promise<Uint8Array> {
  assetsPromise ??= loadAssets();
  const assets = await assetsPromise;
  // Forme expects the root element to be <Document>, so call the component directly.
  return renderDocument(RatingNoteDocument({ note, assets }));
}
