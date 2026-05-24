import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AiJsonParseError, extractJsonFromAiResponse } from "@/lib/parsers/ai-json";

interface RegenerateRequest {
  siteId: string;
  instanceId: string;
  sectionType: string;
  currentContent: Record<string, unknown>;
  defaultContent: Record<string, unknown>;
  prompt?: string;
  model?: string;
  variableContext?: Record<string, string>;
}

export const POST = withAuth({}, async ({ req }) => {
  const body = (await req.json()) as RegenerateRequest;
  const { sectionType, currentContent, defaultContent, prompt, model = "claude-sonnet-4-6", variableContext } = body;

  const variableHint = variableContext && Object.keys(variableContext).length > 0
    ? `\nVARIABLES DISPONIBLES — utilise ces tokens exacts au lieu de valeurs en dur pour les données d'entreprise :\n${
        Object.entries(variableContext)
          .filter(([k]) => !k.startsWith("company."))
          .map(([k, v]) => `  {{ ${k} }} → "${v}"`)
          .join("\n")
      }\nExemple : écris "Appelez {{ entreprise.nom }} au {{ entreprise.telephone }}" au lieu de noms/numéros réels.`
    : "";

  const systemPrompt = `Tu es un expert en copywriting web. Tu régénères le contenu d'une section de site web.
Tu réponds UNIQUEMENT avec un JSON valide contenant les nouvelles valeurs pour les clés de contenu.

TYPES DE CHAMPS COMPOSITES — certaines clés stockent des objets, pas des chaînes :
- button : { label: string, href?: string, target?: "_self"|"_blank" }
- link   : { label: string, href?: string, target?: "_self"|"_blank" }
- input  : { input_type?: string, placeholder?: string, label?: string, name?: string, required?: boolean }
- form   : { action?: string, method?: "GET"|"POST", submit_label?: string, success_message?: string }
Pour ces champs, génère un objet complet. Pour les champs texte simples, génère une chaîne.
NE modifie PAS les clés __animation_*, __color_scheme, __padding_y (réservées au style).${variableHint}`;

  const userPrompt = `
Section type : ${sectionType}

Contenu actuel :
${JSON.stringify({ ...defaultContent, ...currentContent }, null, 2)}

${prompt ? `Instruction de l'utilisateur : ${prompt}` : "Améliore ce contenu pour le rendre plus professionnel et convaincant."}

Génère un nouveau contenu en conservant exactement les mêmes clés.
Réponds avec un JSON contenant uniquement les clés à mettre à jour.
Exemples de clés simples : heading, subheading, badge_text, body, section_label.
Exemples de clés composites : cta_primary → { label, href }, email_field → { input_type, placeholder, label }.
`.trim();

  let text: string;
  if (model.startsWith("gpt-")) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError("OPENAI_API_KEY non configuré", 500);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) return jsonError(`OpenAI error: ${response.status} — ${await response.text()}`, 502);
    const data = await response.json();
    text = data.choices?.[0]?.message?.content ?? "";
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonError("ANTHROPIC_API_KEY non configuré", 500);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!response.ok) return jsonError(`Anthropic error: ${response.status} — ${await response.text()}`, 502);
    const data = await response.json();
    text = data.content?.[0]?.text ?? "";
  }
  try {
    return json({ content: extractJsonFromAiResponse(text) });
  } catch (err) {
    if (err instanceof AiJsonParseError) return jsonError(err.message, 502);
    throw err;
  }
});
