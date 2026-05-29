import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Ensures the authenticated user has a `user_profiles` row. New accounts
 * default to role='client'. This replaces reliance on the `auth.users`
 * trigger, which cannot be attached via MCP migrations (insufficient privilege
 * on the `auth` schema). ON CONFLICT DO NOTHING never downgrades an existing
 * admin/freelance.
 */
export const POST = withAuth({}, async ({ user, cors }) => {
  const supabase = getServiceClient();

  // ON CONFLICT DO NOTHING — never downgrades an existing admin/freelance row.
  await supabase
    .from("user_profiles")
    .upsert(
      { id: user.id, email: user.email ?? null, role: "client", actif: true },
      { onConflict: "id", ignoreDuplicates: true },
    );

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return jsonError("profile_unavailable", 500, {}, cors);
  }

  return json({ role: data.role, onboarded_at: data.onboarded_at }, { headers: cors });
});
