import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RegeneratePageRequest {
  siteId: string;
  enterpriseId?: number;
  pageSlug: string;
  pageTitle: string;
  currentSections: Array<{ id: string; name: string; type?: string; description?: string }>;
  availableSectionTypes: string[];
  globalDescription?: string;
  context?: string;
  model?: string;
  provider?: "claude" | "openai";
}

async function callAI(
  provider: "claude" | "openai",
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096
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
  const supabase = getSupabaseServiceClient();
  try {
    const body = (await req.json()) as RegeneratePageRequest;
    const {
      siteId, enterpriseId, pageSlug, pageTitle,
      currentSections, availableSectionTypes,
      globalDescription = "", context = "",
      model = "claude-sonnet-4-6",
      provider = "claude",
    } = body;

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
Entreprise : ${ent.nom ?? ""} — ${ent.ville ?? ""}
Services : ${Array.isArray(ent.service_tags) ? ent.service_tags.join(", ") : ""}
Note Google : ${ent.note_moyenne ?? "N/A"} (${ent.nombre_avis ?? 0} avis)
`.trim();
      }
    }

    const systemPrompt = `Tu es un expert en création de sites web professionnels.
Tu génères le contenu d'une seule page d'un site web en JSON.
Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après.`;

    const userPrompt = `
Page à régénérer : "${pageTitle}" (slug: ${pageSlug})

${globalDescription ? `Description générale du site : ${globalDescription}` : ""}
${enterpriseInfo ? `\n${enterpriseInfo}` : ""}
${context ? `\nInstructions spécifiques pour cette page : ${context}` : ""}

Types de sections disponibles : ${availableSectionTypes.join(", ")}

${currentSections.length > 0 ? `Sections actuelles de la page : ${currentSections.map((s) => s.name).join(", ")}` : ""}

Génère 3 à 6 sections adaptées à cette page avec leur contenu.

Réponds avec ce format JSON exact :
{
  "sections": [
    { "id": "s1", "name": "Hero", "description": "Section hero de la page", "type": "hero-centered" }
  ],
  "instances": [
    {
      "pageSlug": "${pageSlug}",
      "sectionType": "hero-centered",
      "sortOrder": 0,
      "content": {
        "heading": "...",
        "subheading": "...",
        "body": "...",
        "cta_text": "..."
      }
    }
  ]
}

IMPORTANT : Écris uniquement en français, style professionnel.
`.trim();

    const text = await callAI(provider, model, systemPrompt, userPrompt, 4096);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Aucun JSON dans la réponse IA");

    const generated = JSON.parse(jsonMatch[0]);

    // Persist updated sitemap sections for this page
    if (siteId && generated.sections) {
      const { data: site } = await supabase.from("sites").select("sitemap").eq("id", siteId).single();
      if (site?.sitemap) {
        const updatedSitemap = (site.sitemap as Array<Record<string, unknown>>).map((p) => {
          if (p.slug === pageSlug) {
            return { ...p, sections: generated.sections };
          }
          return p;
        });
        await supabase.from("sites").update({ sitemap: updatedSitemap }).eq("id", siteId);
      }
    }

    return NextResponse.json(generated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
