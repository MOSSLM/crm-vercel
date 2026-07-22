/**
 * Call-event ingestion: turn a normalised `CallEvent` into rows in `calls`
 * (and `call_recordings`), matching the far-end number to a CRM contact/company
 * and routing to the responsible agent.
 *
 * Kept separate from the webhook route so it can be unit-tested with a mocked
 * Supabase client. Idempotent per (provider, provider_call_id): re-delivered
 * events update the same row and never clobber an earlier caller match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallEvent } from "./core/types";
import { phoneSuffix, phonesMatch } from "./phone";
import { advanceToContacted } from "@/app/api/agent/_lib";

export interface IngestResult {
  callId: string | null;
  created: boolean;
}

interface CustomerMatch {
  contactId: string | null;
  entrepriseId: number | null;
  agentId: string | null;
  opportuniteId: string | null;
}

/** Fuzzy-match the far-end number to a contact → company → owning agent. */
async function matchCustomer(sc: SupabaseClient, customerNumber: string): Promise<CustomerMatch> {
  const empty: CustomerMatch = {
    contactId: null,
    entrepriseId: null,
    agentId: null,
    opportuniteId: null,
  };
  const suffix = phoneSuffix(customerNumber);
  if (suffix.length < 6) return empty;

  let contactId: string | null = null;
  let entrepriseId: number | null = null;

  const { data: contacts } = await sc
    .from("contacts")
    .select("id, entreprise_id, tel")
    .ilike("tel", `%${suffix}%`)
    .limit(5);
  const contact = (contacts ?? []).find((c) => phonesMatch(c.tel, customerNumber));
  if (contact) {
    contactId = contact.id as string;
    entrepriseId = (contact.entreprise_id as number | null) ?? null;
  }

  let agentId: string | null = null;
  if (!entrepriseId) {
    const { data: ents } = await sc
      .from("entreprises")
      .select("id, telephone, owner_id")
      .ilike("telephone", `%${suffix}%`)
      .limit(5);
    const ent = (ents ?? []).find((e) => phonesMatch(e.telephone, customerNumber));
    if (ent) {
      entrepriseId = ent.id as number;
      agentId = (ent.owner_id as string | null) ?? null;
    }
  } else {
    const { data: ent } = await sc
      .from("entreprises")
      .select("owner_id")
      .eq("id", entrepriseId)
      .maybeSingle();
    agentId = (ent?.owner_id as string | null) ?? null;
  }

  // Sticky routing: a candidate open opportunity for this company + agent.
  let opportuniteId: string | null = null;
  if (entrepriseId) {
    const { data: opps } = await sc
      .from("opportunites")
      .select("id, owner_id, created_at")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false })
      .limit(1);
    const opp = opps?.[0];
    if (opp) {
      opportuniteId = opp.id as string;
      if (!agentId) agentId = (opp.owner_id as string | null) ?? null;
    }
  }

  return { contactId, entrepriseId, agentId, opportuniteId };
}

/** Look up our own number → assigned agent + phone_numbers.id, as a routing fallback. */
async function matchOwnNumber(
  sc: SupabaseClient,
  ourNumber: string,
): Promise<{ numberId: string | null; agentId: string | null }> {
  const suffix = phoneSuffix(ourNumber);
  if (suffix.length < 6) return { numberId: null, agentId: null };
  const { data } = await sc
    .from("phone_numbers")
    .select("id, e164, assigned_agent_id")
    .ilike("e164", `%${suffix}%`)
    .limit(5);
  const n = (data ?? []).find((row) => phonesMatch(row.e164, ourNumber));
  return {
    numberId: (n?.id as string | null) ?? null,
    agentId: (n?.assigned_agent_id as string | null) ?? null,
  };
}

export async function ingestCallEvent(
  sc: SupabaseClient,
  event: CallEvent,
  provider = "zadarma",
): Promise<IngestResult> {
  if (!event.providerCallId) return { callId: null, created: false };

  const isOutbound = event.direction === "outbound";
  const customerNumber = isOutbound ? event.to : event.from;
  const ourNumber = isOutbound ? event.from : event.to;

  const { data: existing } = await sc
    .from("calls")
    .select("id, agent_id, contact_id, entreprise_id, opportunite_id")
    .eq("provider", provider)
    .eq("provider_call_id", event.providerCallId)
    .maybeSingle();

  // Fields every event may refresh.
  const patch: Record<string, unknown> = { raw: event.raw };
  if (event.disposition) patch.disposition = event.disposition;
  if (event.durationSec != null) patch.duration_sec = event.durationSec;
  if (event.extension) patch.extension = event.extension;
  if (event.startedAt && event.type === "ringing") patch.started_at = event.startedAt;
  if (event.answeredAt) patch.answered_at = event.answeredAt;
  if (event.endedAt) patch.ended_at = event.endedAt;
  if (event.recordingProviderId) {
    patch.recording_provider_id = event.recordingProviderId;
    patch.recording_status = "pending";
  }

  let callId: string | null = existing?.id ?? null;
  let created = false;

  if (existing) {
    await sc.from("calls").update(patch).eq("id", existing.id);
  } else {
    // First time we see this call — resolve routing + CRM links.
    const [customer, own] = await Promise.all([
      matchCustomer(sc, customerNumber),
      matchOwnNumber(sc, ourNumber),
    ]);
    const insertRow: Record<string, unknown> = {
      provider,
      provider_call_id: event.providerCallId,
      direction: event.direction,
      from_e164: event.from || null,
      to_e164: event.to || null,
      contact_id: customer.contactId,
      entreprise_id: customer.entrepriseId,
      opportunite_id: customer.opportuniteId,
      agent_id: customer.agentId ?? own.agentId,
      number_id: own.numberId,
      ...patch,
    };
    const { data: inserted } = await sc
      .from("calls")
      .insert(insertRow)
      .select("id")
      .maybeSingle();
    callId = (inserted?.id as string | null) ?? null;
    created = true;
  }

  // Recording bookkeeping — create a pending row to be pulled by the cron.
  if (callId && event.recordingProviderId) {
    const { data: rec } = await sc
      .from("call_recordings")
      .select("id")
      .eq("call_id", callId)
      .eq("provider_record_id", event.recordingProviderId)
      .maybeSingle();
    if (!rec) {
      await sc.from("call_recordings").insert({
        call_id: callId,
        provider_record_id: event.recordingProviderId,
      });
    }
  }

  // Cold-call completion → advance the deal, mirroring the existing task flow.
  if (
    callId &&
    isOutbound &&
    event.type === "ended" &&
    event.disposition === "answered"
  ) {
    const oppId =
      (existing?.opportunite_id as string | null) ??
      (await sc.from("calls").select("opportunite_id").eq("id", callId).maybeSingle()).data
        ?.opportunite_id ??
      null;
    if (oppId) {
      try {
        await advanceToContacted(sc, oppId as string);
      } catch {
        // best-effort — never fail ingestion on a stage-advance hiccup.
      }
    }
  }

  return { callId, created };
}
