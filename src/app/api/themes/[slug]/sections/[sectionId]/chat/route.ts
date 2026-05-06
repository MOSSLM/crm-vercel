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

const SYSTEM_PROMPT = (sectionId: string) => `Tu es un assistant spécialisé dans l'édition de composants React pour des sections de site web.
Le fichier actuellement ouvert dans Monaco est une section nommée "${sectionId}".
Tu reçois le code complet à chaque message (contexte).
L'utilisateur te demande des modifications.

Règles strictes :
1. Réponds EXCLUSIVEMENT avec le code modifié entre \`\`\`tsx ... \`\`\`.
2. Tu peux ajouter une courte explication APRÈS le bloc de code (2-3 phrases max).
3. Conserve la structure des props : tokens, data, variables (tous optionnels avec valeurs par défaut).
4. Respecte les classes Tailwind et le style existant.
5. Remplace les textes statiques par des variables dynamiques quand approprié : variables['entreprise.nom'], variables['entreprise.telephone'], variables['entreprise.email'], variables['entreprise.adresse'], variables['entreprise.description'], etc.
6. Garde l'import React en première ligne si nécessaire.
7. Ne jamais supprimer l'export default.`;

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
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentCode, message, history = [], model = "claude-sonnet-4-6" } = body;

  if (!currentCode || !message) {
    return NextResponse.json(
      { error: "currentCode and message are required" },
      { status: 400 }
    );
  }

  const recentHistory = history.slice(-10); // last 5 exchanges (10 messages)

  const userMessage = `Code actuel de la section "${sectionId}" :\n\`\`\`tsx\n${currentCode}\n\`\`\`\n\nDemande : ${message}`;

  const messages: Anthropic.MessageParam[] = [
    ...recentHistory.map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const anthropicModel = resolveModel(model);

    const response = await anthropic.messages.create(
      {
        model: anthropicModel,
        max_tokens: 4096,
        system: SYSTEM_PROMPT(sectionId),
        messages,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const rawContent =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const { newCode, explanation } = extractCodeAndExplanation(rawContent);

    return NextResponse.json({ newCode, explanation });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout: l'IA n'a pas répondu dans les 30 secondes" },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function resolveModel(model: string): string {
  const map: Record<string, string> = {
    "claude-sonnet-4-6": "claude-sonnet-4-6",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-opus-4-7": "claude-opus-4-7",
  };
  return map[model] ?? "claude-sonnet-4-6";
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
