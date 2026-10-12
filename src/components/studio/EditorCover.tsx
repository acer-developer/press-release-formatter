"use client";

import { CalendarDays } from "lucide-react";

import { asset } from "@/lib/asset";
import { buildBriefing, type Briefing } from "@/lib/note/briefing";
import { formatAcerDate } from "@/lib/note/derive";
import type { RatingNote } from "@/lib/note/schema";

import { AutoText, InlineInput } from "./fields";

type Mutate = (fn: (draft: RatingNote) => void) => void;
export type EditorTemplate = "boardroom" | "scorecard" | "report";

/** Small caption on panels that are derived from the note rather than typed directly. */
const From = ({ children, light }: { children: React.ReactNode; light?: boolean }) => (
  <div className={`mt-2 text-[10px] italic ${light ? "text-white/60" : "text-muted"}`}>{children}</div>
);

const Up = ({ color = "var(--color-accent)" }: { color?: string }) => (
  <svg width="7" height="7" viewBox="0 0 10 10" className="mt-[5px] shrink-0" aria-hidden="true">
    <path d="M5 0 L10 10 L0 10 Z" fill={color} />
  </svg>
);
const Down = ({ color = "#9A6A16" }: { color?: string }) => (
  <svg width="7" height="7" viewBox="0 0 10 10" className="mt-[5px] shrink-0" aria-hidden="true">
    <path d="M0 0 L10 0 L5 10 Z" fill={color} />
  </svg>
);

