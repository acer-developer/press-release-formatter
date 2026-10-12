"use client";

import { ArrowDown, ArrowUp, Copy, Heading2, List, ListPlus, Pilcrow, Plus, Quote, Table2, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";

import { emptyTable, move, newBlock, sectionTemplate } from "@/lib/note/ops";
import { newId, STANDARD_SECTIONS, type BlockType, type Issue, type NoteBlock, type RatingNote } from "@/lib/note/schema";

import { EditorCover, SectionHeadingEditor, type EditorTemplate } from "./EditorCover";
import { AutoText, IconButton, InlineInput } from "./fields";
import { AddTableButton, TableEditor } from "./TableEditor";

type Mutate = (fn: (draft: RatingNote) => void) => void;

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "paragraph", label: "Paragraph", icon: <Pilcrow size={13} /> },
  { type: "driver", label: "Titled argument", icon: <Quote size={13} /> },
  { type: "bullets", label: "Bullets", icon: <List size={13} /> },
  { type: "subheading", label: "Subheading", icon: <Heading2 size={13} /> },
  { type: "table", label: "Table", icon: <Table2 size={13} /> },
];

function AddBlockMenu({ onAdd }: { onAdd: (t: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted opacity-60 hover:bg-mist hover:text-heading hover:opacity-100"
      >
        <Plus size={12} /> Add block
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-hairline bg-white p-1 shadow-lg">
          {BLOCK_TYPES.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => {
                onAdd(b.type);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-mist"
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const toneOf = (ctx: string) => (/strength|positive/i.test(ctx) ? "var(--color-accent)" : /weakness|negative/i.test(ctx) ? "var(--color-amber)" : "var(--color-deep)");

function BlockBody({ block, onChange, exhibit, tone, template, sensitivity }: { block: NoteBlock; onChange: (b: NoteBlock) => void; exhibit: number; tone: string; template: EditorTemplate; sensitivity: boolean }) {
  switch (block.type) {
    case "paragraph":
      return <AutoText value={block.text} onChange={(text) => onChange({ ...block, text })} placeholder="Write a paragraph" className="text-[13px] leading-[1.6]" />;
    case "subheading": {
      const pill = /strength|weakness|positive|negative/i.test(block.text);
      return (
        <div className={pill ? "inline-block" : ""}>
          <InlineInput
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
            placeholder="Subheading"
            className={pill ? `rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${/strength|positive/i.test(block.text) ? "bg-teal-tint text-teal-ink" : "bg-amber-tint text-amber"}` : "text-[13.5px] font-semibold text-heading"}
          />
        </div>
      );
    }
    case "driver": {
      const kind = tone === "var(--color-accent)" ? "s" : tone === "var(--color-amber)" ? "w" : "n";
      const label = kind === "n" ? "" : sensitivity ? (kind === "s" ? "Upside" : "Downside") : kind === "s" ? "Strength" : "Weakness";
      return (
        <div className={`flex gap-3 ${template === "report" ? "rounded-lg border border-hairline p-3" : ""}`}>
          <div className="mt-1 w-[3px] shrink-0 rounded" style={{ background: tone }} />
          <div className="flex-1">
            <div className="flex items-start gap-2">
              <InlineInput value={block.title} onChange={(title) => onChange({ ...block, title })} placeholder="Argument title" className="flex-1 text-[13.5px] font-semibold text-heading" />
              {template !== "boardroom" && label ? (
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${kind === "s" ? "bg-teal-tint text-teal-ink" : "bg-amber-tint text-amber"}`}>{label}</span>
              ) : null}
            </div>
            <AutoText value={block.text} onChange={(text) => onChange({ ...block, text })} placeholder="Evidence and implication" className="text-[13px] leading-[1.6]" />
          </div>
        </div>
      );
    }
    case "bullets":
      return (
        <div>
          <AutoText value={block.intro} onChange={(intro) => onChange({ ...block, intro })} placeholder="Intro line (optional)" className="mb-1 text-[13px] leading-[1.6]" />
          {block.items.map((item, i) => (
            <div key={i} className="group/item flex items-start gap-2.5">
              <span className="mt-[9px] h-[5px] w-[5px] shrink-0" style={{ background: tone }} />
              <AutoText
                value={item}
                onChange={(v) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? v : x)) })}
                placeholder="Bullet"
                className="flex-1 text-[13px] leading-[1.6]"
              />
              <button type="button" title="Remove bullet" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} className="mt-1 hidden text-muted hover:text-red-700 group-hover/item:block">
                <X size={13} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, ""] })} className="ml-4 mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted opacity-60 hover:text-heading hover:opacity-100">
            <ListPlus size={12} /> Bullet
          </button>
        </div>
      );
    case "table":
      return <TableEditor table={block.table} exhibit={exhibit} onChange={(table) => onChange({ ...block, table })} />;
  }
}

export function NoteEditor({
  note,
  mutate,
  issuesByBlock,
  focusId,
}: {
  note: RatingNote;
  mutate: Mutate;
  issuesByBlock: Map<string, Issue[]>;
  focusId: string | null;
}) {
  const template = (note.options?.template ?? "boardroom") as EditorTemplate;
  let exhibit = note.instruments ? 1 : 0;
  const [showTemplates, setShowTemplates] = useState(false);

  const severityRing = (id: string) => {
    const list = issuesByBlock.get(id);
    if (!list?.length) return "";
    if (list.some((i) => i.severity === "error")) return "ring-1 ring-red-400/70 bg-red-50/40";
    if (list.some((i) => i.severity === "warning")) return "ring-1 ring-amber-400/70 bg-amber-50/40";
    return "";
  };

  return (
    <article className="paper mx-auto w-full max-w-[820px] bg-white px-14 pb-16 pt-8">
      {/* Cover in the layout of the selected template; editable fields stay editable in place. */}
      <EditorCover template={template} note={note} mutate={mutate} />

      <div id="block-instruments" className={`mt-5 rounded ${severityRing("instruments")} ${focusId === "instruments" ? "ring-2 ring-accent" : ""}`}>
        {note.instruments ? (
          <div className="block relative">
            <div className="block-toolbar absolute -right-10 top-0 flex flex-col">
              <IconButton title="Remove instruments table" danger onClick={() => mutate((d) => void (d.instruments = null))}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            <TableEditor table={note.instruments} exhibit={1} onChange={(t) => mutate((d) => void (d.instruments = t))} />
          </div>
        ) : (
          <AddTableButton
            label="Add instruments table"
            onAdd={() =>
              mutate((d) => {
                d.instruments = {
                  ...emptyTable(["Instrument / Facility", "Date of Allotment", "Coupon Rate", "Maturity Date", "Amount (INR Crore)", "Rating with Outlook", "Regulator"]),
                  title: "Details of instruments",
                  totalRow: ["Total Rated Limits", "", "", "", "", "", ""],
                };
              })
            }
          />
        )}
      </div>

      {note.sections.map((section, si) => {
        let context = section.title;
        return (
          <section key={section.id} className="block relative mt-7">
            <div className="block-toolbar absolute -right-10 top-0 flex flex-col">
              <IconButton title="Move section up" disabled={si === 0} onClick={() => mutate((d) => void (d.sections = move(d.sections, si, si - 1)))}>
                <ArrowUp size={13} />
              </IconButton>
              <IconButton title="Move section down" disabled={si === note.sections.length - 1} onClick={() => mutate((d) => void (d.sections = move(d.sections, si, si + 1)))}>
                <ArrowDown size={13} />
              </IconButton>
              <IconButton title="Delete section" danger onClick={() => mutate((d) => void d.sections.splice(si, 1))}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            <SectionHeadingEditor template={template} index={si + 1} value={section.title} onChange={(v) => mutate((d) => void (d.sections[si].title = v))} />
            <div className="mt-3 space-y-2.5">
              {section.blocks.map((block, bi) => {
                if (block.type === "subheading") context = block.text;
                const ex = block.type === "table" ? ++exhibit : exhibit;
                const blockIssues = issuesByBlock.get(block.id) ?? [];
                return (
                  <div
                    key={block.id}
                    id={`block-${block.id}`}
                    className={`block relative -mx-2 rounded px-2 py-0.5 ${severityRing(block.id)} ${focusId === block.id ? "ring-2 ring-accent" : ""}`}
                  >
                    <div className="block-toolbar absolute -right-10 top-0 z-10 flex flex-col rounded bg-white/90">
                      <IconButton title="Move up" disabled={bi === 0} onClick={() => mutate((d) => void (d.sections[si].blocks = move(d.sections[si].blocks, bi, bi - 1)))}>
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton title="Move down" disabled={bi === section.blocks.length - 1} onClick={() => mutate((d) => void (d.sections[si].blocks = move(d.sections[si].blocks, bi, bi + 1)))}>
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton title="Duplicate" onClick={() => mutate((d) => void d.sections[si].blocks.splice(bi + 1, 0, { ...structuredClone(block), id: newId() }))}>
                        <Copy size={13} />
                      </IconButton>
                      <IconButton title="Delete block" danger onClick={() => mutate((d) => void d.sections[si].blocks.splice(bi, 1))}>
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                    <BlockBody block={block} exhibit={ex} tone={toneOf(context)} template={template} sensitivity={/sensitivit/i.test(section.title)} onChange={(b) => mutate((d) => void (d.sections[si].blocks[bi] = b))} />
                    {blockIssues.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {blockIssues.slice(0, 3).map((iss, k) => (
                          <li key={k} className={`text-[10.5px] ${iss.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                            ● {iss.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              <AddBlockMenu onAdd={(t) => mutate((d) => void d.sections[si].blocks.push(newBlock(t)))} />
            </div>
          </section>
        );
      })}

      <div className="relative mt-8">
        <button
          type="button"
          onClick={() => setShowTemplates((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-1.5 text-[12px] text-muted hover:border-accent hover:text-heading"
        >
          <Plus size={13} /> Add section
        </button>
        {showTemplates ? (
          <div className="absolute z-20 mt-1 grid w-[420px] grid-cols-2 gap-0.5 rounded-md border border-hairline bg-white p-1.5 shadow-lg">
            {[...STANDARD_SECTIONS, "Custom section"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  mutate((d) => void d.sections.push(sectionTemplate(t === "Custom section" ? "" : t)));
                  setShowTemplates(false);
                }}
                className="rounded px-2 py-1.5 text-left text-[12px] hover:bg-mist"
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Contacts */}
      <section className="mt-9">
        <h3 className="font-serif text-[19px] font-semibold text-heading">Analytical Contacts</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {note.contacts.map((c, i) => (
            <div key={i} className="group relative border border-hairline p-3" style={{ borderTop: "2px solid var(--color-deep)" }}>
              <button type="button" title="Remove contact" onClick={() => mutate((d) => void d.contacts.splice(i, 1))} className="absolute right-1.5 top-1.5 hidden text-muted hover:text-red-700 group-hover:block">
                <X size={13} />
              </button>
              <InlineInput value={c.role} onChange={(v) => mutate((d) => void (d.contacts[i].role = v))} placeholder="Role" className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted" />
              <InlineInput value={c.name} onChange={(v) => mutate((d) => void (d.contacts[i].name = v))} placeholder="Name" className="text-[14px] font-semibold text-heading" />
              <InlineInput value={c.phone} onChange={(v) => mutate((d) => void (d.contacts[i].phone = v))} placeholder="Phone" className="text-[12px]" />
              <InlineInput value={c.email} onChange={(v) => mutate((d) => void (d.contacts[i].email = v))} placeholder="Email" className="text-[12px] text-teal-ink" />
            </div>
          ))}
          <button
            type="button"
            onClick={() => mutate((d) => void d.contacts.push({ role: "Primary Analyst", name: "", phone: "", email: "" }))}
            className="flex min-h-[90px] items-center justify-center gap-1.5 border border-dashed border-hairline text-[12px] text-muted hover:border-accent hover:text-heading"
          >
            <UserPlus size={14} /> Add contact
          </button>
        </div>
      </section>

      <section className="mt-8 border border-hairline p-4">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">Disclaimer</div>
        <AutoText value={note.disclaimer} onChange={(v) => mutate((d) => void (d.disclaimer = v))} className="mt-1 text-[10.5px] leading-relaxed text-muted" />
      </section>
    </article>
  );
}
