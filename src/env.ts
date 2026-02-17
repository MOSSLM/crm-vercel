import { z } from "zod";

const envSchema = z.object({
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
  PAYMENT_RECEIPT_DEFAULT_TO: z.string().email().optional(),
});

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
  PAYMENT_RECEIPT_DEFAULT_TO: process.env.PAYMENT_RECEIPT_DEFAULT_TO,
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
  PAYMENT_RECEIPT_DEFAULT_TO,
} = envResult.data;
