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
    // The cron routes fail closed in production unless at least one of these
    // is set. Either is sufficient: CRON_SECRET is checked when the call comes
    // from Vercel Cron, PG_CRON_SECRET when it comes from Supabase pg_cron.
    // The cross-field check below enforces "at least one" in prod.
    CRON_SECRET: z.string().min(1).optional(),
    PG_CRON_SECRET: z.string().min(1).optional(),
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
  CRON_SECRET: process.env.CRON_SECRET,
  PG_CRON_SECRET: process.env.PG_CRON_SECRET,
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
  CRON_SECRET,
  PG_CRON_SECRET,
} = envResult.data;
