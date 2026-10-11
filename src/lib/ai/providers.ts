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

/** JSON Schema of the expected output, for providers that accept one (Gemini) or need it in the prompt (Groq). */
const llmJsonSchema = () => {
  const schema = z.toJSONSchema(LlmNoteSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
};

export type ProviderId = "anthropic" | "gemini" | "groq";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  defaultModel: string;
  free: boolean;
  keyUrl: string;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini (free tier)", defaultModel: "gemini-flash-latest", free: true, keyUrl: "https://aistudio.google.com/apikey" },
  { id: "groq", label: "Groq (free tier)", defaultModel: "llama-3.3-70b-versatile", free: true, keyUrl: "https://console.groq.com/keys" },
  { id: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-opus-5-5", free: false, keyUrl: "https://console.anthropic.com/settings/keys" },
];

/** Per-user AI settings. Keys live only in the user's browser and are sent only to the provider. */
export interface AiSettings {
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  preferred: ProviderId | "";
}

export const emptyAiSettings = (): AiSettings => ({ keys: {}, models: {}, preferred: "" });

export const isAvailable = (s: AiSettings, id: ProviderId) => !!s.keys[id]?.trim();

export function defaultProvider(s: AiSettings): ProviderId | null {
  if (s.preferred && isAvailable(s, s.preferred)) return s.preferred;
  return PROVIDERS.find((p) => isAvailable(s, p.id))?.id ?? null;
}

const extractJson = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The AI provider did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
};

/** Retries transient failures (rate limits, overload) with short backoff. */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let res: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      res = await fetch(url, init);
    } catch {
      // Overloaded endpoints sometimes drop the connection or omit CORS headers on errors.
      res = new Response("Network error reaching the AI provider.", { status: 503 });
    }
    if (res.status !== 429 && res.status < 500) return res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
  }
  return res!;
}

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

export async function generateStructured(
  provider: ProviderId,
  settings: AiSettings,
  system: string,
  user: string
): Promise<{ note: LlmNote; model: string }> {
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const apiKey = settings.keys[provider]?.trim();
  if (!apiKey) throw new Error(`Add a ${meta.label} key in Settings first.`);
  const model = settings.models[provider]?.trim() || meta.defaultModel;

  if (provider === "anthropic") {
    // The key belongs to the person using the page and never leaves their browser except to Anthropic.
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    // Streaming avoids HTTP timeouts on long notes with many annexure tables.
    const stream = client.messages.stream({
      model,
      max_tokens: 64000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "medium", format: zodOutputFormat(LlmNoteSchema) },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (message.stop_reason === "max_tokens") throw new Error("The document is too long for a single generation. Split it and try again.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { note: coerce(JSON.parse(text)), model };
  }

  if (provider === "gemini") {
    // Free-tier models are often briefly overloaded; fall back to sibling models when the user
    // has not pinned one.
    const candidates = settings.models.gemini?.trim() ? [model] : [...new Set([model, "gemini-3.5-flash", "gemini-flash-lite-latest"])];
    let lastError = "";
    for (const m of candidates) {
      const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: llmJsonSchema(), temperature: 0 },
        }),
      });
      if (!res.ok) {
        lastError = `Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`;
        if (res.status === 429 || res.status >= 500 || res.status === 404) continue;
        throw new Error(lastError);
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      return { note: coerce(extractJson(text)), model: m };
    }
    throw new Error(`${lastError} Try again in a minute.`);
  }

  const res = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\n\nReturn only JSON that validates against this JSON Schema:\n${JSON.stringify(llmJsonSchema())}` },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { note: coerce(extractJson(data.choices?.[0]?.message?.content ?? "")), model };
}
