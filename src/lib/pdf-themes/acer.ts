import type { PdfcnTheme } from "@/types/pdf-themes";

import { defaultPrimitives } from "./primitives";

/**
 * ACER brand palette, taken from acerratings.com (primary green-teal scale) and the letterhead.
 * Text stays black; green-teal is used only for accents, rules and table headers. No blue.
 */
export const brand = {
  ink: "#1B1B18",
  heading: "#111111",
  slate: "#5F6368",
  hairline: "#DADDD8",
  mist: "#F4F7F5",
  tint: "#EEF8F5",
  deep: "#22493E",
  primary: "#326D5E",
  accent: "#43927D",
  light: "#54B69C",
  lime: "#8EC641",
  amber: "#9A6A16",
  amberTint: "#FBF3E4",
  greenTint: "#E7F4EE",
  red: "#B42318",
  gradient: "linear-gradient(90deg, #8EC641 0%, #54B69C 60%, #43927D 100%)",
  gradientV: "linear-gradient(180deg, #8EC641 0%, #54B69C 60%, #43927D 100%)",
  /** Lines, labels and text placed on the dark banner. */
  bannerRule: "#4F7A6E",
  bannerLabel: "#9FC7BA",
  bannerText: "#D6E6E0",
};

export type PaletteId = "green" | "teal";

/** Colour schemes; only the brand accent family changes, text stays black in both. */
export const PALETTES: Record<PaletteId, Partial<typeof brand>> = {
  green: {
    deep: "#22493E",
    primary: "#326D5E",
    accent: "#43927D",
    light: "#54B69C",
    tint: "#EEF8F5",
    greenTint: "#E7F4EE",
    gradient: "linear-gradient(90deg, #8EC641 0%, #54B69C 60%, #43927D 100%)",
    gradientV: "linear-gradient(180deg, #8EC641 0%, #54B69C 60%, #43927D 100%)",
    bannerRule: "#4F7A6E",
    bannerLabel: "#9FC7BA",
    bannerText: "#D6E6E0",
  },
  // ACER teal (#3AAFA9 / #3AA4A9). Fills behind white text use a deeper shade of the same hue
  // (#23807C, 4.7:1 contrast); the exact brand teals carry accents, rules and markers.
  teal: {
    deep: "#23807C",
    primary: "#2A8F8B",
    accent: "#3AA4A9",
    light: "#3AAFA9",
    tint: "#EAF7F7",
    greenTint: "#E2F4F3",
    gradient: "linear-gradient(90deg, #8EC641 0%, #3AAFA9 55%, #3AA4A9 100%)",
    gradientV: "linear-gradient(180deg, #8EC641 0%, #3AAFA9 55%, #3AA4A9 100%)",
    bannerRule: "#5EA9A6",
    bannerLabel: "#C3E8E5",
    bannerText: "#E4F5F4",
  },
};

export const PALETTE_LABELS: { id: PaletteId; name: string; swatch: string }[] = [
  { id: "green", name: "Green", swatch: "#22493E" },
  { id: "teal", name: "Teal", swatch: "#3AAFA9" },
];

export const fonts = {
  body: "Satoshi",
  heading: "Caladea",
};

/**
 * Switches the colour scheme for the next render. The PDF components read `brand` and the
 * pdfcn theme at serialisation time, which happens synchronously inside one render call.
 */
export function applyPalette(id: PaletteId = "green") {
  Object.assign(brand, PALETTES[id] ?? PALETTES.green);
  Object.assign(acerTheme.colors, { accent: brand.accent, info: brand.primary, primary: brand.deep, success: brand.accent });
}

/** Consulting-style theme: serif display headings, compact sans body, black ink, hairline rules. */
export const acerTheme: PdfcnTheme = {
  colors: {
    accent: brand.accent,
    background: "#ffffff",
    border: brand.hairline,
    destructive: brand.red,
    foreground: brand.ink,
    info: brand.primary,
    muted: brand.mist,
    mutedForeground: brand.slate,
    primary: brand.deep,
    primaryForeground: "#ffffff",
    success: brand.accent,
    warning: brand.amber,
  },
  name: "acer",
  page: { orientation: "portrait", size: "A4" },
  primitives: defaultPrimitives,
  spacing: {
    componentGap: 10,
    page: { marginBottom: 70, marginLeft: 50, marginRight: 50, marginTop: 78 },
    paragraphGap: 7,
    sectionGap: 20,
  },
  typography: {
    body: { fontFamily: fonts.body, fontSize: 9.4, lineHeight: 1.5 },
    heading: {
      fontFamily: fonts.heading,
      fontSize: { h1: 26, h2: 15, h3: 12, h4: 10.5, h5: 9.5, h6: 9 },
      fontWeight: 700,
      lineHeight: 1.2,
    },
  },
};
