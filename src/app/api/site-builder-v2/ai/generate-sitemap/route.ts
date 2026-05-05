import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

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
  pages: string[];
  availableSectionIds: SectionRef[];
}

export async function POST(req: Request) {
  const supabase = getSupabaseServiceClient();
  try {
    const body = (await req.json()) as GenerateRequest;
    const { siteId, enterpriseId, description, pages, availableSectionIds } = body;

    if (!description?.trim()) {
      return NextResponse.json({ error: "description requis" }, { status: 400 });
    }

    // Fetch enterprise data if available
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

    const sectionsListJson = JSON.stringify(availableSectionIds.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      category: s.category,
    })));

    const systemPrompt = `Tu es un expert en création de sites web professionnels.
Tu génères des configurations de sites complets en JSON pour un système de builder.
Tu dois choisir les meilleures sections de la bibliothèque disponible et écrire du contenu professionnel en français.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.`;

    const userPrompt = `
Description de l'entreprise :
${description}

${enterpriseInfo}

Pages souhaitées : ${pages.join(", ")}

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
- Le contenu doit remplir les clés correspondant aux placeholders {{clé}} des sections
- Écris en français, style professionnel et convaincant
- Adapte le style guide aux couleurs de l'entreprise si pertinent
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
        max_tokens: 8192,
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

    const generated = JSON.parse(jsonMatch[0]);

    // Persist the style_guide and sitemap to the site
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
