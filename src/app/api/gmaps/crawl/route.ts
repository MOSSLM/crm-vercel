import { requireUser } from "@/app/api/_lib/auth";
import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.text();
  return proxyToGmaps("/crawl", { method: "POST", body, forwardAuthFromReq: req });
}
