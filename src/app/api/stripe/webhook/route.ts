import Stripe from "stripe";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "@/env";
import { getStripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

type ServiceClient = ReturnType<typeof getServiceClient>;

export const runtime = "nodejs";
// Stripe verifies the raw bytes — disable Next's parsing.
export const dynamic = "force-dynamic";

const toIso = (epoch: number | null | undefined): string | null =>
  typeof epoch === "number" ? new Date(epoch * 1000).toISOString() : null;

type SubscriptionUpsert = {
  stripe_subscription_id: string;
  status: string;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

const buildUpsert = (sub: Stripe.Subscription): SubscriptionUpsert => ({
  stripe_subscription_id: sub.id,
  status: sub.status,
  stripe_price_id: sub.items.data[0]?.price.id ?? null,
  current_period_start: toIso(sub.items.data[0]?.current_period_start),
  current_period_end: toIso(sub.items.data[0]?.current_period_end),
  cancel_at_period_end: sub.cancel_at_period_end ?? false,
  canceled_at: toIso(sub.canceled_at),
});

/**
 * Anonymous demo-site purchase: create/find the client account after payment,
 * link it to the company + Stripe customer, record the subscription, and (for a
 * new user) trigger the invite email so they can log in and fill the onboarding
 * form. Idempotent-ish: re-running finds the existing profile and re-inserts a
 * subscription row keyed to the checkout session.
 */
async function provisionDemoPurchase(
  supabase: ServiceClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  if (!email) {
    console.error("[stripe webhook] demo_purchase without email", session.id);
    return;
  }
  const siteId = session.metadata?.site_id || null;
  const offreId = session.metadata?.offre_id || null;
  const enterpriseIdRaw = session.metadata?.enterprise_id;
  const enterpriseId = enterpriseIdRaw ? Number(enterpriseIdRaw) : null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  // 1) Create (or find) the client auth user. inviteUserByEmail also sends the
  //    account-setup email; handle_new_user provisions the `client` profile.
  let userId: string | null = null;
  const redirectTo = `${getAppUrl()}/auth/callback?next=/espace-client/onboarding`;
  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { source: "demo_purchase", site_id: siteId },
  });
  if (invited?.user) {
    userId = invited.user.id;
  } else {
    // Already registered (or invites disabled) — link the existing profile.
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    userId = (prof as { id?: string } | null)?.id ?? null;
    if (!userId) {
      console.error("[stripe webhook] demo_purchase: could not resolve user", {
        email,
        inviteErr: inviteErr?.message,
      });
      return;
    }
  }

  // 2) Link the profile to the company + Stripe customer.
  const profilePatch: Record<string, unknown> = {};
  if (enterpriseId != null && !Number.isNaN(enterpriseId)) profilePatch.entreprise_id = enterpriseId;
  if (customerId) profilePatch.stripe_customer_id = customerId;
  if (Object.keys(profilePatch).length > 0) {
    await supabase.from("user_profiles").update(profilePatch).eq("id", userId);
  }

  // 3) Record the purchase/subscription.
  if (offreId) {
    const row: Record<string, unknown> = {
      client_id: userId,
      offre_id: offreId,
      status: "active",
      updated_at: new Date().toISOString(),
      metadata: { site_id: siteId, checkout_session_id: session.id },
    };
    if (session.mode === "subscription") {
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        Object.assign(row, buildUpsert(sub));
      }
    } else {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      row.metadata = { ...(row.metadata as object), payment_intent_id: paymentIntentId };
    }
    await supabase.from("client_subscriptions").insert(row);
  }

  // 4) The demo has been sold — take it off the market (hide the paywall bar).
  if (siteId) {
    await supabase.from("sites").update({ paywall_enabled: false }).eq("id", siteId);
  }
}

export async function POST(req: Request) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return jsonError("stripe_not_configured", 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return jsonError("missing_signature", 400);

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_signature";
    return jsonError("signature_verification_failed", 400, { detail: message });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Anonymous demo-site purchase — provision the client account post-payment.
        if (session.metadata?.kind === "demo_purchase") {
          await provisionDemoPurchase(supabase, stripe, session);
          break;
        }

        const clientId = session.metadata?.client_id;
        const offreId = session.metadata?.offre_id;
        if (!clientId || !offreId) break;

        // Find the pending row we pre-inserted at /api/stripe/checkout.
        const { data: existing } = await supabase
          .from("client_subscriptions")
          .select("id")
          .eq("client_id", clientId)
          .eq("offre_id", offreId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session.mode === "subscription") {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          if (!subscriptionId) break;

          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const upsert = buildUpsert(sub);
          if (existing) {
            await supabase
              .from("client_subscriptions")
              .update({ ...upsert, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
          } else {
            await supabase.from("client_subscriptions").insert({
              client_id: clientId,
              offre_id: offreId,
              ...upsert,
            });
          }
        } else if (session.mode === "payment") {
          // One-shot purchase — no Stripe Subscription object; mark the
          // pending row as active and stash the payment intent for refs.
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          const patch = {
            status: "active",
            updated_at: new Date().toISOString(),
            metadata: { payment_intent_id: paymentIntentId, checkout_session_id: session.id },
          };
          if (existing) {
            await supabase.from("client_subscriptions").update(patch).eq("id", existing.id);
          } else {
            await supabase.from("client_subscriptions").insert({
              client_id: clientId,
              offre_id: offreId,
              ...patch,
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const upsert = buildUpsert(sub);
        await supabase
          .from("client_subscriptions")
          .update({ ...upsert, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase
          .from("client_subscriptions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        type InvoiceWithSubscription = Stripe.Invoice & { subscription: string | Stripe.Subscription | null };
        const inv = invoice as InvoiceWithSubscription;
        const subscriptionId =
          typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        if (!subscriptionId) break;
        await supabase
          .from("client_subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscriptionId);
        break;
      }

      default:
        // Ignore other events — Stripe will retry on non-2xx, so we still 200.
        break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[stripe webhook] handler error:", message);
    // Return 500 so Stripe retries.
    return jsonError("webhook_handler_failed", 500, { detail: message });
  }

  return json({ received: true });
}
