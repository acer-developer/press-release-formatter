import type { RatingNote } from "../schema";
import { DEFAULT_DISCLAIMER } from "../schema";

/**
 * Fictional sample used for demos and tests. Northwind Renewables Limited does not exist;
 * every figure below is illustrative and internally consistent (margins = EBITDA / revenue).
 */
export const northwindSample: RatingNote = {
  meta: {
    documentType: "Press Release",
    date: "11th October 2026",
    companyName: "Northwind Renewables Limited (Sample)",
    headline: "Long-term rating of ACER BBB+ (Stable) Assigned to the NCD Programme",
  },
  instruments: {
    title: "Details of instruments",
    columns: ["Instrument / Facility", "Date of Allotment", "Coupon Rate", "Maturity Date", "Amount (INR Crore)", "Rating with Outlook", "Regulator"],
    rows: [
      ["Non-Convertible Debentures (NCDs)", "15-09-2026", "10.50%", "15-09-2029", "60.00", "ACER BBB+ (Stable); Assigned", "SEBI"],
      ["Non-Convertible Debentures (NCDs): Proposed", "-", "-", "-", "40.00", "ACER BBB+ (Stable); Assigned", "SEBI"],
    ],
    totalRow: ["Total Rated Limits", "", "", "", "100.00", "", ""],
    source: "",
    footnotes: ["*Sample document generated for demonstration. Company and figures are fictional."],
  },
  sections: [
    {
      id: "s1",
      title: "Brief Summary of the Rating Action",
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          text: "The assigned rating reflects Northwind Renewables Limited's (NRL) contracted revenue base, with around 82% of its 410 MW operational capacity tied to long-term power purchase agreements, and its improving scale of operations. The rating is supported by the experience of the promoters in developing and operating wind and solar assets. The rating is constrained by moderate counterparty credit quality of state distribution utilities and exposure to generation variability.",
        },
      ],
    },
    {
      id: "s2",
      title: "Analytical Approach",
      blocks: [{ id: "b2", type: "paragraph", text: "ACER has considered the standalone credit profile of NRL to arrive at the rating." }],
    },
    {
      id: "s3",
      title: "Key Rating Drivers",
      blocks: [
        { id: "b3", type: "subheading", text: "Credit Strengths" },
        {
          id: "b4",
          type: "driver",
          title: "Contracted revenue visibility",
          text: "Around 82% of operational capacity is contracted under 25-year power purchase agreements at fixed tariffs, providing visibility on revenue over the medium term.",
        },
        {
          id: "b5",
          type: "driver",
          title: "Improving scale and steady margins",
          text: "Revenue rose to INR 312.40 crore in FY26 from INR 248.10 crore in FY25, while the EBITDA margin remained in the 72-75% range, in line with operating renewable assets.",
        },
        { id: "b6", type: "subheading", text: "Credit Weaknesses" },
        {
          id: "b7",
          type: "driver",
          title: "Counterparty concentration",
          text: "State distribution utilities account for the majority of receivables. Receivable days were around 118 in FY26, and timely realisation remains a key monitorable.",
        },
        {
          id: "b8",
          type: "driver",
          title: "Generation variability",
          text: "Plant load factors are exposed to wind and solar resource variability, which can affect annual cash flows.",
        },
      ],
    },
    {
      id: "s4",
      title: "Liquidity Indicator: Adequate",
      blocks: [
        {
          id: "b9",
          type: "paragraph",
          text: "Liquidity is adequate, supported by a debt service reserve equivalent to two quarters of debt servicing and free cash of around INR 38.50 crore as on March 31, 2026.",
        },
      ],
    },
    {
      id: "s5",
      title: "Rating Sensitivities",
      blocks: [
        { id: "b10", type: "subheading", text: "Positive sensitivities" },
        { id: "b11", type: "bullets", intro: "", items: ["Sustained improvement in receivable days below 90", "Commissioning of under-construction capacity within budget"] },
        { id: "b12", type: "subheading", text: "Negative sensitivities" },
        { id: "b13", type: "bullets", intro: "", items: ["Net leverage above 5.0x on a sustained basis", "Material delay in realisation from counterparties"] },
      ],
    },
    {
      id: "s6",
      title: "About the Company",
      blocks: [
        {
          id: "b14",
          type: "paragraph",
          text: "Northwind Renewables Limited is a fictional independent power producer used to demonstrate this note generator. It operates 410 MW of wind and solar capacity across three states.",
        },
      ],
    },
    {
      id: "s7",
      title: "Key Financial Indicators (Standalone)",
      blocks: [
        {
          id: "b15",
          type: "table",
          table: {
            title: "Key financial indicators",
            columns: ["Particulars", "FY24", "FY25", "FY26"],
            rows: [
              ["Revenue (INR crore)", "201.30", "248.10", "312.40"],
              ["EBITDA (INR crore)", "146.90", "183.60", "229.30"],
              ["EBITDA margin (%)", "72.98%", "74.00%", "73.40%"],
              ["Interest coverage ratio (x)", "1.92", "2.11", "2.36"],
              ["Net leverage (x)", "5.10", "4.62", "4.18"],
            ],
            source: "NRL (sample data), ACER",
            footnotes: [],
          },
        },
      ],
    },
    {
      id: "s8",
      title: "Applicable Rating Criteria",
      blocks: [
        {
          id: "b16",
          type: "bullets",
          intro: "",
          items: ["Rating Criteria for the infrastructure sector companies", "Criteria for Financial Ratios for the Non-Financial Sector", "Policy for Default Recognition"],
        },
      ],
    },
  ],
  contacts: [
    { role: "Primary Analyst", name: "Sample Analyst", phone: "+91-00 0000000", email: "analyst@example.com" },
    { role: "Lead Analyst", name: "Sample Lead", phone: "+91-00 0000000", email: "lead@example.com" },
  ],
  disclaimer: DEFAULT_DISCLAIMER,
  options: { charts: false, dateMode: "date" },
};
