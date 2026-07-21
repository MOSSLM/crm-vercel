import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url({ message: "SUPABASE_URL doit être une URL valide" }),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, { message: "SUPABASE_SERVICE_ROLE_KEY est requis" }),
    GMAPS_AWS_REGION: z
      .string()
      .min(1, { message: "GMAPS_AWS_REGION est requis" }),
    GMAPS_AWS_CLUSTER: z
      .string()
      .min(1, { message: "GMAPS_AWS_CLUSTER est requis" }),
    GMAPS_AWS_SERVICE: z
      .string()
      .min(1, { message: "GMAPS_AWS_SERVICE est requis" }),
    GMAPS_API_TOKEN: z
      .string()
      .min(1, { message: "GMAPS_API_TOKEN est requis" }),
    GMAPS_BASE_URL: z.string().url().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    // Stripe — optional; routes return 503 when keys are absent.
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    // External page-rendering provider for the visual site import (screenshots /
    // rendered HTML). All optional: when RENDER_API_KEY is absent the "auto"
    // capture is disabled and the import falls back to manual upload.
    RENDER_PROVIDER: z.string().min(1).optional(),
    RENDER_API_KEY: z.string().min(1).optional(),
    RENDER_API_URL: z.string().url().optional(),
    // The cron routes fail closed in production unless at least one of these
    // is set. Either is sufficient: CRON_SECRET is checked when the call comes
    // from Vercel Cron, PG_CRON_SECRET when it comes from Supabase pg_cron.
    // The cross-field check below enforces "at least one" in prod.
    CRON_SECRET: z.string().min(1).optional(),
    PG_CRON_SECRET: z.string().min(1).optional(),
    // Twilio (téléphonie / SMS) — tout est optionnel : quand les clés sont
    // absentes, les routes /api/twilio/* répondent 503 et le softphone bascule
    // en mode simulation (voir TWILIO_MOCK). `ACCOUNT_SID` + `AUTH_TOKEN`
    // servent au REST et à la vérification de signature des webhooks ; la paire
    // `API_KEY_SID` / `API_KEY_SECRET` sert à signer les AccessToken du Voice
    // SDK ; `TWIML_APP_SID` est la TwiML App dont la Voice URL pointe sur
    // /api/twilio/voice.
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_API_KEY_SID: z.string().min(1).optional(),
    TWILIO_API_KEY_SECRET: z.string().min(1).optional(),
    TWILIO_TWIML_APP_SID: z.string().min(1).optional(),
    // Force le mode simulation même si des clés sont présentes ("true"/"1").
    // Absent + clés absentes ⇒ mock implicite. Voir src/lib/twilio/config.ts.
    TWILIO_MOCK: z.string().optional(),
  })
  .refine(
    (env) => !isProd || !!env.CRON_SECRET || !!env.PG_CRON_SECRET,
    {
      message:
        "Au moins un de CRON_SECRET ou PG_CRON_SECRET est requis en production (sinon les endpoints cron ferment l'accès)",
      path: ["CRON_SECRET"],
    },
  );

const envResult = envSchema.safeParse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION: process.env.GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER: process.env.GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE: process.env.GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN: process.env.GMAPS_API_TOKEN,
  GMAPS_BASE_URL: process.env.GMAPS_BASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  RENDER_PROVIDER: process.env.RENDER_PROVIDER,
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  RENDER_API_URL: process.env.RENDER_API_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  PG_CRON_SECRET: process.env.PG_CRON_SECRET,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID: process.env.TWILIO_TWIML_APP_SID,
  TWILIO_MOCK: process.env.TWILIO_MOCK,
});

if (!envResult.success) {
  const errors = Object.entries(envResult.error.flatten().fieldErrors)
    .map(([key, msgs]) => `${key}: ${msgs?.join(", ")}`)
    .join("; ");
  throw new Error(
    `Variables d'environnement manquantes ou invalides: ${errors}`
  );
}

export const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN,
  GMAPS_BASE_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  RENDER_PROVIDER,
  RENDER_API_KEY,
  RENDER_API_URL,
  CRON_SECRET,
  PG_CRON_SECRET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_MOCK,
} = envResult.data;
