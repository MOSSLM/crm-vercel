/**
 * Canonical absolute URL of the CRM app (client portal, auth callback, …).
 *
 * Demo sites live on their own subdomains ({sub}.samadigitalstudio.fr) where
 * /espace-client and /auth are NOT served — the middleware rewrites those hosts
 * to /site or /preview. So any link back into the app (Stripe success URL,
 * post-payment magic link) must target a CRM host, not the demo subdomain.
 *
 * Override with NEXT_PUBLIC_APP_URL; otherwise default to app.{APP_DOMAIN}.
 */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "samadigitalstudio.fr";
  return `https://app.${domain}`;
}
