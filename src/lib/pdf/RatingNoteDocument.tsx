import React from "react";
import { Document } from "@formepdf/react";
import type { FontRegistration } from "@formepdf/react";

import type { RatingNote } from "@/lib/note/schema";
import { printSafe } from "@/lib/note/style";
import { applyPalette } from "@/lib/pdf-themes/acer";

import { TemplatePages } from "./templates/templates";

export interface RenderAssets {
  fonts: FontRegistration[];
  logo?: string;
}

/** Root PDF document. The page layout comes from the template chosen in note.options.template. */
export function RatingNoteDocument({ note, assets }: { note: RatingNote; assets: RenderAssets }) {
  applyPalette(note.options?.palette);
  return (
    <Document title={`${note.meta.companyName} | ${note.meta.documentType}`} author="ACER Credit Rating Private Limited" fonts={assets.fonts} lang="en-IN">
      <TemplatePages note={printSafe(note)} assets={{ logo: assets.logo }} />
    </Document>
  );
}
