import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url({ message: "SUPABASE_URL doit être une URL valide" }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: "SUPABASE_SERVICE_ROLE_KEY est requis" }),
});

const envResult = envSchema.safeParse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

if (!envResult.success) {
  const errors = Object.entries(envResult.error.flatten().fieldErrors)
    .map(([key, msgs]) => `${key}: ${msgs?.join(", ")}`)
    .join("; ");
  throw new Error(
    `Variables d'environnement manquantes ou invalides: ${errors}`
  );
}

export const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = envResult.data;
