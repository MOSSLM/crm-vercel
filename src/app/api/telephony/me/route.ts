/**
 * The caller's telephony profile + self-service extension setup.
 *
 * GET  : whether telephony is configured, the caller's PBX extension/SIP login,
 *        and their click-to-call mode (drives the widget mount + dial routing).
 * POST : the caller sets THEIR OWN softphone (SIP login + call mode), linked to
 *        their user id — so the widget mounts for whoever is testing, without
 *        depending on an admin assigning an extension to them.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { telephonyMyExtensionSchema, type TelephonyMyExtensionPayload } from "@/app/api/_lib/schemas";
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

export const POST = withAuth<TelephonyMyExtensionPayload>(
  { body: telephonyMyExtensionSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const sip = body.sip.trim();
    const extension = (body.extension?.trim() || sip).slice(0, 32);

    const { data: existing } = await sc
      .from("phone_extensions")
      .select("id")
      .eq("agent_id", user.id)
      .limit(1)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      agent_id: user.id,
      extension,
      sip,
      active: true,
    };
    if (body.call_mode) patch.call_mode = body.call_mode;

    const { error } = existing?.id
      ? await sc.from("phone_extensions").update(patch).eq("id", existing.id)
      : await sc.from("phone_extensions").insert(patch);

    if (error) {
      // The most common failure is the unique (provider, extension) constraint:
      // another agent already owns this SIP/extension. Surface it instead of
      // reporting a phantom success — otherwise the widget never mints a key.
      const conflict = error.code === "23505";
      return jsonError(
        conflict ? "extension_taken" : "save_failed",
        conflict ? 409 : 500,
        {
          detail: conflict
            ? `Le login SIP « ${extension} » est déjà attribué à un autre agent. Utilise une extension PBX distincte (ex. 580453-100).`
            : error.message,
        },
        cors,
      );
    }

    return json({ ok: true, sip, extension }, { headers: cors });
  },
);
