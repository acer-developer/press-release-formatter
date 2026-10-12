# Press Release Formatter

Turns an existing rating document or raw analyst notes into a publication-ready ACER credit rating press release. You edit the note on a page that looks like the output, choose one of three layouts, and export a branded A4 PDF. Every figure and rating is checked against the source, so nothing is published that the source does not say.

**Live site:** https://acer-developer.github.io/press-release-formatter/

**User guide:** https://acer-developer.github.io/press-release-formatter/sop/

Everything runs in the browser. Documents are not uploaded to any server, notes are saved in your browser, and AI is optional.

## How to use it

1. **Source.** Drop one file (PDF, DOCX, TXT, MD, JSON or CSV) or paste text.
2. **Generate.** Existing ACER-format notes are rebuilt by the rules engine, with no AI. Raw notes can be drafted into house-style prose by AI if you add a key under **Settings**.
3. **Review.** The Review panel lists anything the checker could not trace to the source. Click an item to jump to it.
4. **Edit on page.** Click any heading, paragraph, bullet or table cell to edit it. Add, move or delete sections and blocks. Undo and redo with Ctrl+Z and Ctrl+Shift+Z.
5. **Print view.** See the exact PDF and compare the three templates side by side. Switching templates is instant and costs nothing.
6. **Export PDF** or **Save** a version (kept in this browser).

Options: **Charts** are off unless switched on. **Date** can be printed (with a picker that formats it as "24th August 2026") or left off.

## Templates

| | Template | Character |
| --- | --- | --- |
| A | Boardroom | Teal cover banner with the rating facts, a three-point executive summary, strengths set against weaknesses, headline financials with year-on-year change |
| B | Scorecard | Key-facts sidebar with a strength/weakness balance bar, a driver scorecard table, upgrade and downgrade triggers |
| C | Report | Built on pdfcn's report style: rounded cards, change badges, highlights and risks |

All three carry the full note after the briefing pages: every section, table and annexure, in ACER teal (black text, teal #3AAFA9 / #3AA4A9 accents) and typefaces (Caladea headings, Satoshi body). Headings stay with their text and table headers repeat on every page.

## No hallucination: how it is enforced

- The rules engine only rearranges source text. AI drafts are treated as untrusted.
- Every figure, year, count and ACER rating symbol in the note must appear in the source. Names the source never mentions and sentences with little support in the source are flagged.
- For AI drafts, figures the source contains but the note dropped are listed.
- Totals and margins are recalculated from the table's own rows; mismatches are flagged.
- The templates add nothing but layout. The only new numbers are year-on-year changes calculated from the note's own figures, labelled as computed. An end-to-end test renders all three templates and fails if any figure in the PDF is not in the source, or if any paragraph is missing.
- Ratings are never changed automatically. Em dashes and stock AI phrasing are removed or flagged.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, the module map and the premortem (risks, mitigations and the tests that cover them).

## Architecture at a glance

```
source file / text
  → extract (pdf.js layout and table borders, mammoth for DOCX, text parser)
  → segment (lines, bold lead-ins, bullets, bordered and borderless tables)
  → build the note (rules engine, or optional AI with a strict facts-only schema)
  → clean (house style) → verify (traceability, grounding, arithmetic, completeness)
  → edit on page ⇄ RatingNote (one JSON model) ⇄ saved versions (IndexedDB)
  → template A / B / C → PDF (pdfcn components on the Forme WASM engine)
```

| Area | Technology |
| --- | --- |
| App | Next.js 15 static export, React 19, TypeScript, Tailwind CSS 4 |
| PDF output | [pdfcn](https://www.pdfcn.dev) components on [Forme](https://docs.formepdf.com) (WebAssembly, in the browser) |
| Reading files | pdf.js (PDF text and table borders), mammoth (DOCX) |
| Storage | IndexedDB (notes and versions), localStorage (AI settings) |
| AI (optional) | Gemini, Groq or Claude, called from the browser with the user's own key |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push to `main` |

## AI keys

AI is only needed to draft prose from raw notes. Open **Settings** and paste a key:

- Google Gemini (free tier): https://aistudio.google.com/apikey. The default model is `gemini-flash-latest`, with automatic fallback to other flash models when it is busy.
- Groq (free tier): https://console.groq.com/keys
- Claude: https://console.anthropic.com/settings/keys

Keys are stored only in that browser and sent only to the provider. Never put a key in the code; the site is public.

## Development

```bash
npm install        # also copies the pdf.js worker and Forme WASM into public/
npm run dev        # http://localhost:3000
npm test           # unit, hallucination, end-to-end, fuzz and mutation tests
npm run build      # static site in out/
```

Scripts (run with `npx tsx --tsconfig scripts/tsconfig.json <script>`):

| Script | Purpose |
| --- | --- |
| `scripts/render-node.tsx in.pdf out.pdf [note.json]` | Render a document or note JSON to PDF from Node |
| `scripts/audit.tsx a.pdf b.pdf ...` | Run the no-AI pipeline and print every checker finding |
| `scripts/audit-ai.tsx <file or -textfile> [mode]` | Same with a Gemini draft (key in `GEMINI_KEY`) |

`samples/` holds the Viviana Power Tech press release rebuilt in each template. `tests/fixtures/` holds three published ACER press releases and a DOCX test note.

The earlier server-based version (API routes and SQLite) is on the `server-version` branch.

## Deployment

Every push to `main` runs the tests, builds the static site and publishes it to GitHub Pages (`.github/workflows/pages.yml`). Repository Settings → Pages → Source must be set to **GitHub Actions**. To host elsewhere, serve the `out/` folder from any static host and set `NEXT_PUBLIC_BASE_PATH` if it is served from a sub-path.
