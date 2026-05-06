export interface ThemeSection {
  id: string;
  theme_slug: string;
  section_id: string;
  category: string;
  name: string;
  code: string;
  example_data: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AIModel =
  | "claude-sonnet-4-6"
  | "claude-3-5-sonnet"
  | "claude-3-opus"
  | "claude-opus-4-7";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  newCode?: string;
  explanation?: string;
  timestamp: Date;
}

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "heros", label: "Heros" },
  { id: "layouts", label: "Layouts" },
  { id: "features", label: "Features" },
  { id: "testimonials", label: "Testimonials" },
  { id: "cta", label: "CTA" },
  { id: "footers", label: "Footers" },
  { id: "misc", label: "Divers" },
];

export const AI_MODELS: { id: AIModel; label: string }[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-3-opus", label: "Claude 3 Opus" },
];
