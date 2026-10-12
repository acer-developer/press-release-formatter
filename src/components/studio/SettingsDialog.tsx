"use client";

import { ExternalLink, Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";

import { PROVIDERS, type AiSettings, type ProviderId } from "@/lib/ai/providers";

import { useEscape } from "./fields";

export function SettingsDialog({ value, onSave, onClose }: { value: AiSettings; onSave: (s: AiSettings) => void; onClose: () => void }) {
  useEscape(onClose);
  const [draft, setDraft] = useState<AiSettings>(structuredClone(value));
  const [show, setShow] = useState<Partial<Record<ProviderId, boolean>>>({});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-10" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="font-serif text-[18px] font-bold text-heading">AI settings</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-mist">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-[12px] leading-relaxed text-muted">
            AI is optional. Existing ACER notes are rebuilt without it. Keys are stored only in this browser and are sent only to the provider you pick. Do not use this on a shared computer.
          </p>
          {PROVIDERS.map((p) => (
            <div key={p.id} className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-heading">{p.label}</div>
                <a href={p.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-teal-ink hover:underline">
                  Get a key <ExternalLink size={11} />
                </a>
              </div>
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={show[p.id] ? "text" : "password"}
                    value={draft.keys[p.id] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, keys: { ...d.keys, [p.id]: e.target.value } }))}
                    placeholder="API key"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-md border border-hairline px-2 pr-8 font-mono text-[12px] outline-none focus:border-accent"
                  />
                  <button type="button" onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))} aria-label="Show or hide key" className="absolute right-2 top-2.5 text-muted">
                    {show[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input
                  value={draft.models[p.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, models: { ...d.models, [p.id]: e.target.value } }))}
                  placeholder={p.defaultModel}
                  aria-label={`${p.label} model`}
                  className="h-9 w-48 rounded-md border border-hairline px-2 text-[12px] outline-none focus:border-accent"
                />
              </div>
            </div>
          ))}
          <div>
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Preferred provider for Automatic</div>
            <select
              value={draft.preferred}
              onChange={(e) => setDraft((d) => ({ ...d, preferred: e.target.value as AiSettings["preferred"] }))}
              className="h-9 w-full rounded-md border border-hairline bg-white px-2 text-[12.5px] outline-none focus:border-accent"
            >
              <option value="">First provider with a key</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-[12.5px] text-muted hover:bg-mist">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(draft)} className="h-9 rounded-md bg-deep px-4 text-[12.5px] font-semibold text-white hover:bg-teal-ink">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
