import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA_SYSTEM_PROMPT = `Tu es un expert en génération de schémas JSON pour des sections web React.
À partir du code TSX d'une section, tu génères un objet JSON conforme à l'interface SectionSchema.

Interface SectionSchema :
{
  "name": string,              // Nom lisible de la section (ex: "Navbar principale")
  "description": string,       // Description courte du rôle de la section
  "category": "navigation" | "hero" | "content" | "social-proof" | "cta" | "contact" | "media" | "commerce" | "footer" | "misc",
  "settings": SectionField[]   // Tableau des champs éditables
}

Types de SectionField disponibles :
- { "type": "text", "id": "...", "label": "...", "default": "..." }
- { "type": "textarea", "id": "...", "label": "...", "default": "..." }
- { "type": "checkbox", "id": "...", "label": "...", "default": true|false }
- { "type": "select", "id": "...", "label": "...", "options": [{"value": "...", "label": "..."}], "default": "..." }
- { "type": "range", "id": "...", "label": "...", "min": 0, "max": 100, "step": 1, "unit": "px", "default": 50 }
- { "type": "color_scheme", "id": "...", "label": "...", "default": "default" }
- { "type": "image_picker", "id": "...", "label": "...", "default": "" }
- { "type": "page_link", "id": "...", "label": "...", "default": "/" }
- { "type": "form_picker", "id": "form_id", "label": "Formulaire lié", "filter_by_site_tags": true } — pour les sections qui intègrent un formulaire CRM
- { "type": "header", "content": "Titre de groupe" } — séparateur visuel, sans id

Chaque champ peut avoir "group": "content"|"layout"|"style" pour l'organiser dans les onglets du builder.

Règles :
- Ne génère QUE des champs qui correspondent à des variables ou props réellement utilisées dans le code (data.X ou tokens.X)
- L'id du champ doit correspondre exactement à la clé dans data ou tokens
- Utilise color_scheme pour les champs de sélection de thème/palette
- Les couleurs codées en dur dans le code → ne pas créer de champ (elles viennent des CSS vars)
- Maximum 15 champs dans settings
- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explications`;

// POST /api/themes/[slug]/sections/[sectionId]/generate-schema
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; sectionId: string }> }
) {
  const { sectionId } = await params;

  let body: { code: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.code?.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const userMessage = `Section "${sectionId}" — code TSX :\n\`\`\`tsx\n${body.code}\n\`\`\`\n\nGénère le schéma JSON pour cette section.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SCHEMA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Strip markdown code fences if present
    const jsonStr = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let schema: unknown;
    try {
      schema = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "L'IA n'a pas retourné un JSON valide", raw },
        { status: 422 }
      );
    }

    return NextResponse.json({ schema });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur IA";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
