import { readFileSync } from "fs";
import { join } from "path";
import type { SiteConfig } from "@/types";
import type { CompanyLite } from "@/utils/leadMagnetV2Api";
import { resolvePromptTemplate } from "./schema-prompt-doc";

interface GeneratorInput {
  company: CompanyLite;
  themeSlug?: string;
  additionalContext?: string;
}

// Reads the system prompt template from disk and injects the dynamic
// section reference derived from SECTION_SCHEMAS.
function getSystemPrompt(): string {
  const promptPath = join(process.cwd(), "src/lib/ai/prompts/system-config-generator.txt");
  const template = readFileSync(promptPath, "utf-8");
  return resolvePromptTemplate(template);
}

export async function generateSiteConfig(input: GeneratorInput): Promise<SiteConfig> {
  const { company, themeSlug = "theme-default", additionalContext } = input;

  const systemPrompt = getSystemPrompt();

  const userMessage = `
Entreprise : ${company.name ?? "Inconnue"}
Secteur / Tags : ${Array.isArray(company.service_tags) ? company.service_tags.join(", ") : "Non précisé"}
Ville : ${company.ville ?? "Non précisée"}
Note Google : ${company.note_moyenne ?? "N/A"} (${company.nombre_avis ?? 0} avis)
Téléphone : ${company.telephone ?? "Non précisé"}
Thème demandé : ${themeSlug}
${additionalContext ? `Contexte additionnel : ${additionalContext}` : ""}

Génère la configuration JSON du site pour cette entreprise.
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
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? "";

  // Extract JSON from response (handles potential preamble)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Aucun JSON trouvé dans la réponse de l'IA");

  const config = JSON.parse(jsonMatch[0]) as SiteConfig;
  return config;
}
