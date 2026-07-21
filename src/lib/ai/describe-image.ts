/**
 * Economical vision auto-tagging + auto-description for media-library images.
 *
 * Given an image URL and the catalogue of AUTHORIZED service tags, an economical
 * vision model (Claude Haiku or GPT-4o mini by default) returns:
 *   - `service_tags`: the services the photo visually represents, chosen STRICTLY
 *     from the allowed catalogue (plus the universal tag "all" for generic
 *     images). The output is validated back against the catalogue so a model can
 *     never introduce an unknown tag.
 *   - `alt_text`: a short French accessibility label.
 *   - `description`: a one/two-sentence French description (internal note).
 *
 * Both providers are called with the image URL directly (no download / base64),
 * keeping the request small. Provider + model come from `media_autotag_settings`.
 */
import Anthropic from "@anthropic-ai/sdk";
import { formatServiceTag } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";
import type { AutotagProvider } from "./media-autotag-options";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface DescribeImageInput {
  imageUrl: string;
  /** Authorized service tags (canonical spelling) the model may choose from.
   *  Ignored (may be empty) when `withTags` is false. */
  allowedTags: string[];
  provider: AutotagProvider;
  model: string;
  /** When false, only alt_text + description are produced (no service tags,
   *  `service_tags` returned empty). Defaults to true. */
  withTags?: boolean;
}

export interface DescribeImageResult {
  service_tags: string[];
  alt_text: string;
  description: string;
}

const TAG_SYSTEM_PROMPT = `Tu es un assistant qui analyse une PHOTO destinée au site web d'une TPE/PME française (secteur CVC, plomberie, électricité, photovoltaïque, rénovation, etc.).

Ta tâche : à partir de l'image, produire un objet JSON avec EXACTEMENT ces clés :
- "service_tags" : liste (0 à 4) des services que la photo REPRÉSENTE VISUELLEMENT, choisis STRICTEMENT dans la liste autorisée fournie. N'invente aucun tag hors de cette liste. Si l'image est générique (équipe, bureau, maison, chantier non spécifique, outils génériques), renvoie ["all"].
- "alt_text" : texte alternatif court en français (max ~120 caractères), factuel.
- "description" : 1 à 2 phrases en français décrivant la photo (note interne).

Réponds UNIQUEMENT avec l'objet JSON, sans texte autour.`;

/** Describe-only variant: no service tags, so no allowed-tags catalogue needed. */
const DESCRIBE_ONLY_SYSTEM_PROMPT = `Tu es un assistant qui analyse une PHOTO destinée au site web d'une TPE/PME française (secteur CVC, plomberie, électricité, photovoltaïque, rénovation, etc.).

Ta tâche : à partir de l'image, produire un objet JSON avec EXACTEMENT ces clés :
- "alt_text" : texte alternatif court en français (max ~120 caractères), factuel.
- "description" : 1 à 2 phrases en français décrivant la photo (note interne).

Réponds UNIQUEMENT avec l'objet JSON, sans texte autour.`;

function tagUserPrompt(allowedTags: string[]): string {
  return `Liste autorisée des service_tags (utilise UNIQUEMENT ces valeurs, ou "all") :
${allowedTags.map((t) => `- ${t}`).join("\n")}

Analyse l'image et renvoie le JSON demandé.`;
}

const DESCRIBE_ONLY_USER_PROMPT = `Analyse l'image et renvoie le JSON demandé (alt_text + description).`;

/** System + user prompt pair for a given input, per the `withTags` mode. */
function promptsFor(input: DescribeImageInput): { system: string; user: string } {
  return input.withTags === false
    ? { system: DESCRIBE_ONLY_SYSTEM_PROMPT, user: DESCRIBE_ONLY_USER_PROMPT }
    : { system: TAG_SYSTEM_PROMPT, user: tagUserPrompt(input.allowedTags) };
}

/** GPT-5 / o-series need `max_completion_tokens` + no custom temperature. */
function isOpenAIReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/** Extract a JSON object from a possibly-wrapped text response. */
function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validates model-returned tags against the authorized catalogue. Unknown tags
 * are dropped; the universal tag "all" is always allowed. Returns canonical
 * spellings, de-duplicated, capped at 5. Pure — exported for tests.
 */
export function sanitizeTags(raw: unknown, allowedTags: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const canonical = new Map<string, string>();
  for (const t of allowedTags) canonical.set(formatServiceTag(t), t);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const norm = formatServiceTag(item);
    if (!norm || seen.has(norm)) continue;
    if (norm === MEDIA_LIBRARY_UNIVERSAL_TAG) {
      seen.add(norm);
      out.push(MEDIA_LIBRARY_UNIVERSAL_TAG);
    } else if (canonical.has(norm)) {
      seen.add(norm);
      out.push(canonical.get(norm)!);
    }
    if (out.length >= 5) break;
  }
  return out;
}

function toStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function shapeResult(parsed: unknown, input: DescribeImageInput): DescribeImageResult {
  const o = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    service_tags: input.withTags === false ? [] : sanitizeTags(o.service_tags, input.allowedTags),
    alt_text: toStr(o.alt_text, 200),
    description: toStr(o.description, 600),
  };
}

async function describeWithAnthropic(input: DescribeImageInput): Promise<DescribeImageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant");
  const client = new Anthropic({ apiKey });
  const { system, user } = promptsFor(input);
  const msg = await client.messages.create({
    model: input.model,
    max_tokens: 500,
    system,
    messages: [
      {
        role: "user",
        // URL image source (avoids downloading/encoding the bytes).
        content: [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          { type: "text", text: user },
        ] as Anthropic.MessageParam["content"],
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return shapeResult(parseJsonLoose(text), input);
}

async function describeWithOpenAI(input: DescribeImageInput): Promise<DescribeImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

  const { system, user } = promptsFor(input);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: input.imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };
  if (isOpenAIReasoningModel(input.model)) {
    body.max_completion_tokens = 4000;
    if (/^gpt-5/i.test(input.model)) body.reasoning_effort = "minimal";
  } else {
    body.temperature = 0.1;
    body.max_tokens = 500;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("OpenAI: réponse vide");
    return shapeResult(parseJsonLoose(content), input);
  } finally {
    clearTimeout(timeout);
  }
}

/** Analyzes one image and returns validated tags + alt + description. */
export async function describeImage(input: DescribeImageInput): Promise<DescribeImageResult> {
  if (!input.imageUrl) throw new Error("imageUrl requis");
  return input.provider === "openai"
    ? describeWithOpenAI(input)
    : describeWithAnthropic(input);
}
