/**
 * Intégration Google Calendar — OAuth 2.0 + FreeBusy + création d'évènements
 * (avec lien Google Meet), en REST pur (pas de SDK).
 *
 * Optionnelle, même pattern que Stripe/Zadarma : sans
 * GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET les routes
 * répondent 503 et le module scheduling fonctionne sans busy externe.
 *
 * Les tokens vivent dans scheduling_calendar_connections, table SANS policy
 * RLS : accès service-role uniquement.
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/app-url";
import type { BusyInterval } from "./types";

export interface GoogleConnection {
  id: string;
  user_id: string;
  provider: string;
  account_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  write_calendar_id: string;
  busy_calendar_ids: string[];
  sync_enabled: boolean;
}

export const googleEnv = () => {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
};

export const googleRedirectUri = (): string =>
  `${getAppUrl()}/api/scheduling/google/callback`;

// ---------------------------------------------------------------------------
// State OAuth signé (pas de session serveur : HMAC avec la clé service-role)
// ---------------------------------------------------------------------------

const stateSecret = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const env = require("@/env") as { SUPABASE_SERVICE_ROLE_KEY: string };
  return env.SUPABASE_SERVICE_ROLE_KEY;
};

export const signOauthState = (userId: string): string => {
  const expires = Date.now() + 10 * 60 * 1000; // 10 min
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

export const verifyOauthState = (state: string): string | null => {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, sig] = parts;
  const expected = createHmac("sha256", stateSecret())
    .update(`${userId}.${expiresStr}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expiresStr) < Date.now()) return null;
  return userId;
};

export const googleAuthUrl = (userId: string): string | null => {
  const env = googleEnv();
  if (!env) return null;
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope:
      "openid email https://www.googleapis.com/auth/calendar.events " +
      "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state: signOauthState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse | null> {
  const env = googleEnv();
  if (!env) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    console.error("[google-calendar] token exchange failed:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as TokenResponse;
}

/** Email du compte Google, extrait de l'id_token (payload JWT, non vérifié —
 * il vient en direct de l'endpoint token de Google via TLS). */
export const emailFromIdToken = (idToken: string | undefined): string | null => {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
};

/** Access token valide (rafraîchi si expiré) ; null si la connexion est morte. */
export async function ensureAccessToken(
  sc: SupabaseClient,
  conn: GoogleConnection,
): Promise<string | null> {
  const env = googleEnv();
  if (!env) return null;
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (conn.access_token && expiresAt > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    await sc
      .from("scheduling_calendar_connections")
      .update({ last_error: `refresh ${res.status}: ${text.slice(0, 300)}` })
      .eq("id", conn.id);
    return null;
  }
  const data = (await res.json()) as TokenResponse;
  const tokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await sc
    .from("scheduling_calendar_connections")
    .update({ access_token: data.access_token, token_expires_at: tokenExpiresAt, last_error: null })
    .eq("id", conn.id);
  conn.access_token = data.access_token;
  conn.token_expires_at = tokenExpiresAt;
  return data.access_token;
}

// ---------------------------------------------------------------------------
// FreeBusy + évènements
// ---------------------------------------------------------------------------

/** Intervalles occupés de tous les agendas « busy » de la connexion. */
export async function getGoogleBusy(
  sc: SupabaseClient,
  conn: GoogleConnection,
  fromUtc: Date,
  toUtc: Date,
): Promise<BusyInterval[]> {
  const token = await ensureAccessToken(sc, conn);
  if (!token) return [];
  const calendarIds = conn.busy_calendar_ids?.length ? conn.busy_calendar_ids : ["primary"];
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: fromUtc.toISOString(),
      timeMax: toUtc.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    await sc
      .from("scheduling_calendar_connections")
      .update({ last_error: `freebusy ${res.status}: ${text.slice(0, 300)}` })
      .eq("id", conn.id);
    return [];
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };
  const intervals: BusyInterval[] = [];
  for (const cal of Object.values(data.calendars ?? {})) {
    for (const b of cal.busy ?? []) {
      const start = Date.parse(b.start);
      const end = Date.parse(b.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        intervals.push({ start, end });
      }
    }
  }
  return intervals;
}

export interface GoogleEventInput {
  summary: string;
  description: string;
  startUtc: Date;
  endUtc: Date;
  attendees: { email: string; displayName?: string }[];
  withMeet: boolean;
  location?: string;
}

/** Crée l'évènement dans l'agenda cible ; renvoie {id, meetUrl}. */
export async function insertGoogleEvent(
  sc: SupabaseClient,
  conn: GoogleConnection,
  input: GoogleEventInput,
): Promise<{ id: string; meetUrl: string | null } | null> {
  const token = await ensureAccessToken(sc, conn);
  if (!token) return null;
  const calendarId = encodeURIComponent(conn.write_calendar_id || "primary");
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startUtc.toISOString(), timeZone: "UTC" },
    end: { dateTime: input.endUtc.toISOString(), timeZone: "UTC" },
    attendees: input.attendees,
    location: input.location,
    reminders: { useDefault: true },
  };
  if (input.withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
      `?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    await sc
      .from("scheduling_calendar_connections")
      .update({ last_error: `insert ${res.status}: ${text.slice(0, 300)}` })
      .eq("id", conn.id);
    return null;
  }
  const data = (await res.json()) as {
    id: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meetUrl =
    data.hangoutLink ??
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return { id: data.id, meetUrl };
}

/** Supprime l'évènement Google (annulation / reprogrammation). Best-effort. */
export async function deleteGoogleEvent(
  sc: SupabaseClient,
  conn: GoogleConnection,
  eventId: string,
): Promise<void> {
  const token = await ensureAccessToken(sc, conn);
  if (!token) return;
  const calendarId = encodeURIComponent(conn.write_calendar_id || "primary");
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(
      eventId,
    )}?sendUpdates=none`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => {});
}

/** Connexion Google active d'un hôte (ou null). */
export async function getGoogleConnection(
  sc: SupabaseClient,
  userId: string,
): Promise<GoogleConnection | null> {
  const { data } = await sc
    .from("scheduling_calendar_connections")
    .select(
      "id, user_id, provider, account_email, access_token, refresh_token, token_expires_at, write_calendar_id, busy_calendar_ids, sync_enabled",
    )
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("sync_enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GoogleConnection | null) ?? null;
}
