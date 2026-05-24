/**
 * Extract a single JSON object from a free-form AI completion.
 *
 * LLM responses occasionally wrap JSON in prose or fenced code blocks even
 * when asked not to. This helper grabs the first balanced `{…}` block,
 * `JSON.parse`s it, and (optionally) validates it against a Zod schema.
 *
 * Throws `AiJsonParseError` for any of: no JSON found, malformed JSON,
 * or schema validation failure.
 */

import type { ZodSchema } from "zod";

export class AiJsonParseError extends Error {
  readonly raw: string;
  readonly cause?: unknown;
  constructor(message: string, raw: string, cause?: unknown) {
    super(message);
    this.name = "AiJsonParseError";
    this.raw = raw;
    this.cause = cause;
  }
}

const JSON_OBJECT_RE = /\{[\s\S]*\}/;

export function extractJsonFromAiResponse<T = unknown>(
  raw: string,
  schema?: ZodSchema<T>,
): T {
  if (!raw || !raw.trim()) {
    throw new AiJsonParseError("Empty AI response", raw);
  }

  const match = raw.match(JSON_OBJECT_RE);
  if (!match) {
    throw new AiJsonParseError("No JSON object found in AI response", raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new AiJsonParseError("Malformed JSON in AI response", raw, err);
  }

  if (schema) {
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new AiJsonParseError("AI response failed schema validation", raw, result.error);
    }
    return result.data;
  }

  return parsed as T;
}
