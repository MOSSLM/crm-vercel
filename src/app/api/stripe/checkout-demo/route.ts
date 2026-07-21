import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { parseJson, stripeCheckoutDemoSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { STRIPE_SECRET_KEY } from "@/env";
import { getStripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * PUBLIC checkout for a demo-site purchase. Unlike /api/stripe/checkout this is
 * NOT authenticated: an anonymous prospect viewing a demo site (whose paywall is
 * enabled) clicks "Acheter". Stripe collects the email; the account is created
 * AFTER payment by the webhook (see src/app/api/stripe/webhook), which then emails
 * a login link. Charges the `site_demo_cle_en_main` offer: a one-time setup fee
 * plus the recurring hosting subscription (price ids stored on the offer metadata).
 */
export const POST = async (req: Request) => {
  if (!STRIPE_SECRET_KEY) return jsonError("STRIPE_SECRET_KEY non configuré", 503);

  const parsed = await parseJson(req, stripeCheckoutDemoSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getServiceClient();

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, enterprise_id, paywall_enabled, published_subdomain")
    .eq("id", parsed.data.site_id)
    .maybeSingle();
  if (siteErr || !site) return jsonError("site_not_found", 404);
  if (!site.paywall_enabled) return jsonError("paywall_disabled", 403);

  const { data: offre, error: offerErr } = await supabase
    .from("offres")
    .select("id, nom, actif, prix_ht, metadata")
    .eq("code", "site_demo_cle_en_main")
    .maybeSingle();
  if (offerErr || !offre) return jsonError("offer_not_found", 404);
  if (!offre.actif) return jsonError("offer_inactive", 400);

  const meta = (offre.metadata ?? {}) as Record<string, unknown>;
  const hostingPriceId =
    typeof meta.stripe_hosting_price_id === "string" ? meta.stripe_hosting_price_id : null;
  const setupPriceId =
    typeof meta.stripe_setup_price_id === "string" ? meta.stripe_setup_price_id : null;

  if (!hostingPriceId && !setupPriceId) {
    return jsonError("offer_missing_stripe_price", 400);
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();
  const origin = req.headers.get("origin");
  const cancelUrl =
    origin ??
    (site.published_subdomain
      ? `https://${site.published_subdomain}.${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "samadigitalstudio.fr"}`
      : appUrl);

  const commonMetadata = {
    kind: "demo_purchase",
    site_id: String(site.id),
    enterprise_id: site.enterprise_id != null ? String(site.enterprise_id) : "",
    offre_id: String(offre.id),
    offre_code: "site_demo_cle_en_main",
  };

  try {
    const lineItems: NonNullable<
      import("stripe").Stripe.Checkout.SessionCreateParams["line_items"]
    > = [];
    let mode: "subscription" | "payment";

    if (hostingPriceId) {
      // Subscription mode: recurring hosting + (optional) one-time setup added to
      // the first invoice. Stripe allows mixing one-time prices here.
      mode = "subscription";
      lineItems.push({ price: hostingPriceId, quantity: 1 });
      if (setupPriceId) lineItems.push({ price: setupPriceId, quantity: 1 });
    } else {
      mode = "payment";
      lineItems.push({ price: setupPriceId as string, quantity: 1 });
    }

    const sessionParams: import("stripe").Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: lineItems,
      success_url: `${appUrl}/bienvenue?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: commonMetadata,
    };
    if (mode === "subscription") {
      sessionParams.subscription_data = { metadata: commonMetadata };
    } else {
      sessionParams.payment_intent_data = { metadata: commonMetadata };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session.url) return jsonError("checkout_no_url", 500);
    return json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : undefined;
    console.error("[stripe/checkout-demo] failure:", { message, code, site_id: site.id });
    return jsonError("stripe_error", 502, { message, code });
  }
};
