import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface GenerateRequest {
  siteId: string;
  enterpriseId?: number;
  description: string;
  pages: string;
  availableSectionTypes: string[];
  model?: string;
  provider?: "claude" | "openai";
}

async function callAI(
  provider: "claude" | "openai",
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192
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

  // Anthropic
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
  const supabase = getSupabaseServiceClient();
  try {
    const body = (await req.json()) as GenerateRequest;
    const {
      siteId, enterpriseId, description, pages,
      availableSectionTypes,
      model = "claude-sonnet-4-6",
      provider = "claude",
    } = body;

    if (!description?.trim()) {
      return NextResponse.json({ error: "description requis" }, { status: 400 });
    }

    // Fetch enterprise data if available
    let enterpriseInfo = "";
    if (enterpriseId) {
      const { data: ent } = await supabase
        .from("entreprises")
        .select("nom, ville, telephone, service_tags, note_moyenne, nombre_avis")
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

    const systemPrompt = `Tu es un expert en création de sites web professionnels.
Tu génères des configurations de sites complets en JSON pour un système de builder.
Tu dois choisir les meilleures sections parmi les types disponibles et écrire du contenu professionnel en français.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.`;

    const userPrompt = `
Description de l'entreprise :
${description}

${enterpriseInfo}

Pages souhaitées : ${pages}

Types de sections disponibles dans la bibliothèque :
${availableSectionTypes.join(", ")}

Génère un sitemap complet avec le contenu pour chaque page.
Pour chaque page, choisis 3-6 types de sections pertinentes parmi ceux disponibles.
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
        { "id": "s1", "name": "Hero", "description": "Section hero principale", "type": "hero-centered" }
      ]
    }
  ],
  "instances": [
    {
      "pageSlug": "/",
      "sectionType": "hero-centered",
      "sortOrder": 0,
      "content": {
        "heading": "...",
        "subheading": "...",
        "badge_text": "...",
        "cta_text": "...",
        "body": "..."
      }
    }
  ]
}

IMPORTANT:
- Utilise uniquement les types de sections fournis dans la liste
- Le contenu des instances doit contenir les clés textuelles principales (heading, subheading, body, cta_text, etc.)
- Écris en français, style professionnel et convaincant
- Adapte les couleurs du style guide à l'activité de l'entreprise
`.trim();

    const text = await callAI(provider, model, systemPrompt, userPrompt, 8192);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Aucun JSON dans la réponse IA");

    const generated = JSON.parse(jsonMatch[0]);

    // Persist style_guide and sitemap
    if (siteId) {
      await supabase
        .from("sites")
        .update({
          style_guide: generated.styleGuide,
          sitemap: generated.sitemap?.map((p: Record<string, unknown>, i: number) => ({
            id: `page-${i}`,
            slug: p.slug,
            title: p.title,
            metaTitle: p.metaTitle,
            metaDescription: p.metaDescription,
          })),
        })
        .eq("id", siteId);
    }

    return NextResponse.json(generated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
