/**
 * AI call evaluation via Claude (@anthropic-ai/sdk) — Onoff's "évaluation
 * d'appel par IA". Takes a transcript, returns a structured assessment. Uses the
 * same economical default model as the rest of the app; key via ANTHROPIC_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const AI_EVAL_MODEL = "claude-haiku-4-5-20251001";

export interface CallEvaluation {
  summary: string;
  sentiment: "positif" | "neutre" | "negatif";
  score: number; // 0..100
  objections: string[];
  nextAction: string;
  topics: string[];
}

export const isAiConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY;

const evalSchema = z.object({
  summary: z.string().default(""),
  sentiment: z.enum(["positif", "neutre", "negatif"]).catch("neutre"),
  score: z.number().min(0).max(100).catch(50),
  objections: z.array(z.string()).default([]),
  nextAction: z.string().default(""),
  topics: z.array(z.string()).default([]),
});

const SYSTEM_PROMPT = `Tu es un analyste d'appels commerciaux B2B francophone. On te donne la transcription d'un appel téléphonique entre un commercial et un prospect/client.
Analyse l'appel et réponds STRICTEMENT avec un objet JSON valide, sans texte autour, au format :
{
  "summary": "résumé en 1-3 phrases en français",
  "sentiment": "positif" | "neutre" | "negatif",
  "score": entier de 0 à 100 (qualité + probabilité d'avancer dans le cycle de vente),
  "objections": ["objection 1", ...],
  "nextAction": "prochaine action recommandée en français",
  "topics": ["sujet 1", ...]
}`;

/** Extract the first balanced JSON object from a model response. */
const extractJson = (text: string): string => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return "{}";
  return text.slice(start, end + 1);
};

export const evaluateCallTranscript = async (
  transcript: string,
  opts: { model?: string } = {},
): Promise<CallEvaluation> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquant");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: opts.model ?? AI_EVAL_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcription de l'appel :\n"""\n${transcript.slice(0, 12000)}\n"""\n\nAnalyse cet appel et renvoie uniquement le JSON demandé.`,
      },
    ],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    parsed = {};
  }
  return evalSchema.parse(parsed);
};
