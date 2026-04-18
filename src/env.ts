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
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["claude", "openai"]).default("claude"),
});

const envResult = envSchema.safeParse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION: process.env.GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER: process.env.GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE: process.env.GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN: process.env.GMAPS_API_TOKEN,
  GMAPS_BASE_URL: process.env.GMAPS_BASE_URL,
});

if (!envResult.success) {
  const errors = Object.entries(envResult.error.flatten().fieldErrors)
    .map(([key, msgs]) => `${key}: ${msgs?.join(", ")}`)
    .join("; ");
  throw new Error(
    `Variables d'environnement manquantes ou invalides: ${errors}`
  );
}

// Cross-field validation: require the right API key for the selected AI provider
const { AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY } = envResult.data;
if (AI_PROVIDER === "claude" && !ANTHROPIC_API_KEY) {
  console.warn("[env] ANTHROPIC_API_KEY manquante — l'enrichissement IA Claude sera désactivé");
}
if (AI_PROVIDER === "openai" && !OPENAI_API_KEY) {
  console.warn("[env] OPENAI_API_KEY manquante — l'enrichissement IA OpenAI sera désactivé");
}

export const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE,
  GMAPS_API_TOKEN,
  GMAPS_BASE_URL,
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  AI_PROVIDER,
} = envResult.data;
