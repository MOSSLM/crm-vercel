/**
 * Import/refresh the account's numbers from the provider into `phone_numbers`.
 * Admin-only. Everything else about numbers (labels, agent assignment, status)
 * is edited directly against the table under the admin RLS policy.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";

export const runtime = "nodejs";

export const POST = withAuth({ role: "admin" }, async ({ cors }) => {
  if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);

  const provider = getTelephonyProvider();
  if (!provider.supports("listNumbers")) {
    return jsonError("not_supported", 409, { detail: "Provider cannot list numbers." }, cors);
  }

  let numbers;
  try {
    numbers = await provider.listNumbers();
  } catch (e) {
    const detail = e instanceof Error ? e.message : "provider_error";
    return jsonError("sync_failed", 502, { detail }, cors);
  }

  const sc = getServiceClient();
  const rows = numbers
    .filter((n) => n.e164)
    .map((n) => ({
      provider: provider.id,
      e164: n.e164,
      provider_number_id: n.providerNumberId ?? null,
      country: n.country ?? null,
      number_type: n.type ?? "unknown",
      status: n.status ?? "active",
      capabilities: n.capabilities ?? {},
    }));

  if (rows.length > 0) {
    // Insert new numbers; leave existing ones (and their agent assignment) intact.
    await sc.from("phone_numbers").upsert(rows, {
      onConflict: "provider,e164",
      ignoreDuplicates: true,
    });
  }

  return json({ ok: true, synced: rows.length }, { headers: cors });
});
