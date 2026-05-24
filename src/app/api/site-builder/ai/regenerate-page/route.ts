import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AiJsonParseError, extractJsonFromAiResponse } from "@/lib/parsers/ai-json";

export const dynamic = "force-dynamic";

interface RegeneratePageRequest {
  siteId: string;
  enterpriseId?: number;
  pageSlug: string;
  pageTitle: string;
  globalDescription?: string;
  pageContext?: string;
  availableSectionTypes: string[];
  model?: string;
  variableContext?: Record<string, string>;
}

async function callAI(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const isOpenAI = model.startsWith("gpt-");

  if (isOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY non configuré");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} — ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configuré");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status} — ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }
}

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = (await req.json()) as RegeneratePageRequest;
  const { siteId, enterpriseId, pageSlug, pageTitle, globalDescription, pageContext, availableSectionTypes, model = "claude-sonnet-4-6", variableContext } = body;
  void siteId;

  const variableHint = variableContext && Object.keys(variableContext).length > 0
    ? `\nVARIABLES DISPONIBLES — utilise ces tokens pour les données d'entreprise :\n${
        Object.entries(variableContext)
          .filter(([k]) => !k.startsWith("company."))
          .map(([k, v]) => `  {{ ${k} }} → "${v}"`)
          .join("\n")
      }`
    : "";

  let enterpriseInfo = "";
  if (enterpriseId) {
    const { data: ent } = await supabase
      .from("entreprises")
      .select("nom, ville, telephone, service_tags, note_moyenne, nombre_avis")
      .eq("id", enterpriseId)
      .single();
    if (ent) {
      enterpriseInfo = `Entreprise: ${ent.nom ?? ""}, ${ent.ville ?? ""} — Services: ${Array.isArray(ent.service_tags) ? ent.service_tags.join(", ") : ""}`;
    }
  }

  const systemPrompt = `Tu es un expert en création de sites web. Tu génères le contenu d'une page spécifique en JSON.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.${variableHint}`;

  const userPrompt = `Page: "${pageTitle}" (${pageSlug})

${globalDescription ? `Description globale du site: ${globalDescription}` : ""}
${enterpriseInfo ? enterpriseInfo : ""}
${pageContext ? `\nContexte spécifique pour cette page: ${pageContext}` : ""}

Sections disponibles: ${availableSectionTypes.join(", ")}

Génère 3 à 5 sections pertinentes pour cette page. Réponds avec ce JSON:
{
  "sections": [
    { "id": "sec-1", "name": "Nom de la section", "description": "Description du contenu", "type": "<type de section>" }
  ]
}`;

  const text = await callAI(systemPrompt, userPrompt, model);
  try {
    return json(extractJsonFromAiResponse(text));
  } catch (err) {
    if (err instanceof AiJsonParseError) return jsonError(err.message, 502);
    throw err;
  }
});
