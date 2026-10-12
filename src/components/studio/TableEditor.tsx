"use client";

import { Columns3, Plus, Rows3, Sigma, X } from "lucide-react";

import { columnWidths } from "@/lib/note/derive";
import { addColumn, removeColumn } from "@/lib/note/ops";
import type { NoteTable } from "@/lib/note/schema";

import { AutoText, InlineInput } from "./fields";

export function TableEditor({
  table,
  onChange,
  exhibit,
}: {
  table: NoteTable;
  onChange: (t: NoteTable) => void;
  exhibit: number;
}) {
  const setCell = (r: number, c: number, v: string) =>
    onChange({ ...table, rows: table.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)) });
  const setHeader = (c: number, v: string) => onChange({ ...table, columns: table.columns.map((h, i) => (i === c ? v : h)) });
  const setTotal = (c: number, v: string) => onChange({ ...table, totalRow: (table.totalRow ?? table.columns.map(() => "")).map((x, i) => (i === c ? v : x)) });

  const widths = columnWidths(table);
  return (
    <div className="my-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-teal-ink">Exhibit {exhibit}</span>
        <InlineInput value={table.title} onChange={(v) => onChange({ ...table, title: v })} placeholder="Exhibit title" className="flex-1 text-[12px] font-semibold text-heading" />
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
            <col style={{ width: 22 }} />
          </colgroup>
          <thead>
            <tr className="bg-deep text-white">
              {table.columns.map((h, c) => (
                <th key={c} className="group relative border-r border-white/10 px-1.5 py-1.5 text-left align-top font-semibold last:border-r-0">
                  <AutoText value={h} onChange={(v) => setHeader(c, v)} ariaLabel={`Column ${c + 1} header`} placeholder="Header" className="text-[10.5px] font-semibold leading-snug !text-white placeholder:!text-white/50" />
                  <button
                    type="button"
                    title="Delete column"
                    onClick={() => onChange(removeColumn(table, c))}
                    className="absolute -top-2 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"
                  >
                    <X size={10} />
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="group border-b border-hairline bg-white">
                {table.columns.map((_, c) => (
                  <td key={c} className="px-1.5 py-1 align-top">
                    <AutoText value={row[c] ?? ""} onChange={(v) => setCell(r, c, v)} className={`text-[11px] leading-snug ${c === 0 ? "font-medium text-heading" : ""}`} ariaLabel={`Row ${r + 1}, ${table.columns[c] || `column ${c + 1}`}`} />
                  </td>
                ))}
                <td className="w-6 align-middle">
                  <button type="button" title="Delete row" onClick={() => onChange({ ...table, rows: table.rows.filter((_, i) => i !== r) })} className="hidden text-muted hover:text-red-700 group-hover:block">
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {table.totalRow ? (
              <tr className="border-t-2 border-deep bg-tint font-bold text-heading">
                {table.columns.map((_, c) => (
                  <td key={c} className="px-1.5 py-1">
                    <InlineInput value={table.totalRow![c] ?? ""} onChange={(v) => setTotal(c, v)} className="text-[11px] font-bold" ariaLabel={`Total row, column ${c + 1}`} />
                  </td>
                ))}
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
        <button type="button" onClick={() => onChange({ ...table, rows: [...table.rows, table.columns.map(() => "")] })} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-mist hover:text-heading">
          <Rows3 size={12} /> Row
        </button>
        <button type="button" onClick={() => onChange(addColumn(table))} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-mist hover:text-heading">
          <Columns3 size={12} /> Column
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...table, totalRow: table.totalRow ? undefined : table.columns.map((_, i) => (i === 0 ? "Total" : "")) })}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-mist hover:text-heading"
        >
          <Sigma size={12} /> {table.totalRow ? "Remove total" : "Total row"}
        </button>
      </div>
      <div className="mt-1 grid gap-0.5 text-[10.5px] text-muted">
        <div className="flex items-baseline gap-1">
          <span className="shrink-0">Source:</span>
          <InlineInput value={table.source} onChange={(v) => onChange({ ...table, source: v })} placeholder="e.g. Company, ACER" />
        </div>
        <AutoText
          value={table.footnotes.join("\n")}
          onChange={(v) => onChange({ ...table, footnotes: v ? v.split("\n") : [] })}
          placeholder="Footnotes, one per line"
          className="italic"
        />
      </div>
    </div>
  );
}

export function AddTableButton({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <button type="button" onClick={onAdd} className="my-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-1.5 text-[12px] text-muted hover:border-accent hover:text-heading">
      <Plus size={13} /> {label}
    </button>
  );
}
