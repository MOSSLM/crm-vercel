import { listThemes } from "@/templates/index";

export interface ThemeGenerationInput {
  url: string;
  themeName?: string;
  themeSlug?: string;
}

export interface GeneratedThemeResult {
  slug: string;
  name: string;
  description: string;
  config: {
    slug: string;
    name: string;
    description: string;
    sections: Array<{
      type: string;
      label: string;
      description: string;
      defaultData: Record<string, unknown>;
    }>;
    globalVariables: {
      colors: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
      };
      fonts: { heading: string; body: string };
      buttons?: { borderRadius?: string; style?: string };
      spacing?: { sectionPadding?: string };
    };
    enterpriseVariables: string[];
  };
  preview_image_url: string | null;
}

// Fetch the HTML of a page (server-side)
async function fetchPageHTML(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SamaCRM-ThemeBot/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return html.slice(0, 50000); // Limit to 50KB
  } finally {
    clearTimeout(timeout);
  }
}

// Extract key style signals from HTML without a DOM parser
function extractStyleSignals(html: string): {
  colors: string[];
  fonts: string[];
  sections: string[];
  hasHero: boolean;
  hasNav: boolean;
  hasFooter: boolean;
} {
  // Extract hex colors from inline styles
  const colorMatches = html.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const colors = [...new Set(colorMatches)].slice(0, 20);

  // Extract font family names
  const fontMatches = html.match(/font-family:\s*['"]?([^'",;]+)/gi) ?? [];
  const googleFontMatches = html.match(/fonts\.googleapis\.com\/css[^"']*family=([^"'&]+)/gi) ?? [];
  const fonts = [
    ...fontMatches.map((m) => m.replace(/font-family:\s*['"]?/i, "").trim()),
    ...googleFontMatches.map((m) => decodeURIComponent(m.split("family=")[1] ?? "").replace(/\+/g, " ").split(":")[0]),
  ].filter(Boolean).slice(0, 5);

  // Detect section-like patterns
  const hasHero = /<(section|div)[^>]*(hero|banner|header|jumbotron)/i.test(html);
  const hasNav = /<(nav|header)[^>]*>/i.test(html);
  const hasFooter = /<footer[^>]*>/i.test(html);

  const sections: string[] = [];
  if (/<(section|div)[^>]*(service|feature|offer)/i.test(html)) sections.push("services");
  if (/<(section|div)[^>]*(about|team|who)/i.test(html)) sections.push("about");
  if (/<(section|div)[^>]*(testimonial|review|avis)/i.test(html)) sections.push("testimonials");
  if (/<(section|div)[^>]*(contact|form|reach)/i.test(html)) sections.push("contact");
  if (/<(section|div)[^>]*(faq|question|accordion)/i.test(html)) sections.push("faq");
  if (/<(section|div)[^>]*(gallery|portfolio|work|project)/i.test(html)) sections.push("gallery");
  if (/<(section|div)[^>]*(blog|news|article|post)/i.test(html)) sections.push("blog");
  if (/<(section|div)[^>]*(cta|call.to.action|banner)/i.test(html)) sections.push("cta-banner");

  return { colors, fonts, sections, hasHero, hasNav, hasFooter };
}

export async function generateThemeFromUrl(input: ThemeGenerationInput): Promise<GeneratedThemeResult> {
  const { url, themeName, themeSlug } = input;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configuré");

  // Fetch source page
  let html = "";
  let fetchError: string | null = null;
  try {
    html = await fetchPageHTML(url);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Impossible de fetcher la page";
  }

  const signals = html ? extractStyleSignals(html) : null;

  // Available sections from existing themes
  const availableSections = listThemes().flatMap((t) =>
    t.sections.map((s) => ({ type: s.type, label: s.label, description: s.description ?? "" }))
  );
  const uniqueSections = [...new Map(availableSections.map((s) => [s.type, s])).values()];

  const systemPrompt = `Tu es un expert en design web et en thèmes de site. Tu génères des configurations de thèmes JSON pour un CRM de création de sites web.

Les sections disponibles dans le système sont :
${uniqueSections.map((s) => `- type: "${s.type}" — ${s.label}: ${s.description}`).join("\n")}

Tu dois retourner UNIQUEMENT du JSON valide, sans markdown, sans explication, sans balise code.

Structure attendue :
{
  "slug": "mon-theme",
  "name": "Mon Thème",
  "description": "Description courte",
  "config": {
    "slug": "mon-theme",
    "name": "Mon Thème",
    "description": "Description courte",
    "sections": [
      {
        "type": "hero",
        "label": "En-tête",
        "description": "...",
        "defaultData": {
          "title": "Titre principal",
          "subtitle": "Sous-titre",
          "cta": { "text": "Découvrir", "href": "#contact" },
          "settings": {}
        }
      }
    ],
    "globalVariables": {
      "colors": {
        "primary": "#hexcolor",
        "secondary": "#hexcolor",
        "accent": "#hexcolor",
        "background": "#hexcolor",
        "text": "#hexcolor"
      },
      "fonts": { "heading": "Inter", "body": "Inter" },
      "buttons": { "borderRadius": "8px", "style": "filled" },
      "spacing": { "sectionPadding": "80px" }
    },
    "enterpriseVariables": ["entreprise.nom", "entreprise.telephone", "entreprise.email", "entreprise.adresse"]
  },
  "preview_image_url": null
}`;

  const userMessage = `URL analysée : ${url}
${fetchError ? `Note: Impossible de fetcher la page (${fetchError}), génère un thème générique adapté à l'URL.` : ""}
${signals ? `
Signaux extraits de la page :
- Couleurs détectées : ${signals.colors.slice(0, 8).join(", ") || "aucune"}
- Polices détectées : ${signals.fonts.join(", ") || "aucune"}
- Sections détectées : ${signals.hasHero ? "hero, " : ""}${signals.sections.join(", ") || "aucune"}
- Navigation : ${signals.hasNav ? "oui" : "non"}
- Footer : ${signals.hasFooter ? "oui" : "non"}
` : ""}
${themeName ? `Nom du thème souhaité : ${themeName}` : ""}
${themeSlug ? `Slug souhaité : ${themeSlug}` : ""}

Génère un thème adapté à ce site. Choisis les sections les plus pertinentes parmi celles disponibles (entre 4 et 8 sections). Adapte les couleurs primaires/secondaires aux couleurs détectées. Si aucune couleur n'est détectée, choisis une palette professionnelle adaptée au secteur apparent de l'URL. Génère des defaultData réalistes pour chaque section.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
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
    throw new Error(`Anthropic API error: ${err}`);
  }

  const result = await response.json();
  const rawText: string = result.content?.[0]?.text ?? "";

  // Extract JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Le modèle n'a pas retourné de JSON valide");

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedThemeResult;
  return parsed;
}
