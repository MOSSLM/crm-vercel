import { NextResponse } from "next/server";

interface RegenerateRequest {
  siteId: string;
  instanceId: string;
  sectionType: string;
  currentContent: Record<string, unknown>;
  defaultContent: Record<string, unknown>;
  prompt?: string;
  model?: string;
  provider?: "claude" | "openai";
}

async function callAI(
  provider: "claude" | "openai",
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048
): Promise<string> {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY non configuré");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} — ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configuré");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} — ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegenerateRequest;
    const {
      sectionType, currentContent, defaultContent, prompt,
      model = "claude-sonnet-4-6",
      provider = "claude",
    } = body;

    const systemPrompt = `Tu es un expert en copywriting web. Tu régénères le contenu d'une section de site web.
Tu réponds UNIQUEMENT avec un JSON valide contenant les nouvelles valeurs pour les clés de contenu.`;

    const userPrompt = `
Section type : ${sectionType}

Contenu actuel :
${JSON.stringify({ ...defaultContent, ...currentContent }, null, 2)}

${prompt ? `Instruction de l'utilisateur : ${prompt}` : "Améliore ce contenu pour le rendre plus professionnel et convaincant."}

Génère un nouveau contenu en conservant exactement les mêmes clés.
Réponds avec un JSON contenant uniquement les clés à mettre à jour (tu peux omettre les clés non textuelles comme les tableaux).
Exemples de clés : heading, subheading, badge_text, body, cta_text, section_label, etc.
`.trim();

    const text = await callAI(provider, model, systemPrompt, userPrompt, 2048);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Aucun JSON dans la réponse IA");

    const content = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
