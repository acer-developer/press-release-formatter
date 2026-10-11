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
};

export const fonts = {
  body: "Satoshi",
  heading: "Caladea",
};

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
