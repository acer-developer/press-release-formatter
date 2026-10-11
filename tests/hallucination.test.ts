import { describe, expect, it } from "vitest";

import { northwindSample } from "@/lib/note/samples/northwind";
import type { RatingNote } from "@/lib/note/schema";
import { verifyNote } from "@/lib/verify/verify";

/** Every kind of invented content must be caught when checked against the source. */
const SOURCE = `Northwind Renewables Limited operates 410 MW of wind and solar capacity across three states.
Revenue rose to INR 312.40 crore in FY26 from INR 248.10 crore in FY25. The rating is ACER BBB+ (Stable).
Around 82% of capacity is contracted under 25-year power purchase agreements. Receivable days were around 118.
State distribution utilities account for the majority of receivables. Order book INR1,300 crore.`;

const withParagraph = (text: string): RatingNote => ({
  ...structuredClone(northwindSample),
  instruments: null,
  sections: [{ id: "s", title: "Brief Summary of the Rating Action", blocks: [{ id: "p", type: "paragraph", text }] }],
});
const codes = (text: string) => verifyNote(withParagraph(text), SOURCE).filter((i) => i.blockId === "p").map((i) => i.code);

describe("hallucination catch rate", () => {
  it("passes text that only restates the source", () => {
    expect(codes("Revenue rose to INR 312.40 crore in FY26 from INR 248.10 crore in FY25. Receivable days were around 118.")).toEqual([]);
  });
  it("catches an invented amount", () => expect(codes("Revenue rose to INR 340.00 crore in FY26.")).toContain("untraced-number"));
  it("catches an invented small count", () => expect(codes("The promoters have 40 years of experience in agri processing.")).toContain("untraced-number"));
  it("catches an invented year", () => expect(codes("The company was incorporated in 2008.")).toContain("untraced-number"));
  it("catches an amount written without a space", () => expect(codes("Order book stood at INR1,400 crore.")).toContain("untraced-number"));
  it("catches a changed rating", () => expect(codes("The rating is ACER A- (Stable).")).toContain("untraced-rating"));
  it("catches an invented name", () => expect(codes("Most receivables are from Tata Power Delhi Distribution.")).toContain("untraced-name"));
  it("flags a sentence with no support in the source", () =>
    expect(codes("Management intends to pursue aggressive international acquisitions financed through convertible bonds in European markets.")).toContain("unsupported-sentence"));
  it("reports figures an AI draft dropped", () => {
    const issues = verifyNote(withParagraph("Revenue was INR 312.40 crore."), SOURCE, { coverage: true });
    expect(issues.some((i) => i.code === "dropped-figures" && i.message.includes("248.1"))).toBe(true);
  });
});
