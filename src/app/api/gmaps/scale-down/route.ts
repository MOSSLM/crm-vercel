import { requireUser } from "@/app/api/_lib/auth";
import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { scaleDown } from "@/lib/aws/gmaps-ip";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const response = await proxyToGmaps("/scale-down", { method: "POST", forwardAuthFromReq: req });
  await scaleDown();
  return response;
}
