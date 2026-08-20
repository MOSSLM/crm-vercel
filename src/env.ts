import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url({ message: "SUPABASE_URL doit être une URL valide" }),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, { message: "SUPABASE_SERVICE_ROLE_KEY est requis" }),
    // Les trois GMAPS_AWS_* ne servent QU'au mode Fargate (auto-scale à la demande
    // via ECS). Optionnelles : quand le scraper tourne sur une machine fixe
    // (Docker sur un ordinateur laissé allumé, pas de Fargate), GMAPS_BASE_URL
    // suffit et gmaps-ip.ts n'appelle jamais l'API ECS — les rendre obligatoires
    // ferait échouer TOUT le démarrage du CRM en leur absence, pour une
    // fonctionnalité (l'auto-scale) que ce mode n'utilise pas.
    GMAPS_AWS_REGION: z.string().min(1).optional(),
    GMAPS_AWS_CLUSTER: z.string().min(1).optional(),
    GMAPS_AWS_SERVICE: z.string().min(1).optional(),
    GMAPS_API_TOKEN: z
      .string()
      .min(1, { message: "GMAPS_API_TOKEN est requis" }),
    // Port exposé par le conteneur du scraper (Dockerfile : PORT=3000 / EXPOSE 3000,
    // et en mode réseau awsvpc le containerPort n'est pas remappé). Sans ça on
    // construisait `http://<ip>` → port 80, où rien n'écoute.
    GMAPS_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Court-circuite la résolution d'IP ECS quand elle est renseignée (tunnel
    // TLS, reverse proxy, environnement de test, ou mode machine fixe). Doit
    // inclure le port SAUF si c'est déjà un tunnel qui le gère (ex. Cloudflare
    // Tunnel expose toujours du 443 en https, jamais besoin de port explicite).
    GMAPS_BASE_URL: z.string().url().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    // Stripe — optional; routes return 503 when keys are absent.
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Telephony / call-center provider — optional; routes return 503 when the
    // provider keys are absent (same pattern as Stripe). The provider stays
    // behind the abstraction in `src/lib/telephony/`, so swapping to another
    // carrier later means adding an adapter + its own keys here.
    TELEPHONY_PROVIDER: z.string().min(1).optional(),
    ZADARMA_KEY: z.string().min(1).optional(),
    ZADARMA_SECRET: z.string().min(1).optional(),
    // Optional distinct secret for verifying inbound webhooks; when absent we
    // fall back to ZADARMA_SECRET (Zadarma signs callbacks with the API secret).
    ZADARMA_WEBHOOK_SECRET: z.string().min(1).optional(),
    // External page-rendering provider for the visual site import (screenshots /
    // rendered HTML). All optional: when RENDER_API_KEY is absent the "auto"
    // capture is disabled and the import falls back to manual upload.
    RENDER_PROVIDER: z.string().min(1).optional(),
    RENDER_API_KEY: z.string().min(1).optional(),
    RENDER_API_URL: z.string().url().optional(),
    // PageSpeed Insights — la seule source de Core Web Vitals (LCP/CLS/INP),
    // que l'analyseur maison ne peut pas mesurer sans navigateur.
    // OPTIONNELLE, et elle doit le rester : ce schéma jette à l'import quand
    // une variable requise manque, donc la rendre obligatoire casserait tout
    // le déploiement au lieu de désactiver cette seule fonctionnalité. Sans
    // clé, le quota public suffit pour un usage à la demande.
    PAGESPEED_API_KEY: z.string().min(1).optional(),
    // Google Calendar (module Rendez-vous) — optional; the OAuth routes return
    // 503 when absent and the scheduling module works without external busy.
    GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
    // The cron routes fail closed in production unless at least one of these
    // is set. Either is sufficient: CRON_SECRET is checked when the call comes
    // from Vercel Cron, PG_CRON_SECRET when it comes from Supabase pg_cron.
    // The cross-field check below enforces "at least one" in prod.
    CRON_SECRET: z.string().min(1).optional(),
    PG_CRON_SECRET: z.string().min(1).optional(),
    // Radar analytics (GA4 Data API + Clarity Data Export API) — optional; the
    // route returns a "not configured" payload when absent instead of fake
    // numbers. GA4_SERVICE_ACCOUNT_KEY is the *content* of the service-account
    // JSON key file (not a path — Vercel env vars aren't files), granted
    // Viewer access on the GA4 property in Admin → Property Access Management.
    // GA4_PROPERTY_ID is the numeric property id (Admin → Property Settings),
    // NOT the NEXT_PUBLIC_GA_MEASUREMENT_ID (G-XXXXXXX) used by the tracking tag.
    GA4_PROPERTY_ID: z.string().min(1).optional(),
    GA4_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
    // Clarity → Settings → Data Export → generate token. Distinct from
    // NEXT_PUBLIC_CLARITY_PROJECT_ID, which only feeds the tracking tag.
    CLARITY_API_TOKEN: z.string().min(1).optional(),
  })
  .refine(
    (env) => !isProd || !!env.CRON_SECRET || !!env.PG_CRON_SECRET,
    {
      message:
        "Au moins un de CRON_SECRET ou PG_CRON_SECRET est requis en production (sinon les endpoints cron ferment l'accès)",
      path: ["CRON_SECRET"],
    },
  );

