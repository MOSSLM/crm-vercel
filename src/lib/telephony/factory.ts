/**
 * Telephony provider factory.
 *
 * Lazy singleton, selected by env — mirrors `getStripe()` / `getServiceClient()`.
 * Callers should check the relevant env key first and return 503 when the
 * provider is unconfigured, exactly like the Stripe/Resend routes do.
 *
 * To add a provider: implement the adapter under `providers/<name>/`, add its
 * keys to `src/env.ts`, and add a branch here. Nothing else changes.
 */

import { TELEPHONY_PROVIDER, ZADARMA_KEY, ZADARMA_SECRET, ZADARMA_WEBHOOK_SECRET } from "@/env";
import type { TelephonyProvider } from "./core/provider";
import { ZadarmaAdapter } from "./providers/zadarma/adapter";

let cached: TelephonyProvider | null = null;

/** True when the configured provider has the credentials it needs. */
export function isTelephonyConfigured(): boolean {
  const id = TELEPHONY_PROVIDER ?? "zadarma";
  if (id === "zadarma") return Boolean(ZADARMA_KEY && ZADARMA_SECRET);
  return false;
}

/**
 * Returns the configured telephony provider singleton. Throws if unconfigured —
 * routes should guard with `isTelephonyConfigured()` and 503 first.
 */
export function getTelephonyProvider(): TelephonyProvider {
  if (cached) return cached;

  const id = TELEPHONY_PROVIDER ?? "zadarma";
  if (id === "zadarma") {
    if (!ZADARMA_KEY || !ZADARMA_SECRET) {
      throw new Error("zadarma_not_configured");
    }
    cached = new ZadarmaAdapter({
      key: ZADARMA_KEY,
      secret: ZADARMA_SECRET,
      webhookSecret: ZADARMA_WEBHOOK_SECRET,
    });
    return cached;
  }

  throw new Error(`telephony_provider_unsupported:${id}`);
}

/** Test-only: reset the memoised provider. */
export function __resetTelephonyProvider(): void {
  cached = null;
}
