import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";
import { scaleDown } from "@/lib/aws/gmaps-ip";

export const runtime = "nodejs";

export const POST = withAuth({}, async ({ req }) => {
  const response = await proxyToGmaps("/scale-down", { method: "POST", forwardAuthFromReq: req });
  await scaleDown();
  return response;
});
