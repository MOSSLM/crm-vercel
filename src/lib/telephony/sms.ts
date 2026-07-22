/**
 * SMS threading + persistence. Resolves a conversation thread per counterpart,
 * records inbound (webhook) and outbound (API) messages, and keeps the thread's
 * summary/unread state fresh. Provider send stays behind the abstraction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCustomer } from "./ingest";

export interface ThreadContext {
  counterpart: string;
  agentId?: string | null;
  contactId?: string | null;
  entrepriseId?: number | null;
  ourNumberId?: string | null;
  provider?: string;
}

/** Find an existing thread for a counterpart, or create one. */
export async function resolveOrCreateThread(
  sc: SupabaseClient,
  ctx: ThreadContext,
): Promise<string | null> {
  const provider = ctx.provider ?? "zadarma";

  const { data: existing } = await sc
    .from("sms_threads")
    .select("id")
    .eq("counterpart_e164", ctx.counterpart)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: inserted } = await sc
    .from("sms_threads")
    .insert({
      provider,
      counterpart_e164: ctx.counterpart,
      agent_id: ctx.agentId ?? null,
      contact_id: ctx.contactId ?? null,
      entreprise_id: ctx.entrepriseId ?? null,
      our_number_id: ctx.ourNumberId ?? null,
    })
    .select("id")
    .maybeSingle();
  return (inserted?.id as string | null) ?? null;
}

async function touchThread(sc: SupabaseClient, threadId: string, snippet: string, unread: boolean) {
  await sc
    .from("sms_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_snippet: snippet.slice(0, 140),
      unread,
    })
    .eq("id", threadId);
}

/** Persist an inbound SMS (from the provider webhook) into its thread. */
export async function ingestInboundSms(
  sc: SupabaseClient,
  msg: { from: string; to: string; body: string; providerMessageId?: string; provider?: string },
): Promise<string | null> {
  const match = await matchCustomer(sc, msg.from);
  const threadId = await resolveOrCreateThread(sc, {
    counterpart: msg.from,
    agentId: match.agentId,
    contactId: match.contactId,
    entrepriseId: match.entrepriseId,
    provider: msg.provider,
  });
  if (!threadId) return null;

  await sc.from("sms_messages").insert({
    thread_id: threadId,
    provider: msg.provider ?? "zadarma",
    provider_message_id: msg.providerMessageId ?? null,
    direction: "inbound",
    from_e164: msg.from,
    to_e164: msg.to,
    body: msg.body,
    status: "received",
    agent_id: match.agentId,
  });
  await touchThread(sc, threadId, msg.body, true);
  return threadId;
}

/** Persist an outbound SMS (after the provider accepted it) into its thread. */
export async function recordOutboundSms(
  sc: SupabaseClient,
  msg: {
    from: string;
    to: string;
    body: string;
    providerMessageId?: string;
    agentId: string;
    contactId?: string | null;
    entrepriseId?: number | null;
    provider?: string;
  },
): Promise<string | null> {
  const threadId = await resolveOrCreateThread(sc, {
    counterpart: msg.to,
    agentId: msg.agentId,
    contactId: msg.contactId,
    entrepriseId: msg.entrepriseId,
    provider: msg.provider,
  });
  if (!threadId) return null;

  await sc.from("sms_messages").insert({
    thread_id: threadId,
    provider: msg.provider ?? "zadarma",
    provider_message_id: msg.providerMessageId ?? null,
    direction: "outbound",
    from_e164: msg.from,
    to_e164: msg.to,
    body: msg.body,
    status: "sent",
    agent_id: msg.agentId,
  });
  await touchThread(sc, threadId, msg.body, false);
  return threadId;
}
