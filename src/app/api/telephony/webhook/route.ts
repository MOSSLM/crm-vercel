/**
 * Telephony provider webhook receiver.
 *
 * Provider-agnostic: it delegates verification + normalisation to whichever
 * adapter is configured, then ingests the resulting `CallEvent`. Mirrors the
 * Stripe webhook (`src/app/api/stripe/webhook/route.ts`): reads the raw body,
 * verifies the signature, writes via the service client, and returns 500 on
 * handler failure so the provider retries.
 *
 * Public route (no `withAuth`) — authenticity comes from the provider's HMAC
 * signature, checked by `provider.verifyWebhook`.
 *
 * GET is the save-time handshake: some providers (Zadarma) validate the URL by
 * GETting it with an echo token we must return verbatim.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";
import { ingestCallEvent } from "@/lib/telephony/ingest";
import type { WebhookRequest } from "@/lib/telephony/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toWebhookRequest(req: Request, rawBody: string): WebhookRequest {
  return {
    headers: req.headers,
    rawBody,
    query: new URL(req.url).searchParams,
  };
}

/** Save-time URL validation handshake (echo the token as plain text). */
export async function GET(req: Request) {
  if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503);
  const provider = getTelephonyProvider();
  const wreq = toWebhookRequest(req, "");
  const echo = provider.webhookChallengeResponse(wreq);
  if (echo !== null) {
    return new Response(echo, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return json({ ok: true });
}

export async function POST(req: Request) {
  if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503);

  const rawBody = await req.text();
  const provider = getTelephonyProvider();
  const wreq = toWebhookRequest(req, rawBody);

  // A save-time handshake can also arrive as a POST with an echo token.
  const echo = provider.webhookChallengeResponse(wreq);
  if (echo !== null) {
    return new Response(echo, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const verified = await provider.verifyWebhook(wreq);
  if (!verified) return jsonError("invalid_signature", 401);

  const event = provider.normalizeWebhookEvent(rawBody);
  if (!event) return json({ received: true, ignored: true });

  try {
    const sc = getServiceClient();
    const result = await ingestCallEvent(sc, event, provider.id);
    return json({ received: true, callId: result.callId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[telephony webhook] handler error:", message);
    // 500 so the provider retries delivery.
    return jsonError("webhook_handler_failed", 500, { detail: message });
  }
}
