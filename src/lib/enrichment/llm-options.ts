/**
 * Modèles IA disponibles pour l'edge function d'enrichissement
 * (`enrich-lead-magnet`). Source unique partagée par l'API de réglages
 * (`/api/settings/enrichment-llm`) et l'UI Paramètres, pour éviter toute
 * divergence de liste.
 *
 * Le modèle réellement utilisé est stocké dans la table globale
 * `enrichment_llm_settings` (une seule ligne `id='default'`) et lu par l'edge
 * function à chaque run — comme `enrichment_tag_settings` pour les tags.
 *
 * `strictSchema` : true = l'API garantit une sortie conforme au JSON Schema
 * (OpenAI Structured Outputs) ; false = mode JSON simple (DeepSeek), la sortie
 * est normalisée/validée côté edge function.
 */

export type LlmProvider = "openai" | "deepseek";

export interface LlmOption {
  provider: LlmProvider;
  model: string;
  label: string;
  strictSchema: boolean;
  note?: string;
}

export const ENRICHMENT_LLM_OPTIONS: LlmOption[] = [
  {
    provider: "openai",
    model: "gpt-5",
    label: "GPT-5",
    strictSchema: true,
    note: "Recommandé — puissant, moins cher que GPT-4o, schéma strict",
  },
  {
    provider: "openai",
    model: "gpt-5-nano",
    label: "GPT-5 nano",
    strictSchema: true,
    note: "Ultra économique, schéma strict",
  },
  {
    provider: "openai",
    model: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    strictSchema: true,
    note: "Très économique, schéma strict",
  },
  {
    provider: "openai",
    model: "gpt-4o-2024-08-06",
    label: "GPT-4o (ancien défaut)",
    strictSchema: true,
  },
  {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    strictSchema: false,
    note: "Le moins cher, bon en analyse de site — JSON simple",
  },
  {
    provider: "deepseek",
    model: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    strictSchema: false,
    note: "Mode raisonnement — JSON simple",
  },
];

export const DEFAULT_LLM_PROVIDER: LlmProvider = "openai";
export const DEFAULT_LLM_MODEL = "gpt-5";

export function isValidProvider(p: unknown): p is LlmProvider {
  return p === "openai" || p === "deepseek";
}

export function findLlmOption(provider: string, model: string): LlmOption | undefined {
  return ENRICHMENT_LLM_OPTIONS.find((o) => o.provider === provider && o.model === model);
}
