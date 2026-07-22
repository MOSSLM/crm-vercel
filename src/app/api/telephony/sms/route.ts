/**
 * SMS — list threads/messages (role-scoped) and send an SMS.
 *
 * GET  : no record filter → the caller's thread inbox; with thread_id /
 *        contact_id / entreprise_id / counterpart → that thread's messages.
 * POST : send an SMS via the provider and record it in its thread.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import {
  parseQuery,
  telephonySmsQuerySchema,
  telephonySmsSendSchema,
  type TelephonySmsSendPayload,
} from "@/app/api/_lib/schemas";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";
import { recordOutboundSms } from "@/lib/telephony/sms";
import { isAdminUser } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ user, req, cors }) => {
  const url = new URL(req.url);
  const parsed = parseQuery(url, telephonySmsQuerySchema, cors);
  if (!parsed.ok) return parsed.response;
  const q = parsed.data;

  const sc = getServiceClient();
  const admin = await isAdminUser(sc, user.id);
  const canSee = (agentId: string | null) => admin || agentId === user.id || agentId === null;

  const isInbox = !q.thread_id && !q.contact_id && !q.entreprise_id && !q.counterpart;
  if (isInbox) {
    let tq = sc
      .from("sms_threads")
      .select(
        "id, counterpart_e164, contact_id, entreprise_id, agent_id, last_message_at, last_snippet, unread",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(q.limit);
    if (!admin) tq = tq.or(`agent_id.eq.${user.id},agent_id.is.null`);
    const { data, error } = await tq;
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ threads: data ?? [] }, { headers: cors });
  }

  // Resolve the target thread.
  type ThreadRow = { id: string; agent_id: string | null };
  let threadRow: ThreadRow | null = null;
  if (q.thread_id) {
    const { data } = await sc
      .from("sms_threads")
      .select("id, agent_id")
      .eq("id", q.thread_id)
      .maybeSingle();
    threadRow = (data as unknown as ThreadRow | null) ?? null;
  } else {
    let tq = sc.from("sms_threads").select("id, agent_id").order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    });
    if (q.counterpart) tq = tq.eq("counterpart_e164", q.counterpart);
    if (q.contact_id) tq = tq.eq("contact_id", q.contact_id);
    if (q.entreprise_id) tq = tq.eq("entreprise_id", q.entreprise_id);
    const { data } = await tq.limit(1).maybeSingle();
    threadRow = (data as unknown as ThreadRow | null) ?? null;
  }

  if (!threadRow || !canSee(threadRow.agent_id)) {
    return json({ thread_id: null, messages: [] }, { headers: cors });
  }

  const { data: messages, error } = await sc
    .from("sms_messages")
    .select("id, direction, from_e164, to_e164, body, status, sent_at")
    .eq("thread_id", threadRow.id)
    .order("sent_at", { ascending: true })
    .limit(q.limit);
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ thread_id: threadRow.id, messages: messages ?? [] }, { headers: cors });
});

export const POST = withAuth<TelephonySmsSendPayload>(
  { body: telephonySmsSendSchema },
  async ({ user, body, cors }) => {
    if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);

    const provider = getTelephonyProvider();
    if (!provider.supports("nativeSms")) {
      return jsonError("not_supported", 409, { detail: "Provider cannot send SMS." }, cors);
    }

    const sc = getServiceClient();
    let from = body.from;
    if (!from) {
      const { data: num } = await sc
        .from("phone_numbers")
        .select("e164")
        .eq("assigned_agent_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      from = (num?.e164 as string | undefined) ?? undefined;
    }
    if (!from) {
      return jsonError("no_sender_number", 409, {
        detail: "Assign a number to this agent, or pass 'from'.",
      }, cors);
    }

    let providerMessageId = "";
    try {
      const res = await provider.sendSms({ from, to: body.to, text: body.text });
      providerMessageId = res.providerMessageId;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "provider_error";
      return jsonError("sms_failed", 502, { detail }, cors);
    }

    const threadId = await recordOutboundSms(sc, {
      from,
      to: body.to,
      body: body.text,
      providerMessageId,
      agentId: user.id,
      contactId: body.contact_id ?? null,
      entrepriseId: body.entreprise_id ?? null,
      provider: provider.id,
    });

    return json({ ok: true, thread_id: threadId, providerMessageId }, { headers: cors });
  },
);
