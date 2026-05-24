import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";

type Params = { jobId: string };

export const GET = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const search = new URL(req.url).search;
  return proxyToGmaps(`/results/${params.jobId}`, { search, forwardAuthFromReq: req });
});
