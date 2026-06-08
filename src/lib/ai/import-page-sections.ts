/**
 * Convert a Claude/Figma-designed HTML page into faithful React TSX sections.
 *
 * The page is split into logical sections (honoring an optional import contract:
 * `data-section` / `data-page` / `data-service-tag` attributes) and each one is
 * adapted to a self-contained TSX component that renders EXACTLY as designed.
 * Sections are stored with render_mode='raw' so the builder imposes nothing.
 *
 * Output format uses plain-text delimiters rather than JSON, because embedding
 * full TSX (quotes, backticks, braces) inside JSON is the main cause of parse
 * failures. The delimiters are unambiguous and easy to split.
 */
import Anthropic from "@anthropic-ai/sdk";
import { slugify } from "@/lib/site-builder/slug";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const IMPORT_CATEGORIES = [
  "navbar", "headers", "heros", "features", "layouts", "about", "logos",
  "reassurance", "testimonials", "gallery", "faq", "cta", "footers", "misc",
] as const;

export interface ImportedSection {
  section_id: string;
  name: string;
  category: string;
  service_tag: string | null;
  code: string;
}

/** Models offered for import conversion (kept in sync with the UI dropdown). */
export const IMPORT_MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (rapide)" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7 (qualité supérieure)" },
] as const;

const IMPORT_MODEL_IDS = new Set<string>(IMPORT_MODEL_OPTIONS.map((m) => m.id));
const DEFAULT_IMPORT_MODEL = "claude-sonnet-4-6";

/** Validate a requested model against the allowlist; fall back to the default. */
export function resolveImportModel(model?: string | null): string {
  return model && IMPORT_MODEL_IDS.has(model) ? model : DEFAULT_IMPORT_MODEL;
}

const SYSTEM_PROMPT = `Tu convertis une page HTML/CSS (souvent générée avec Tailwind) en sections React TSX FIDÈLES, pour un site builder. Tu ne dois RIEN inventer ni embellir : tu reproduis le design tel quel.

DÉCOUPAGE
- Découpe la page en sections logiques (header/navbar, hero, features, à-propos, témoignages, galerie, faq, cta, footer, etc.).
- Si des éléments portent des attributs data-section (et éventuellement data-service-tag), utilise-les comme frontières de section et métadonnées. Sinon, découpe sur les balises <section>, <header>, <footer> ou les enfants directs de <main>/<body>.

CONVERSION (une section = un module TSX autonome)
- Structure imposée :
  interface Props { tokens?: Record<string, string>; data?: Record<string, unknown>; variables?: Record<string, string>; }
  export default function NomEnPascalCase({ tokens = {}, data = {}, variables = {} }: Props) { return ( <JSX/> ); }
- FIDÉLITÉ ABSOLUE : conserve exactement le markup, les classes Tailwind et les styles inline d'origine. NE remplace PAS les couleurs/polices par des tokens/variables. Ne change pas la mise en page.
- HTML → JSX valide : class→className, for→htmlFor, balises auto-fermantes (<img/>, <br/>, <input/>, <hr/>), style="..."→objet style={{ ... }} (camelCase), commentaires <!-- -->→{/* */}, attributs SVG en camelCase (stroke-width→strokeWidth, etc.).
- Un seul export default par section. Aucun import hormis 'react' implicite (n'écris PAS de ligne import). Pas de hooks nécessaires (sections présentationnelles). Pas de balises <html>/<head>/<body>.

SORTIE — réponds UNIQUEMENT avec une suite de blocs, sans aucun texte autour, au format EXACT :
@@@SECTION@@@
id: <identifiant-court-en-kebab-case>
name: <nom lisible court>
category: <une valeur parmi: navbar, headers, heros, features, layouts, about, logos, reassurance, testimonials, gallery, faq, cta, footers, misc>
service_tag: <laisse vide, ou la valeur de data-service-tag si présente>
@@@CODE@@@
<le code TSX complet de la section>
@@@END@@@

Répète ce bloc pour chaque section, dans l'ordre d'apparition dans la page.`;

function buildUserMessage(html: string): string {
  return `Voici le HTML de la page à convertir en sections TSX fidèles :\n\n${html}`;
}

/** Parse the delimiter-based AI output into structured sections. */
export function parseImportedSections(raw: string): ImportedSection[] {
  const out: ImportedSection[] = [];
  const blocks = raw.split("@@@SECTION@@@").slice(1);
  for (const block of blocks) {
    const codeSplit = block.split("@@@CODE@@@");
    if (codeSplit.length < 2) continue;
    const header = codeSplit[0];
    const code = codeSplit[1].split("@@@END@@@")[0].trim();
    if (!code) continue;

    const get = (key: string): string => {
      const m = header.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, "im"));
      return m ? m[1].trim() : "";
    };

    const name = get("name") || "Section";
    const idRaw = get("id") || name;
    const categoryRaw = get("category").toLowerCase();
    const serviceTag = get("service_tag");
    const sid = slugify(idRaw);

    out.push({
      section_id: sid === "untitled" ? `section-${out.length + 1}` : sid,
      name,
      category: (IMPORT_CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : "misc",
      service_tag: serviceTag ? serviceTag : null,
      code: stripCodeFences(code),
    });
  }
  return out;
}

/** Remove a wrapping ```tsx fence if the model added one despite instructions. */
function stripCodeFences(code: string): string {
  return code
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Run the AI conversion. Returns the faithful sections (raw render mode).
 * Throws on AI/transport errors (including abort); returns [] if the model
 * produced no parseable blocks.
 *
 * The request is STREAMED: converting a whole page into multiple full TSX
 * components is a long, high-`max_tokens` generation, and a non-streamed call
 * silently hits gateway/SDK timeouts. Streaming keeps the connection alive and
 * lets the caller bound it with an AbortSignal.
 */
export async function convertHtmlToSections(
  html: string,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<ImportedSection[]> {
  const model = resolveImportModel(opts.model);
  const stream = anthropic.messages.stream(
    {
      model,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(html) }],
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );
  const message = await stream.finalMessage();
  const raw = message.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  return parseImportedSections(raw);
}
