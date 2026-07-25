import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAppUrl } from "@/lib/app-url";
import {
  emailFromIdToken,
  exchangeCodeForTokens,
  verifyOauthState,
} from "@/lib/scheduling/google-calendar";

export const runtime = "nodejs";

/**
 * Callback OAuth Google (redirection navigateur, pas de bearer token) :
 * l'identité est portée par le state HMAC signé au départ du flow.
 * Termine toujours par une redirection vers les réglages rendez-vous.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const settingsUrl = `${getAppUrl()}/rendez-vous/parametres`;
  const redirect = (params: string) =>
    Response.redirect(`${settingsUrl}?${params}`, 302);

  const errorParam = url.searchParams.get("error");
  if (errorParam) return redirect(`google=refused`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirect(`google=invalid`);

  const userId = verifyOauthState(state);
  if (!userId) return redirect(`google=expired`);

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) return redirect(`google=exchange_failed`);

  const accountEmail = emailFromIdToken(tokens.id_token);
  const sc = getServiceClient();

  // Sans email de compte, l'upsert ne peut pas matcher (NULL ≠ NULL en SQL) :
  // on purge les connexions Google existantes pour éviter les doublons.
  if (!accountEmail) {
    await sc
      .from("scheduling_calendar_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "google");
  }

  const { error } = await sc.from("scheduling_calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google",
      account_email: accountEmail,
      access_token: tokens.access_token,
      // Google ne renvoie le refresh_token qu'au premier consentement
      // (prompt=consent le force) — ne pas écraser par null si absent.
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      sync_enabled: true,
      last_error: null,
    },
    { onConflict: "user_id,provider,account_email" },
  );
  if (error) {
    console.error("[scheduling/google] upsert error:", error);
    return redirect(`google=save_failed`);
  }

  return redirect(`google=connected`);
}
