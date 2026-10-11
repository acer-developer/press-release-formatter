# Rating Note Studio

A web portal that turns raw analyst material or an existing rating document into a publication-ready ACER credit rating press release. You edit the note directly on a page that looks like the final output, then export a branded A4 PDF.

**Live site:** https://acer-developer.github.io/ratingnote-generator-/

Everything runs in the browser, so the site is hosted free on GitHub Pages. Documents are never uploaded to a server. The earlier server-based version (Next.js API routes and SQLite) is kept on the `server-version` branch.

## What it does

- **Two ways in.** Upload one document (PDF, DOCX, TXT, MD, JSON, CSV) or paste text.
- **Builds the note.** Existing ACER-format documents are parsed faithfully by a rules engine, with no AI involved. Raw notes can be drafted into house-style prose by an AI provider (Claude, or the free tiers of Gemini or Groq).
- **Edit on the page.** Every heading, paragraph, bullet and table cell is editable in place. You can add, move and delete sections and blocks. Undo and redo are supported (Ctrl+Z / Ctrl+Shift+Z).
- **Print view.** Shows the exact PDF, rendered on the server and painted page by page.
- **Options.** Charts are off unless switched on. The date can be printed ("Add date", with a picker that formats dates like "24th August 2026") or omitted ("No date").
- **Versions.** Each save creates a new version in the browser (IndexedDB), with the source text attached so checks keep working. Saved notes stay on the computer where they were saved.
- **AI keys.** Added under Settings, stored only in your browser, and sent only to the provider you choose. Gemini falls back to sibling flash models when one is overloaded.

## Accuracy safeguards

The generator never invents facts. These checks run live in the Review panel while you edit:

| Check | What it catches |
| --- | --- |
| Traceability | Any number or ACER rating symbol in the note that does not appear in the source document |
| Arithmetic | Instrument totals that do not add up, and margin rows that do not match their own revenue and profit rows |
| Consistency | A headline rating that differs from the rating in the instruments table |
| Completeness | Missing standard sections, company name, headline or date |
| House style | Em/en dashes and stock AI phrasing ("notably", "robust", "it is worth noting" and similar) |

Ratings and outlooks are never changed automatically. AI output also passes through a dash cleaner before it reaches the editor.

## How it is built

```
upload / text
   │
   ▼
extract            PDF: unpdf (pdf.js) text positions + drawn table borders
                   DOCX: mammoth → HTML   ·   TXT/MD/JSON: line parser
   │
   ▼
segment            lines, bold lead-ins, bullets, bordered and borderless tables
   │
   ├── rules parser (no AI)   ──┐
   └── AI provider (optional) ──┤   strict JSON schema, facts only from the source
                                ▼
RatingNote (one JSON model)  ──►  verifier (traceability, arithmetic, style)
   │
   ├── on-page editor (React, Tailwind)
   └── PDF renderer (pdfcn components on the Forme WASM engine)
```

- **Framework:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **PDF:** [pdfcn](https://www.pdfcn.dev) components (table, graph, theme provider) on [Forme](https://docs.formepdf.com), with a custom ACER theme. Fonts are Caladea for headings and Satoshi for body text, matching acerratings.com.
- **Brand palette:** black text, with ACER green-teal (#22493E, #326D5E, #43927D, #54B69C, #8EC641) used only for accents, rules and table headers
- **Runs in the browser:** pdf.js reads PDFs, mammoth reads DOCX, and the Forme engine renders PDFs as WebAssembly. The site is a static Next.js export.
- **Storage:** IndexedDB in the browser
- **AI:** provider-independent interface in `src/lib/ai`, called directly from the browser with the user's own key. Gemini receives a JSON Schema for structured output, Claude uses the Anthropic SDK with structured outputs, Groq uses JSON mode. The app works fully without any key.

Key files:

| Path | Purpose |
| --- | --- |
| `src/lib/extract/pdf-layout.ts` | PDF text, fonts (bold/italic) and table borders |
| `src/lib/extract/segment.ts` | Converts layouts and text into document items, reconstructs tables |
| `src/lib/parse/heuristic.ts` | Rules engine mapping items to the press-release structure |
| `src/lib/ai/` | Prompt and providers |
| `src/lib/verify/verify.ts` | Anti-hallucination and consistency checks |
| `src/lib/note/style.ts` | Dash cleaning and phrase checks |
| `src/lib/pdf/RatingNoteDocument.tsx` | The PDF template |
| `src/lib/pdf/render.tsx` | Browser rendering with the Forme WASM engine |
| `src/lib/store.ts` | Saved notes and versions (IndexedDB) |
| `src/components/studio/` | Portal UI: studio shell, on-page editor, table editor, print view, library, settings |

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run build && npm start
```

AI keys are entered in the app under Settings; no environment variables are needed.

`samples/` contains a dummy note (fictional company) and an ACER press release regenerated by the rules engine.

## Deployment

Every push to `main` builds the static site and publishes it to GitHub Pages (`.github/workflows/pages.yml`). To host it elsewhere, run `npx next build` and serve the `out/` folder from any static host. Set `NEXT_PUBLIC_BASE_PATH` when serving from a sub-path.
