/**
 * Canonical absolute URL of the CRM app (client portal, auth callback, …).
 *
 * Demo sites live on their own subdomains ({sub}.samadigitalstudio.fr) where
 * /espace-client and /auth are NOT served — the middleware rewrites those hosts
 * to /site or /preview. So any link back into the app (Stripe success URL,
 * post-payment magic link) must target a CRM host, not the demo subdomain.
 *
 * Override with NEXT_PUBLIC_APP_URL; otherwise default to app.{SITE_DOMAIN}.
 */
import { SITE_DOMAIN } from "@/lib/site-domain";

export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // SITE_DOMAIN is normalised to the apex, so an "app.…" value configured by
  // hand can't produce "app.app.…" here.
  return `https://app.${SITE_DOMAIN}`;
}
