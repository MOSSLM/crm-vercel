import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Role = "user" | "assistant";
interface HistoryItem {
  role: Role;
  content: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DEFAULT_SYSTEM_PROMPT = (sectionId: string) =>
  `Expert React/TypeScript — sections web compilées via Babel standalone dans un iframe.
Section en cours : "${sectionId}".

Stack : React 18 (global, sans import), TypeScript, Tailwind CSS uniquement.

Props obligatoires :
\`\`\`tsx
interface Props {
  tokens?: Record<string, string>;
  data?: Record<string, unknown>;
  variables?: Record<string, string>;
}
export default function Nom({ tokens={}, data={}, variables={} }: Props)
\`\`\`

Variables : variables['entreprise.nom|telephone|email|adresse|ville|code_postal|description|annee_creation|note_moyenne|nombre_avis|logo_url']

Règles :
- export default function obligatoire, pas d'imports React
- Tailwind mobile-first (sm: md: lg:), pas de CSS inline
- Textes statiques → variables['entreprise.*'] ou data.*
- Pas de hooks complexes ni fetch

Réponse : \`\`\`tsx [code] \`\`\` puis 1-2 phrases d'explication.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; sectionId: string }> }
) {
  const { sectionId } = await params;

  let body: {
    model?: string;
    currentCode: string;
    message: string;
    history?: HistoryItem[];
    systemPrompt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentCode, message, history = [], model = "claude-sonnet-4-6", systemPrompt } = body;

  if (!currentCode || !message) {
    return NextResponse.json(
      { error: "currentCode and message are required" },
      { status: 400 }
    );
  }

  const recentHistory = history.slice(-10);
  const resolvedSystemPrompt = systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT(sectionId);
  const userMessage = `Code actuel de la section "${sectionId}" :\n\`\`\`tsx\n${currentCode}\n\`\`\`\n\nDemande : ${message}`;

  const isGpt = model.startsWith("gpt-");

  try {
    if (isGpt) {
      const gptMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: resolvedSystemPrompt },
        ...recentHistory.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: userMessage },
      ];

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: resolveGptModel(model),
          max_tokens: 4096,
          messages: gptMessages,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.json();
        throw new Error(err.error?.message ?? "Erreur OpenAI");
      }

      const gptData = await openaiRes.json();
      const rawContent = gptData.choices?.[0]?.message?.content ?? "";
      const { newCode, explanation } = extractCodeAndExplanation(rawContent);
      return NextResponse.json({ newCode, explanation });
    }

    // Anthropic
    const anthropicModel = resolveAnthropicModel(model);
    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userMessage },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await anthropic.messages.create(
        {
          model: anthropicModel,
          max_tokens: 4096,
          system: resolvedSystemPrompt,
          messages,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeout);
      const rawContent =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      const { newCode, explanation } = extractCodeAndExplanation(rawContent);
      return NextResponse.json({ newCode, explanation });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return NextResponse.json(
        { error: "Timeout: l'IA n'a pas répondu dans les 30 secondes" },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function resolveAnthropicModel(model: string): string {
  const map: Record<string, string> = {
    "claude-sonnet-4-6": "claude-sonnet-4-6",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-opus-4-7": "claude-opus-4-7",
  };
  return map[model] ?? "claude-sonnet-4-6";
}

function resolveGptModel(model: string): string {
  const map: Record<string, string> = {
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4-turbo",
  };
  return map[model] ?? "gpt-4o";
}

function extractCodeAndExplanation(raw: string): {
  newCode: string;
  explanation: string;
} {
  const match = raw.match(/```(?:tsx?|jsx?|typescript)?\n?([\s\S]*?)```/);
  if (!match) {
    return { newCode: raw.trim(), explanation: "" };
  }
  const newCode = match[1].trim();
  const explanation = raw
    .slice(raw.indexOf(match[0]) + match[0].length)
    .trim();
  return { newCode, explanation };
}
