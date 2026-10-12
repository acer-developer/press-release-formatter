import type { PdfcnTheme } from "@/types/pdf-themes";

import { defaultPrimitives } from "./primitives";

/**
 * ACER brand palette: teal (#3AAFA9 / #3AA4A9) from acerratings.com. Text stays black; teal is used
 * for accents, rules and table headers. Fills behind white text use a deeper shade of the same
 * teal (#23807C, 4.7:1 contrast) so small white type stays readable.
 */
export const brand = {
  ink: "#1B1B18",
  heading: "#111111",
  slate: "#5F6368",
  hairline: "#DADDD8",
  mist: "#F4F7F7",
  tint: "#EAF7F7",
  deep: "#23807C",
  primary: "#2A8F8B",
  accent: "#3AA4A9",
  light: "#3AAFA9",
  amber: "#9A6A16",
  amberTint: "#FBF3E4",
  tealTint: "#E2F4F3",
  red: "#B42318",
  gradient: "linear-gradient(90deg, #3AAFA9 0%, #3AA4A9 55%, #23807C 100%)",
  gradientV: "linear-gradient(180deg, #3AAFA9 0%, #3AA4A9 55%, #23807C 100%)",
  /** Lines, labels and text placed on the teal banner. */
  bannerRule: "#5EA9A6",
  bannerLabel: "#C3E8E5",
  bannerText: "#E4F5F4",
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
