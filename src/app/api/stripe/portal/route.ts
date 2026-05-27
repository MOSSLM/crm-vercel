import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STRIPE_SECRET_KEY } from "@/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const POST = withAuth({}, async ({ user, req, cors }) => {
  if (!STRIPE_SECRET_KEY) return jsonError("STRIPE_SECRET_KEY non configuré", 503, {}, cors);

  const supabase = getServiceClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return jsonError("no_stripe_customer", 404, {}, cors);
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id as string,
    return_url: `${origin}/espace-client/dashboard`,
  });

  return json({ url: session.url }, { headers: cors });
});
