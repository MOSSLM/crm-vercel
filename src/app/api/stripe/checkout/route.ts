import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { stripeCheckoutSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STRIPE_SECRET_KEY } from "@/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const POST = withAuth(
  { body: stripeCheckoutSchema },
  async ({ body, user, req, cors }) => {
    if (!STRIPE_SECRET_KEY) return jsonError("STRIPE_SECRET_KEY non configuré", 503, {}, cors);
    if (!body) return jsonError("missing_body", 400, {}, cors);

    const supabase = getServiceClient();

    // Charger l'offre + son stripe_price_id
    const { data: offre, error: offerErr } = await supabase
      .from("offres")
      .select("id, nom, stripe_price_id, actif")
      .eq("id", body.offre_id)
      .maybeSingle();

    if (offerErr || !offre) return jsonError("offer_not_found", 404, {}, cors);
    if (!offre.actif) return jsonError("offer_inactive", 400, {}, cors);
    if (!offre.stripe_price_id) {
      return jsonError("offer_missing_stripe_price", 400, {}, cors);
    }

    // Charger le profil pour récupérer/créer le Stripe customer
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr || !profile) return jsonError("profile_not_found", 404, {}, cors);

    const stripe = getStripe();
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email,
        name: profile.full_name ?? undefined,
        metadata: { client_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("user_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const origin = req.headers.get("origin") ?? new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: offre.stripe_price_id, quantity: 1 }],
      success_url: `${origin}/espace-client/dashboard?subscribed=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/espace-client/services?canceled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { client_id: user.id, offre_id: body.offre_id },
      },
      metadata: { client_id: user.id, offre_id: body.offre_id },
    });

    // Pre-insert a pending subscription so the dashboard reflects intent.
    await supabase.from("client_subscriptions").insert({
      client_id: user.id,
      offre_id: body.offre_id,
      stripe_price_id: offre.stripe_price_id,
      status: "pending",
      metadata: { checkout_session_id: session.id },
    });

    if (!session.url) return jsonError("checkout_no_url", 500, {}, cors);
    return json({ url: session.url }, { headers: cors });
  },
);
