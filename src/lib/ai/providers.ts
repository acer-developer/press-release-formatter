import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Provider-independent structured generation. Every provider receives the same system prompt
 * and must return JSON matching LlmNoteSchema; the caller validates and verifies the result.
 */

const LlmTable = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  totalRow: z.array(z.string()),
  source: z.string(),
  footnotes: z.array(z.string()),
});

const LlmBlock = z.object({
  type: z.enum(["paragraph", "subheading", "driver", "bullets", "table"]),
  /** paragraph/subheading text, driver body */
  text: z.string(),
  /** driver title */
  title: z.string(),
  /** bullets intro */
  intro: z.string(),
  /** bullet items */
  items: z.array(z.string()),
  /** table content (empty for non-table blocks) */
  table: LlmTable,
});

export const LlmNoteSchema = z.object({
  meta: z.object({ documentType: z.string(), date: z.string(), companyName: z.string(), headline: z.string() }),
  instruments: LlmTable,
  sections: z.array(z.object({ title: z.string(), blocks: z.array(LlmBlock) })),
  contacts: z.array(z.object({ role: z.string(), name: z.string(), phone: z.string(), email: z.string() })),
  disclaimer: z.string(),
  /** Facts the model could not place or questions for the analyst. Shown as review items. */
  openQuestions: z.array(z.string()),
});
export type LlmNote = z.infer<typeof LlmNoteSchema>;

export type ProviderId = "anthropic" | "gemini" | "groq";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string;
  available: boolean;
  free: boolean;
}

export function listProviders(): ProviderInfo[] {
  return [
    {
      id: "anthropic",
      label: "Claude (Anthropic)",
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      available: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      free: false,
    },
    {
      id: "gemini",
      label: "Google Gemini (free tier)",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      available: !!process.env.GEMINI_API_KEY,
      free: true,
    },
    {
      id: "groq",
      label: "Groq (free tier)",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      available: !!process.env.GROQ_API_KEY,
      free: true,
    },
  ];
}

export function defaultProvider(): ProviderId | null {
  const pref = process.env.AI_PROVIDER as ProviderId | undefined;
  const providers = listProviders();
  if (pref && providers.find((p) => p.id === pref)?.available) return pref;
  return providers.find((p) => p.available)?.id ?? null;
}

const extractJson = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The AI provider did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
};

/** Lenient validation for providers without schema-constrained decoding. */
function coerce(raw: unknown): LlmNote {
  const strict = LlmNoteSchema.safeParse(raw);
  if (strict.success) return strict.data;
  // Fill in missing fields with empty values rather than failing a whole generation.
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const arr = <T,>(v: unknown, f: (x: unknown) => T): T[] => (Array.isArray(v) ? v.map(f) : []);
  const strArr = (v: unknown) => arr(v, str);
  const table = (v: unknown) => {
    const t = (v ?? {}) as Record<string, unknown>;
    return {
      title: str(t.title),
      columns: strArr(t.columns),
      rows: arr(t.rows, strArr),
      totalRow: strArr(t.totalRow),
      source: str(t.source),
      footnotes: strArr(t.footnotes),
    };
  };
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  return {
    meta: { documentType: str(meta.documentType), date: str(meta.date), companyName: str(meta.companyName), headline: str(meta.headline) },
    instruments: table(r.instruments),
    sections: arr(r.sections, (s) => {
      const sec = (s ?? {}) as Record<string, unknown>;
      return {
        title: str(sec.title),
        blocks: arr(sec.blocks, (b) => {
          const bl = (b ?? {}) as Record<string, unknown>;
          const type = ["paragraph", "subheading", "driver", "bullets", "table"].includes(str(bl.type)) ? (str(bl.type) as LlmNote["sections"][number]["blocks"][number]["type"]) : "paragraph";
          return { type, text: str(bl.text), title: str(bl.title), intro: str(bl.intro), items: strArr(bl.items), table: table(bl.table) };
        }),
      };
    }),
    contacts: arr(r.contacts, (c) => {
      const co = (c ?? {}) as Record<string, unknown>;
      return { role: str(co.role), name: str(co.name), phone: str(co.phone), email: str(co.email) };
    }),
    disclaimer: str(r.disclaimer),
    openQuestions: strArr(r.openQuestions),
  };
}

export async function generateStructured(provider: ProviderId, system: string, user: string): Promise<{ note: LlmNote; model: string }> {
  const info = listProviders().find((p) => p.id === provider)!;
  if (!info.available) throw new Error(`${info.label} is not configured on the server.`);

  if (provider === "anthropic") {
    const client = new Anthropic();
    // Streaming avoids HTTP timeouts on long notes with many annexure tables.
    const stream = client.messages.stream({
      model: info.model,
      max_tokens: 64000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "medium", format: zodOutputFormat(LlmNoteSchema) },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (message.stop_reason === "max_tokens") throw new Error("The document is too long for a single generation. Split it and try again.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { note: coerce(JSON.parse(text)), model: info.model };
  }

  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(info.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { note: coerce(extractJson(text)), model: info.model };
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: info.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { note: coerce(extractJson(data.choices?.[0]?.message?.content ?? "")), model: info.model };
}