/**
 * LES VARIABLES QU'ON PEUT PERDRE SANS PERDRE LE CRM.
 *
 * Ce schéma est lu À L'IMPORT, et `getServiceClient()` l'importe : tout ce qui
 * jette ici éteint l'API ENTIÈRE, pas la fonctionnalité concernée. Le 20/08/2026
 * une seule variable mal formée — `RESEND_FROM_EMAIL`, à qui `vercel env pull`
 * avait écrit un placeholder parce qu'elle est marquée « Sensitive » — a rendu
 * 500 sur `/api/telephony/me`, `/api/agent/journee` et `/api/entreprises/perimetre`,
 * qui n'envoient aucun e-mail.
 *
 * D'où la règle : une variable OPTIONNELLE mal formée vaut ABSENTE. La
 * fonctionnalité qui en dépend rend déjà 503 quand elle manque — c'est le
 * contrat de chacune d'elles — et le CRM continue de tourner.
 *
 * Ce qui reste fatal, et doit le rester : les deux clés Supabase (sans elles
 * rien ne peut lire quoi que ce soit), `GMAPS_API_TOKEN`, et l'exigence d'au
 * moins un secret de cron en production (sinon les routes cron s'ouvriraient).
 */
const DEGRADABLES = new Set([
  "GMAPS_AWS_REGION",
  "GMAPS_AWS_CLUSTER",
  "GMAPS_AWS_SERVICE",
  "GMAPS_BASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TELEPHONY_PROVIDER",
  "ZADARMA_KEY",
  "ZADARMA_SECRET",
  "ZADARMA_WEBHOOK_SECRET",
  "RENDER_PROVIDER",
  "RENDER_API_KEY",
  "RENDER_API_URL",
  "PAGESPEED_API_KEY",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GA4_PROPERTY_ID",
  "GA4_SERVICE_ACCOUNT_KEY",
  "CLARITY_API_TOKEN",
]);

const brut: Record<string, unknown> = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION: process.env.GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER: process.env.GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE: process.env.GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN: process.env.GMAPS_API_TOKEN,
  GMAPS_PORT: process.env.GMAPS_PORT,
  GMAPS_BASE_URL: process.env.GMAPS_BASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  TELEPHONY_PROVIDER: process.env.TELEPHONY_PROVIDER,
  ZADARMA_KEY: process.env.ZADARMA_KEY,
  ZADARMA_SECRET: process.env.ZADARMA_SECRET,
  ZADARMA_WEBHOOK_SECRET: process.env.ZADARMA_WEBHOOK_SECRET,
  RENDER_PROVIDER: process.env.RENDER_PROVIDER,
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  RENDER_API_URL: process.env.RENDER_API_URL,
  PAGESPEED_API_KEY: process.env.PAGESPEED_API_KEY,
  GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  PG_CRON_SECRET: process.env.PG_CRON_SECRET,
  GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  GA4_SERVICE_ACCOUNT_KEY: process.env.GA4_SERVICE_ACCOUNT_KEY,
  CLARITY_API_TOKEN: process.env.CLARITY_API_TOKEN,
};

/**
 * Ce qui a été mis de côté, et pourquoi.
 *
 * Un dégradé SILENCIEUX serait pire que la panne qu'il remplace : on chercherait
 * pendant une heure pourquoi aucun e-mail ne part alors que la clé « est bien
 * posée ». La liste est exportée pour qu'un écran de diagnostic puisse la dire,
 * et écrite dans le journal au démarrage.
 */
export const VARIABLES_IGNOREES: { variable: string; probleme: string }[] = [];

/**
 * Valide en écartant, tour par tour, les seules variables dégradables.
 *
 * On rejoue le schéma entier après chaque écart plutôt que de valider champ par
 * champ : le contrôle croisé des secrets de cron porte sur DEUX variables, et
 * le découper le ferait disparaître.
 */
function analyser() {
  for (let tour = 0; tour <= DEGRADABLES.size; tour += 1) {
    const essai = envSchema.safeParse(brut);
    if (essai.success) return essai.data;

    const ecartables = essai.error.issues.filter((i) => {
      const nom = String(i.path[0] ?? "");
      return DEGRADABLES.has(nom) && brut[nom] !== undefined;
    });
    if (ecartables.length === 0) {
      const errors = Object.entries(essai.error.flatten().fieldErrors)
        .map(([key, msgs]) => `${key}: ${msgs?.join(", ")}`)
        .join("; ");
      throw new Error(`Variables d'environnement manquantes ou invalides: ${errors}`);
    }
    for (const i of ecartables) {
      const nom = String(i.path[0]);
      VARIABLES_IGNOREES.push({ variable: nom, probleme: i.message });
      brut[nom] = undefined;
    }
  }
  // Inatteignable : chaque tour écarte au moins une variable de l'ensemble.
  throw new Error("Variables d'environnement : validation impossible");
}

const donnees = analyser();

if (VARIABLES_IGNOREES.length > 0) {
  console.warn(
    "[env] variables ignorées car mal formées (la fonctionnalité correspondante rendra 503) : " +
      VARIABLES_IGNOREES.map((v) => `${v.variable} (${v.probleme})`).join(" · "),
  );
}

export const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN,
  GMAPS_PORT,
  GMAPS_BASE_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  TELEPHONY_PROVIDER,
  ZADARMA_KEY,
  ZADARMA_SECRET,
  ZADARMA_WEBHOOK_SECRET,
  RENDER_PROVIDER,
  RENDER_API_KEY,
  RENDER_API_URL,
  PAGESPEED_API_KEY,
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  CRON_SECRET,
  PG_CRON_SECRET,
  GA4_PROPERTY_ID,
  GA4_SERVICE_ACCOUNT_KEY,
  CLARITY_API_TOKEN,
} = donnees;
