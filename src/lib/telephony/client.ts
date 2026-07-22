/**
 * Browser-side telephony helpers. Thin wrappers over the /api/telephony/* routes
 * using `authedFetch` (attaches the Supabase session token). Imported only by
 * client components.
 */

import { authedFetch } from "@/utils/authedFetch";

export type CallDirection = "inbound" | "outbound" | "internal";

export interface CallRow {
  id: string;
  provider_call_id: string;
  direction: CallDirection;
  disposition: string | null;
  from_e164: string | null;
  to_e164: string | null;
  extension: string | null;
  agent_id: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  ring_sec: number | null;
  recording_status: "none" | "pending" | "stored" | "failed";
  transcript_status: string;
  evaluation_status: string;
  created_at: string;
  entreprise?: { id: number; name: string | null } | null;
  contact?: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface CallFilters {
  contact_id?: string;
  entreprise_id?: number;
  opportunite_id?: string;
  direction?: CallDirection;
  agent_id?: string;
  limit?: number;
}

export async function fetchCalls(filters: CallFilters = {}): Promise<CallRow[]> {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null) qs.set(k, String(v));
  });
  const res = await authedFetch(`/api/telephony/calls?${qs.toString()}`);
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json.calls ?? []) : [];
}

export interface CallbackPayload {
  to: string;
  from?: string;
  contact_id?: string | null;
  entreprise_id?: number | null;
  opportunite_id?: string | null;
}

export interface CallbackResult {
  ok: boolean;
  error?: string;
  providerCallId?: string;
}

export async function placeCallback(payload: CallbackPayload): Promise<CallbackResult> {
  const res = await authedFetch(`/api/telephony/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json.detail ?? json.error ?? `HTTP ${res.status}` };
  return { ok: true, providerCallId: json.providerCallId };
}

/** Resolve a short-lived playback URL for a call recording, or null. */
export async function fetchRecordingUrl(callId: string): Promise<string | null> {
  const res = await authedFetch(`/api/telephony/recordings/${callId}`);
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json.url ?? null) : null;
}
