import { z } from "zod";

/**
 * Canonical rating-note model. Every generator (heuristic parser, LLM, JSON import)
 * produces this shape, the editor mutates it, and the PDF renderer consumes it.
 */

export const TableSchema = z.object({
  title: z.string().default(""),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  /** Rows rendered bold with a top rule, e.g. "Total Rated Limits". */
  totalRow: z.array(z.string()).optional(),
  source: z.string().default(""),
  footnotes: z.array(z.string()).default([]),
});
export type NoteTable = z.infer<typeof TableSchema>;

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("paragraph"), text: z.string() }),
  z.object({ id: z.string(), type: z.literal("subheading"), text: z.string() }),
  /** A titled argument: "Healthy order book - The company had..." */
  z.object({ id: z.string(), type: z.literal("driver"), title: z.string(), text: z.string() }),
  z.object({
    id: z.string(),
    type: z.literal("bullets"),
    intro: z.string().default(""),
    items: z.array(z.string()),
  }),
  z.object({ id: z.string(), type: z.literal("table"), table: TableSchema }),
]);
export type NoteBlock = z.infer<typeof BlockSchema>;
export type BlockType = NoteBlock["type"];

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  blocks: z.array(BlockSchema),
});
export type NoteSection = z.infer<typeof SectionSchema>;

export const ContactSchema = z.object({
  role: z.string(),
  name: z.string(),
  phone: z.string().default(""),
  email: z.string().default(""),
});
export type NoteContact = z.infer<typeof ContactSchema>;

export const RatingNoteSchema = z.object({
  meta: z.object({
    documentType: z.string().default("Press Release"),
    date: z.string().default(""),
    companyName: z.string().default(""),
    headline: z.string().default(""),
  }),
  instruments: TableSchema.nullable().default(null),
  sections: z.array(SectionSchema).default([]),
  contacts: z.array(ContactSchema).default([]),
  disclaimer: z.string().default(""),
  /** Presentation choices made by the analyst; never affect content. */
  options: z
    .object({
      /** Charts are opt-in: only drawn when the analyst asks for them. */
      charts: z.boolean().default(false),
      /** "date" prints meta.date; "none" omits the date everywhere. */
      dateMode: z.enum(["date", "none"]).default("date"),
      /** PDF layout: A Boardroom, B Scorecard, C Report. Content is identical in all three. */
      template: z.enum(["boardroom", "scorecard", "report"]).default("boardroom"),
    })
    .default({ charts: false, dateMode: "date", template: "boardroom" }),
});
export type RatingNote = z.infer<typeof RatingNoteSchema>;

export type IssueSeverity = "error" | "warning" | "info";
export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Section/block the issue relates to, for highlighting in the editor. */
  blockId?: string;
}

export interface GenerationResult {
  note: RatingNote;
  issues: Issue[];
  engine: string;
  sourceText: string;
}

let counter = 0;
export const newId = (prefix = "b") =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyNote = (): RatingNote => ({
  meta: { documentType: "Press Release", date: "", companyName: "", headline: "" },
  instruments: null,
  sections: [],
  contacts: [],
  disclaimer: DEFAULT_DISCLAIMER,
  options: { charts: false, dateMode: "date", template: "boardroom" },
});

export const DEFAULT_DISCLAIMER =
  "ACER Credit Rating Private Limited (ACER) is engaged in the business of providing credit ratings and other permitted services and does not provide investment advice or recommendations, directly or indirectly, with respect to any securities. Ratings are subject to ongoing surveillance, revision or withdrawal, as and when warranted.\n\nInformation used in assigning ratings has been obtained from sources believed to be reliable, including the rated entity; however, such information has not been independently audited or verified by ACER. While reasonable care has been exercised to ensure that the information contained herein is true and fair, it is provided “as is”. ACER does not make any representation, warranty of any kind, or guarantee the accuracy, adequacy, suitability or completeness of any information or its fitness for a particular purpose.\n\nAll ratings and related analyses are statements of opinion, and ACER shall not be liable for any losses, direct or indirect, arising from use of this publication or its contents. Users are advised to exercise their own judgment and due diligence before making any decision based on the ratings.";

/** The canonical section order of an ACER press release. Used for templates and ordering. */
export const STANDARD_SECTIONS = [
  "Rating Action",
  "Brief Summary of the Rating Action",
  "Analytical Approach",
  "Key Rating Drivers",
  "Liquidity",
  "Rating Sensitivities",
  "About the Company",
  "Key Financial Indicators",
  "Any Other Information",
  "Applicable Rating Criteria",
  "Rating History",
  "Complexity Level of Rated Instruments",
  "Annexures",
] as const;
