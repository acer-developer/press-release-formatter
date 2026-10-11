import { RatingNoteSchema } from "@/lib/note/schema";
import { renderNotePdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RatingNoteSchema.safeParse(body?.note);
  if (!parsed.success) return Response.json({ error: "Invalid note", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  try {
    const pdf = await renderNotePdf(parsed.data);
    const name = (parsed.data.meta.companyName || "rating-note").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${body?.download ? "attachment" : "inline"}; filename="${name}-press-release.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}
