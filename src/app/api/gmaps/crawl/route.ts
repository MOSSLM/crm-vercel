import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";

export const POST = withAuth({}, async ({ req }) => {
  const body = await req.text();
  return proxyToGmaps("/crawl", { method: "POST", body, forwardAuthFromReq: req });
});
