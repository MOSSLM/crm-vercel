import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/env";

let cached: Stripe | null = null;

/**
 * Returns a singleton Stripe client. Throws if `STRIPE_SECRET_KEY` is unset —
 * callers should check `STRIPE_SECRET_KEY` first and return 503 if missing,
 * mirroring how `/api/email/send` handles `RESEND_API_KEY`.
 */
export const getStripe = (): Stripe => {
  if (cached) return cached;
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY non configuré");
  }
  cached = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
};
