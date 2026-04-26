import { requireUser } from "@/app/api/_lib/auth";
import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  return proxyToGmaps(`/job/${params.jobId}`, { forwardAuthFromReq: req });
}
