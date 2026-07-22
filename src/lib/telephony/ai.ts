/**
 * AI call evaluation — scores a call from its transcript using Anthropic
 * (already a dependency; same client pattern as src/lib/ai/*). Server-only.
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-5";

export type Sentiment = "positif" | "neutre" | "negatif";

export interface CallEvaluation {
  score: number;
  criteria: Record<string, number>;
  sentiment: Sentiment;
  summary: string;
  model: string;
}

const CRITERIA = ["decouverte", "ecoute", "argumentation", "closing", "politesse"] as const;

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Extract the first top-level JSON object from a model response. */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function evaluateCallTranscript(input: {
  transcript: string;
  direction?: string;
  model?: string;
}): Promise<CallEvaluation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant");

  const client = new Anthropic({ apiKey });
  const model = input.model ?? DEFAULT_MODEL;

  const system =
    "Tu es un coach commercial francophone. À partir de la transcription d'un appel " +
    "(canaux séparés agent/client quand disponibles), évalue la performance de l'agent. " +
    "Sois factuel et concis. Réponds UNIQUEMENT en JSON valide, sans texte autour.";

  const prompt =
    `Sens de l'appel: ${input.direction ?? "inconnu"}.\n\n` +
    `Transcription:\n"""\n${input.transcript.slice(0, 12000)}\n"""\n\n` +
    `Renvoie ce JSON exact:\n` +
    `{"score": <0-100 global>, "criteria": {"decouverte":<0-100>, "ecoute":<0-100>, ` +
    `"argumentation":<0-100>, "closing":<0-100>, "politesse":<0-100>}, ` +
    `"sentiment": "positif|neutre|negatif", "summary": "<2-3 phrases: points forts, axes d'amélioration>"}`;

  const msg = await client.messages.create({
    model,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const parsed = extractJson(text);
  if (!parsed) throw new Error("evaluation_parse_failed");

  const rawCriteria = (parsed.criteria as Record<string, unknown>) ?? {};
  const criteria: Record<string, number> = {};
  for (const key of CRITERIA) criteria[key] = clamp(rawCriteria[key]);

  const sentimentRaw = String(parsed.sentiment ?? "neutre").toLowerCase();
  const sentiment: Sentiment =
    sentimentRaw === "positif" || sentimentRaw === "negatif" ? sentimentRaw : "neutre";

  return {
    score: clamp(parsed.score),
    criteria,
    sentiment,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    model,
  };
}
