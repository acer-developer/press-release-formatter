import { defaultProvider, listProviders } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ providers: listProviders(), default: defaultProvider() });
}
