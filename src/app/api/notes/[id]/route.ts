import { deleteNote, getNote } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = new URL(req.url).searchParams.get("version");
  const note = getNote(id, v ? Number(v) : undefined);
  if (!note) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(note);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteNote(id);
  return Response.json({ ok: true });
}
