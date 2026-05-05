import { NextResponse } from "next/server";

interface RegenerateRequest {
  siteId: string;
  instanceId: string;
  sectionType: string;
  currentContent: Record<string, unknown>;
  defaultContent: Record<string, unknown>;
  prompt?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegenerateRequest;
    const { sectionType, currentContent, defaultContent, prompt } = body;

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configuré");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Aucun JSON dans la réponse IA");

    const content = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
