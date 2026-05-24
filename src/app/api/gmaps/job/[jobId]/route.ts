import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";

type Params = { jobId: string };

export const GET = withAuth<undefined, Params>({}, async ({ req, params }) => {
  return proxyToGmaps(`/job/${params.jobId}`, { forwardAuthFromReq: req });
});
