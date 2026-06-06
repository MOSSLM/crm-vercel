import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AiJsonParseError, extractJsonFromAiResponse } from "@/lib/parsers/ai-json";
import { buildSectionsPromptDoc } from "@/lib/ai/schema-prompt-doc";

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

  // Section schema reference (content keys per section type), filtered to the
  // types actually available so the prompt stays compact and relevant.
  const typeSet = new Set((availableSectionIds ?? []).map((s) => s.type).filter(Boolean));
  const schemaDoc = buildSectionsPromptDoc(typeSet);

  // Media library: give the AI real image URLs it can drop into image fields.
  let mediaHint = "";
  try {
    type MediaRow = { public_url?: string; alt_text?: string | null; service_tags?: unknown; match_count?: number; is_universal?: boolean };
    let media: MediaRow[] = [];
    if (enterpriseId) {
      const { data } = await supabase.rpc("media_library_by_company", { p_entreprise_id: enterpriseId });
      const ranked = (data ?? []) as MediaRow[];
      const suggested = ranked.filter((r) => (r.match_count ?? 0) > 0 || r.is_universal);
      media = (suggested.length > 0 ? suggested : ranked).slice(0, 24);
    } else {
      const { data } = await supabase
        .from("media_library")
        .select("public_url, alt_text, service_tags")
        .limit(24);
      media = (data ?? []) as MediaRow[];
    }
    const list = media
      .filter((m) => typeof m.public_url === "string" && m.public_url)
      .map((m) => ({
        url: m.public_url as string,
        tags: Array.isArray(m.service_tags) ? (m.service_tags as string[]).slice(0, 4) : [],
        alt: m.alt_text ?? "",
      }));
    if (list.length > 0) {
      mediaHint = `\n\nIMAGES DISPONIBLES (médiathèque) — pour tout champ image, choisis une URL EXACTE de cette liste correspondant au service/au contenu (sinon laisse le champ vide) :\n${JSON.stringify(list)}`;
    }
  } catch {
    // media is best-effort; ignore failures
  }

  const variableHint = variableContext && Object.keys(variableContext).length > 0
    ? `\nVARIABLES DISPONIBLES — utilise ces tokens exacts pour les données d'entreprise dans le contenu :\n${
        Object.entries(variableContext)
          .filter(([k]) => !k.startsWith("company."))
          .map(([k, v]) => `  {{ ${k} }} → "${v}"`)
          .join("\n")
      }\nExemple : écris "{{ entreprise.nom }}" au lieu du nom réel de l'entreprise.`
    : "";

  const schemaHint = schemaDoc
    ? `\n\nRÉFÉRENCE DES SECTIONS (clés de contenu par type) — le section_id doit venir de la liste fournie ; son "type" correspond à un bloc ci-dessous, dont les clés indiquent EXACTEMENT quoi mettre dans "content" :\n${schemaDoc}`
    : "";

  const systemPrompt = `Tu es un expert en création de sites web professionnels.
Tu génères des configurations de sites complets en JSON pour un système de builder.
Tu dois choisir les meilleures sections de la bibliothèque disponible et écrire du contenu professionnel en français.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.${variableHint}${schemaHint}`;

  const userPrompt = `
Description de l'entreprise :
${description}

${enterpriseInfo}

Pages souhaitées : ${Array.isArray(pages) ? pages.join(", ") : pages}

Sections disponibles dans la bibliothèque :
${sectionsListJson}${mediaHint}

Génère un sitemap complet, COHÉRENT et à PLUSIEURS NIVEAUX, avec le contenu de chaque page.
Pour chaque page, choisis 3-6 sections pertinentes parmi celles disponibles et remplis leur contenu.
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
      "service_tag": null,
      "sections": [
        {
          "section_id": "<id exact de la section>",
          "service_tag": null,
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
- Utilise UNIQUEMENT les IDs de sections fournis dans la liste (champ "section_id").
- Remplis "content" avec les clés EXACTES documentées pour le type de la section
  (voir la référence des sections). Écris en français, style professionnel.
- Pour les champs image, n'utilise QUE des URLs de la liste IMAGES DISPONIBLES
  (choisis la plus pertinente par tags) ; sinon laisse le champ vide.
- Si des variables sont disponibles, utilise les tokens {{ entreprise.* }} pour les
  données dynamiques (nom, téléphone, ville…).
- Adapte le style guide aux couleurs de l'entreprise si pertinent.
- HIÉRARCHIE MULTI-NIVEAUX : les "slug" sont des chemins. Crée une page catégorie
  parente (ex: "/services") ET une page enfant par service précis
  (ex: "/services/climatisation", "/services/chauffage", "/services/pac"). Les
  enfants doivent partager le préfixe du parent.
- TAGS SERVICE : pour une page (ou une section) dédiée à un service précis,
  renseigne "service_tag" avec le tag EXACT du service (ex: "climatisation").
  Mets null pour le contenu générique affiché partout. Cela permet de masquer
  automatiquement ce contenu pour les entreprises qui n'offrent pas ce service.
- Chaque page DOIT avoir au moins une section. Ne crée jamais de page vide
  (une page sans section n'est pas publiée).
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
          service_tag: p.service_tag ?? null,
        })),
      })
      .eq("id", siteId);
  }

  return json(generated);
});
