import { listNotes, saveNote } from "@/lib/db";
import { RatingNoteSchema } from "@/lib/note/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ notes: listNotes() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RatingNoteSchema.safeParse(body?.note);
  if (!parsed.success) return Response.json({ error: "Invalid note" }, { status: 400 });
  const saved = saveNote({
    id: typeof body.id === "string" ? body.id : undefined,
    note: parsed.data,
    sourceText: typeof body.sourceText === "string" ? body.sourceText : undefined,
    engine: typeof body.engine === "string" ? body.engine : "",
    comment: typeof body.comment === "string" ? body.comment : "",
  });
  return Response.json(saved);
}
