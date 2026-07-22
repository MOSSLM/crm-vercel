/**
 * The caller's telephony profile: whether telephony is configured, their PBX
 * extension/SIP login (for the browser softphone), and their preferred
 * click-to-call mode. Drives the widget mount + dial routing in CallProvider.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { isTelephonyConfigured } from "@/lib/telephony/factory";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();

  const { data } = await sc
    .from("phone_extensions")
    .select("extension, sip, call_mode")
    .eq("agent_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const extension = (data?.extension as string | null) ?? null;
  const sip = (data?.sip as string | null) ?? extension;

  return json(
    {
      configured: isTelephonyConfigured(),
      hasExtension: Boolean(extension),
      extension,
      sip,
      call_mode: (data?.call_mode as string | null) ?? "browser",
    },
    { headers: cors },
  );
});
