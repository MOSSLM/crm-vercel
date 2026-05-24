import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AiJsonParseError, extractJsonFromAiResponse } from "@/lib/parsers/ai-json";

export const dynamic = "force-dynamic";

interface SectionRef {
  id: string;
  type: string;
  name: string;
  category?: string;
}

interface GenerateRequest {
  siteId: string;
  enterpriseId?: number;
  description: string;
  pages: string[] | string;
  availableSectionIds?: SectionRef[];
  availableSectionTypes?: string[];
  model?: string;
  variableContext?: Record<string, string>;
}

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = (await req.json()) as GenerateRequest;
  const { siteId, enterpriseId, description, pages, availableSectionIds, availableSectionTypes, model = "claude-sonnet-4-6", variableContext } = body;
  void availableSectionTypes;

  if (!description?.trim()) return jsonError("description requis", 400);

  let enterpriseInfo = "";
  if (enterpriseId) {
    const { data: ent } = await supabase
      .from("entreprises")
      .select("nom, ville, telephone, service_tags, note_moyenne, nombre_avis, logo_url")
      .eq("id", enterpriseId)
      .single();
    if (ent) {
      enterpriseInfo = `
Données entreprise :
- Nom : ${ent.nom ?? "Inconnu"}
- Ville : ${ent.ville ?? "Non précisée"}
- Téléphone : ${ent.telephone ?? "Non précisé"}
- Services : ${Array.isArray(ent.service_tags) ? ent.service_tags.join(", ") : "Non précisé"}
- Note Google : ${ent.note_moyenne ?? "N/A"} (${ent.nombre_avis ?? 0} avis)
`.trim();
    }
  }

  const sectionsListJson = JSON.stringify((availableSectionIds ?? []).map((s) => ({
    id: s.id,
    type: s.type,
    name: s.name,
    category: s.category,
  })));

  const variableHint = variableContext && Object.keys(variableContext).length > 0
    ? `\nVARIABLES DISPONIBLES — utilise ces tokens exacts pour les données d'entreprise dans le contenu :\n${
        Object.entries(variableContext)
          .filter(([k]) => !k.startsWith("company."))
          .map(([k, v]) => `  {{ ${k} }} → "${v}"`)
          .join("\n")
      }\nExemple : écris "{{ entreprise.nom }}" au lieu du nom réel de l'entreprise.`
    : "";

  const systemPrompt = `Tu es un expert en création de sites web professionnels.
Tu génères des configurations de sites complets en JSON pour un système de builder.
Tu dois choisir les meilleures sections de la bibliothèque disponible et écrire du contenu professionnel en français.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.${variableHint}`;

  const userPrompt = `
Description de l'entreprise :
${description}

${enterpriseInfo}

Pages souhaitées : ${Array.isArray(pages) ? pages.join(", ") : pages}

Sections disponibles dans la bibliothèque :
${sectionsListJson}

Génère un sitemap complet avec le contenu pour chaque page.
Pour chaque page, choisis 3-6 sections pertinentes parmi celles disponibles.
Écris du contenu professionnel et convaincant adapté à l'entreprise.

Réponds avec ce format JSON exact :
{
  "styleGuide": {
    "colors": {
      "primary": "#...",
      "secondary": "#...",
      "accent": "#...",
      "background": "#ffffff",
      "backgroundAlt": "#f9fafb",
      "text": "#111827",
      "textMuted": "#6b7280"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter",
      "baseSize": "16px"
    }
  },
  "sitemap": [
    {
      "slug": "/",
      "title": "Accueil",
      "metaTitle": "...",
      "metaDescription": "...",
      "sections": [
        {
          "section_id": "<id exact de la section>",
          "content": {
            "<clé placeholder>": "<valeur>",
            ...
          }
        }
      ]
    }
  ]
}

IMPORTANT:
- Utilise uniquement les IDs de sections fournis dans la liste
- Le contenu doit remplir les clés correspondant aux placeholders des sections
- Écris en français, style professionnel et convaincant
- Adapte le style guide aux couleurs de l'entreprise si pertinent
- Si des variables sont disponibles, utilise les tokens {{ entreprise.* }} pour les données dynamiques
- Les "slug" sont des chemins : tu peux créer des pages imbriquées. Pour une page
  dédiée à un service précis, utilise un chemin enfant, ex: "/services/climatisation",
  "/services/chauffage". La page parente "/services" peut rester une page catégorie.
- Chaque page que tu crées DOIT avoir des sections. Ne crée jamais une page vide :
  une page sans section n'est pas publiée comme page (elle ne sert que de catégorie).
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
        max_tokens: 8192,
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
      body: JSON.stringify({ model, max_tokens: 8192, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!response.ok) return jsonError(`Anthropic error: ${response.status} — ${await response.text()}`, 502);
    const data = await response.json();
    text = data.content?.[0]?.text ?? "";
  }

  let generated: Record<string, unknown>;
  try {
    generated = extractJsonFromAiResponse<Record<string, unknown>>(text);
  } catch (err) {
    if (err instanceof AiJsonParseError) return jsonError(err.message, 502);
    throw err;
  }

  if (siteId) {
    await supabase
      .from("sites")
      .update({
        style_guide: generated.styleGuide,
        sitemap: (generated.sitemap as Record<string, unknown>[] | undefined)?.map((p: Record<string, unknown>, i: number) => ({
          id: `page-${i}`,
          slug: p.slug,
          title: p.title,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
        })),
      })
      .eq("id", siteId);
  }

  return json(generated);
});