export function DateControl({ note, mutate, dark, align = "right" }: { note: RatingNote; mutate: Mutate; dark?: boolean; align?: "left" | "right" }) {
  const mode = note.options?.dateMode ?? "date";
  return (
    <div className={`flex flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
      <div className={`inline-flex shrink-0 whitespace-nowrap rounded-md p-0.5 text-[10.5px] font-medium ${dark ? "bg-white/10" : "bg-mist"}`}>
        {(
          [
            ["date", "Add date"],
            ["none", "No date"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => mutate((d) => void (d.options = { ...d.options, dateMode: id }))}
            className={`rounded px-2 py-0.5 ${mode === id ? (dark ? "bg-white text-heading" : "bg-white text-heading shadow-sm") : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-heading"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "date" ? (
        <div className="flex items-center gap-1.5">
          <InlineInput
            value={note.meta.date}
            onChange={(v) => mutate((d) => void (d.meta.date = v))}
            placeholder="Date"
            className={`w-40 text-[11px] ${align === "right" ? "text-right" : ""} ${dark ? "!text-white" : "text-heading"}`}
            ariaLabel="Date"
          />
          <label className={`relative flex h-6 w-6 cursor-pointer items-center justify-center rounded border ${dark ? "border-white/30 text-white" : "border-hairline bg-white text-muted hover:text-heading"}`} title="Pick a date">
            <CalendarDays size={13} />
            <input
              type="date"
              aria-label="Pick a date"
              onChange={(e) => e.target.value && mutate((d) => void (d.meta.date = formatAcerDate(e.target.value)))}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function Logo({ className = "h-9" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset("/acer-logo.png")} alt="ACER" className={`${className} w-auto`} />;
}

function Company({ note, mutate, className }: { note: RatingNote; mutate: Mutate; className: string }) {
  return <AutoText value={note.meta.companyName} onChange={(v) => mutate((d) => void (d.meta.companyName = v))} placeholder="Company name" className={className} ariaLabel="Company name" />;
}

function Headline({ note, mutate, className }: { note: RatingNote; mutate: Mutate; className: string }) {
  return (
    <AutoText
      value={note.meta.headline}
      onChange={(v) => mutate((d) => void (d.meta.headline = v))}
      placeholder="Headline: the rating action, for example Long-term rating of ACER BBB (Stable) reaffirmed"
      className={className}
      ariaLabel="Headline"
    />
  );
}

const unitOf = (b: Briefing) => b.facts.amountUnit || "INR crore";

// ═════════════════════════ A: Boardroom ═════════════════════════
function BoardroomCover({ note, mutate, b }: { note: RatingNote; mutate: Mutate; b: Briefing }) {
  const tiles = [
    ["Rating", b.facts.rating],
    ["Outlook", b.facts.outlook],
    ["Action", b.facts.action],
    [`Rated (${unitOf(b)})`, b.facts.totalAmount],
  ];
  return (
    <div className="-mx-14 -mt-8 mb-6">
      <div className="flex items-center justify-between px-14 py-5">
        <Logo />
        <div className="flex items-start gap-3">
          <InlineInput value={note.meta.documentType} onChange={(v) => mutate((d) => void (d.meta.documentType = v))} className="w-28 text-right text-[9.5px] font-bold uppercase tracking-[0.2em] text-muted" ariaLabel="Document type" />
          <DateControl note={note} mutate={mutate} />
        </div>
      </div>
      <div className="bg-deep px-14 pt-7">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-lime">Credit rating action</div>
        <Company note={note} mutate={mutate} className="mt-2 font-serif text-[36px] font-bold leading-tight !text-white placeholder:!text-white/40" />
        <Headline note={note} mutate={mutate} className="mt-1 max-w-[560px] text-[15px] leading-snug !text-banner-text placeholder:!text-white/40" />
        <div className="mt-6 grid grid-cols-4 border-t border-banner-rule" title="Derived from the headline and instruments table">
          {tiles.map(([l, v], i) => (
            <div key={l} className={`py-4 ${i ? "border-l border-banner-rule pl-4" : ""}`}>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-banner-label">{l}</div>
              <div className="mt-1 font-serif text-[20px] font-bold text-white">{v || "-"}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="brand-gradient h-[3px]" />
      <div className="grid grid-cols-[1.6fr_1fr] gap-6 px-14 pt-7">
        <div>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-accent">Executive summary</div>
          <div className="mt-1 font-serif text-[20px] font-bold text-heading">What drives the rating</div>
          <div className="mt-3 space-y-3">
            {b.keyMessages.length ? (
              b.keyMessages.map((m, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-6 font-serif text-[26px] font-bold leading-none text-light">{i + 1}</span>
                  <p className="text-[13px] leading-relaxed text-ink">{m}</p>
                </div>
              ))
            ) : (
              <p className="text-[12px] italic text-muted">Appears once the Brief Summary section has text.</p>
            )}
          </div>
          <From>First sentence of each Brief Summary paragraph. Edit them in that section below.</From>
        </div>
        <div className="bg-mist p-4">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Drivers at a glance</div>
          <div className="mt-2 space-y-1.5">
            {b.strengths.map((d) => (
              <div key={d.title} className="flex gap-2 text-[12px] leading-snug text-heading">
                <Up /> {d.title}
              </div>
            ))}
            {b.strengths.length && b.weaknesses.length ? <div className="my-2 h-px bg-hairline" /> : null}
            {b.weaknesses.map((d) => (
              <div key={d.title} className="flex gap-2 text-[12px] leading-snug text-heading">
                <Down /> {d.title}
              </div>
            ))}
            {!b.drivers.length ? <p className="text-[11.5px] italic text-muted">Appears once Key Rating Drivers has titled drivers.</p> : null}
          </div>
          {b.liquidity ? (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">Liquidity</span>
              <span className="bg-deep px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-white">{b.liquidity}</span>
            </div>
          ) : null}
          <From>From Key Rating Drivers and Liquidity.</From>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════ B: Scorecard ═════════════════════════
function ScorecardCover({ note, mutate, b }: { note: RatingNote; mutate: Mutate; b: Briefing }) {
  const facts = [
    ["Rating", b.facts.rating, "text-[26px]"],
    ["Outlook", b.facts.outlook, "text-[18px]"],
    ["Rating action", b.facts.action, "text-[18px]"],
    [`Total rated (${unitOf(b)})`, b.facts.totalAmount, "text-[18px]"],
    ["Liquidity", b.liquidity, "text-[18px]"],
  ];
  return (
    <div className="-mx-14 -mt-8 mb-6 grid grid-cols-[210px_1fr]">
      <aside className="relative bg-mist px-6 pb-6 pt-7">
        <div className="brand-gradient-v absolute inset-y-0 right-0 w-[3px]" />
        <Logo className="h-10" />
        <div className="mt-8 space-y-4" title="Derived from the headline, instruments table and liquidity section">
          {facts.map(([l, v, size]) => (
            <div key={l} className="border-b border-hairline pb-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">{l}</div>
              <div className={`font-serif font-bold text-heading ${size}`}>{v || "-"}</div>
            </div>
          ))}
          <div className="border-b border-hairline pb-3">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">Date</div>
            <DateControl note={note} mutate={mutate} align="left" />
          </div>
          {b.drivers.length ? (
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">Driver balance</div>
              <div className="flex h-2 gap-0.5">
                {b.strengths.length ? <div style={{ flex: b.strengths.length }} className="bg-accent" /> : null}
                {b.weaknesses.length ? <div style={{ flex: b.weaknesses.length }} className="bg-amber" /> : null}
              </div>
              <div className="mt-1 text-[10.5px] text-muted">
                {b.strengths.length} strengths | {b.weaknesses.length} weaknesses
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      <div className="px-10 pt-9">
        <InlineInput value={note.meta.documentType} onChange={(v) => mutate((d) => void (d.meta.documentType = v))} className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-accent" ariaLabel="Document type" />
        <Company note={note} mutate={mutate} className="mt-1 font-serif text-[34px] font-bold leading-tight text-heading" />
        <div className="my-4 h-[3px] w-14 bg-deep" />
        <Headline note={note} mutate={mutate} className="text-[16px] font-medium leading-snug text-heading" />
        <div className="mt-6 text-[9.5px] font-bold uppercase tracking-[0.2em] text-accent">The rating in brief</div>
        <div className="mt-2 space-y-2.5">
          {b.keyMessages.length ? (
            b.keyMessages.map((m, i) => (
              <p key={i} className={`border-l-2 pl-3 text-[13px] leading-relaxed text-ink ${i === 0 ? "border-deep" : "border-light"}`}>
                {m}
              </p>
            ))
          ) : (
            <p className="text-[12px] italic text-muted">Appears once the Brief Summary section has text.</p>
          )}
        </div>
        <From>First sentence of each Brief Summary paragraph. Edit them in that section below.</From>
      </div>
    </div>
  );
}

// ═════════════════════════ C: Report ═════════════════════════
function ReportCover({ note, mutate, b }: { note: RatingNote; mutate: Mutate; b: Briefing }) {
  const metrics = [
    b.facts.rating ? { l: "Rating", v: b.facts.rating, p: b.facts.action, warn: false } : null,
    b.facts.outlook ? { l: "Outlook", v: b.facts.outlook, p: "", warn: false } : null,
    ...b.kpis.slice(0, 2).map((k) => ({ l: `${k.label}, ${k.period}`, v: k.value, p: k.change, warn: !k.good })),
    b.facts.totalAmount ? { l: `Total rated (${unitOf(b)})`, v: b.facts.totalAmount, p: "", warn: false } : null,
  ]
    .filter(Boolean)
    .slice(0, 4) as { l: string; v: string; p: string; warn: boolean }[];
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between">
        <Logo />
        <DateControl note={note} mutate={mutate} />
      </div>
      <div className="mt-3 h-px bg-hairline" />
      <InlineInput value={note.meta.documentType} onChange={(v) => mutate((d) => void (d.meta.documentType = v))} className="mt-5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-accent" ariaLabel="Document type" />
      <Company note={note} mutate={mutate} className="mt-1 font-serif text-[34px] font-bold leading-tight text-heading" />
      <Headline note={note} mutate={mutate} className="mt-1 text-[15px] leading-snug text-muted" />
      <div className="mt-3 flex flex-wrap gap-2">
        {b.facts.rating ? (
          <span className="rounded-full bg-green-tint px-3 py-1 text-[11px] font-bold text-primary">
            Rating: {b.facts.rating}
            {b.facts.outlook ? ` (${b.facts.outlook})` : ""}
          </span>
        ) : null}
        {b.liquidity ? <span className="rounded-full bg-mist px-3 py-1 text-[11px] font-bold text-heading">Liquidity: {b.liquidity}</span> : null}
      </div>
      {metrics.length ? (
        <div className="mt-5 rounded-lg border border-hairline p-4">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Executive summary</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {metrics.map((m) => (
              <div key={m.l} className="border border-hairline p-3" style={{ borderLeft: `3px solid ${m.warn ? "var(--color-amber)" : "var(--color-accent)"}` }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{m.l}</div>
                <div className="mt-1 text-[22px] font-bold text-heading">{m.v}</div>
                {m.p ? (
                  <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${m.warn ? "border-amber text-amber" : "border-accent text-primary"}`}>{m.p}</span>
                ) : null}
              </div>
            ))}
          </div>
          <From>Derived from the headline, instruments and financial table. Changes are computed from the note&apos;s own figures.</From>
        </div>
      ) : null}
      {b.drivers.length ? (
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3">
          <div className="rounded-lg border border-hairline p-4">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Highlights and risks</div>
            <div className="mt-2 space-y-1.5">
              {b.drivers.map((d) => (
                <div key={d.title} className="flex gap-2 text-[12px] leading-snug">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${d.tone === "s" ? "bg-accent" : "bg-amber"}`} />
                  {d.title}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">At a glance</div>
            {[
              ["Credit strengths", b.strengths.length],
              ["Credit weaknesses", b.weaknesses.length],
              ["Instruments rated", note.instruments?.rows.length ?? 0],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between border-b border-hairline py-1.5 text-[12px] last:border-0">
                <span className="text-muted">{k}</span>
                <span className="font-bold text-heading">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EditorCover({ template, note, mutate }: { template: EditorTemplate; note: RatingNote; mutate: Mutate }) {
  const b = buildBriefing(note);
  if (template === "scorecard") return <ScorecardCover note={note} mutate={mutate} b={b} />;
  if (template === "report") return <ReportCover note={note} mutate={mutate} b={b} />;
  return <BoardroomCover note={note} mutate={mutate} b={b} />;
}

/** Section heading in the style of the selected template. */
export function SectionHeadingEditor({ template, index, value, onChange }: { template: EditorTemplate; index: number; value: string; onChange: (v: string) => void }) {
  if (template === "scorecard")
    return (
      <div className="flex items-end gap-3">
        <span className="font-serif text-[32px] font-bold leading-none text-light">{String(index).padStart(2, "0")}</span>
        <InlineInput value={value} onChange={onChange} placeholder="Section title" className="font-serif text-[20px] font-bold text-heading" ariaLabel={`Section ${index} title`} />
      </div>
    );
  if (template === "report")
    return (
      <div className="flex items-center gap-2.5">
        <span className="h-4 w-[3px] shrink-0 bg-deep" />
        <InlineInput value={value} onChange={onChange} placeholder="Section title" className="text-[16px] font-bold text-heading" ariaLabel={`Section ${index} title`} />
      </div>
    );
  return (
    <div className="border-b border-hairline pb-1.5">
      <InlineInput value={value} onChange={onChange} placeholder="Section title" className="font-serif text-[20px] font-bold text-heading" ariaLabel={`Section ${index} title`} />
    </div>
  );
}
