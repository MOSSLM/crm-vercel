/**
 * Vision models available to auto-tag + describe media-library images.
 *
 * Shared by the settings API (`/api/settings/media-autotag`), the settings UI,
 * and the auto-tag endpoint so the list never diverges. The chosen model is
 * stored in the `media_autotag_settings` table (single row `id='default'`),
 * mirroring `enrichment_llm_settings`.
 *
 * The defaults are the cheapest capable vision models on each side; both must
 * accept an image + return short JSON.
 */

export type AutotagProvider = "anthropic" | "openai";

export interface AutotagOption {
  provider: AutotagProvider;
  model: string;
  label: string;
  note?: string;
}

export const MEDIA_AUTOTAG_OPTIONS: AutotagOption[] = [
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    note: "Recommandé — vision rapide et très économique",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    note: "Vision plus fine, un peu plus cher",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "GPT-4o mini",
    note: "Vision OpenAI économique",
  },
  {
    provider: "openai",
    model: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    note: "Vision OpenAI, bon rapport qualité/prix",
  },
  {
    provider: "openai",
    model: "gpt-4o",
    label: "GPT-4o",
    note: "Vision OpenAI haut de gamme",
  },
];

export const DEFAULT_AUTOTAG_PROVIDER: AutotagProvider = "anthropic";
export const DEFAULT_AUTOTAG_MODEL = "claude-haiku-4-5-20251001";

export function isValidAutotagProvider(p: unknown): p is AutotagProvider {
  return p === "anthropic" || p === "openai";
}

export function findAutotagOption(provider: string, model: string): AutotagOption | undefined {
  return MEDIA_AUTOTAG_OPTIONS.find((o) => o.provider === provider && o.model === model);
}
