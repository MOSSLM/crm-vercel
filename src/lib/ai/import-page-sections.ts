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
import { slimImportHtml, splitForConversion } from "./slim-import-html";

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
- FIDÉLITÉ ABSOLUE : conserve exactement le markup, les classes Tailwind et les styles inline d'origine. NE remplace PAS les couleurs/polices par des tokens/variables. Ne change pas la mise en page. SEULE EXCEPTION : les données d'identité de l'entreprise et les avis clients (voir « DONNÉES DYNAMIQUES » et « AVIS CLIENTS » ci-dessous).
- HTML → JSX valide : class→className, for→htmlFor, balises auto-fermantes (<img/>, <br/>, <input/>, <hr/>), style="..."→objet style={{ ... }} (camelCase), commentaires <!-- -->→{/* */}, attributs SVG en camelCase (stroke-width→strokeWidth, etc.).
- Un seul export default par section. Aucun import hormis 'react' implicite (n'écris PAS de ligne import). Pas de hooks nécessaires (sections présentationnelles). Pas de balises <html>/<head>/<body>.

DONNÉES DYNAMIQUES — adapter le site à l'entreprise (IMPORTANT)
La section reçoit en props variables (les données de l'entreprise liée) et data (le contenu injecté). Quand tu reconnais SANS AMBIGUÏTÉ une donnée d'IDENTITÉ de l'entreprise dans le HTML (logo, nom de l'entreprise, téléphone, email, adresse, ville, lien vers le site), lie-la à la variable correspondante en gardant TOUJOURS la valeur d'origine en REPLI (pour rester fidèle quand aucune entreprise n'est liée). Au moindre doute, garde la valeur en dur. Ne lie JAMAIS les titres marketing, slogans, ni descriptions de services.
- Variables disponibles : entreprise.nom, entreprise.logo_url, entreprise.telephone, entreprise.email, entreprise.adresse, entreprise.ville, entreprise.code_postal, entreprise.pays, entreprise.site_web.
- Accès en JSX uniquement via variables['entreprise.xxx'] avec repli || (n'utilise JAMAIS de tokens {{ }} ni de backticks).
- Nom : {variables['entreprise.nom'] || "Nom d'origine"}
- Logo : <img src={variables['entreprise.logo_url'] || "url-du-logo-d-origine"} alt={variables['entreprise.nom'] || "Nom d'origine"} ... /> (garde les mêmes className/attributs que l'original)
- Téléphone : <a href={"tel:" + (variables['entreprise.telephone'] || "0123456789")}>{variables['entreprise.telephone'] || "01 23 45 67 89"}</a>
- Email : <a href={"mailto:" + (variables['entreprise.email'] || "contact@exemple.fr")}>{variables['entreprise.email'] || "contact@exemple.fr"}</a>
- Adresse / ville : {variables['entreprise.adresse'] || "Adresse d'origine"} / {variables['entreprise.ville'] || "Ville d'origine"}
- Site web : <a href={variables['entreprise.site_web'] || "#"} ...>

AVIS CLIENTS — uniquement pour la catégorie testimonials (IMPORTANT)
Si (et SEULEMENT si) la section est une liste d'avis / témoignages clients (category: testimonials), rends les cartes en parcourant data.reviews — un tableau d'objets de forme { name, role, text, rating, avatar } — avec les avis d'origine du HTML en REPLI quand le tableau est vide :
  const avis = (Array.isArray(data.reviews) && data.reviews.length > 0) ? data.reviews : [/* reprends ici TOUS les avis d'origine du HTML, même forme : { name, role, text, rating, avatar } */];
Puis rends-les avec : {avis.map((a, i) => ( ... UNE carte d'origine servant de gabarit, en utilisant a.name, a.text, a.role, a.rating (ex: étoiles), et a.avatar pour l'image ... ))}
Conserve EXACTEMENT le markup et les classes d'UNE carte d'origine comme gabarit ; n'ajoute aucun style ni structure. Mets une key={i} sur chaque carte. Pour toutes les autres catégories, n'utilise PAS data.reviews.

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
 * Extract the page's CSS and external stylesheet <link> hrefs.
 *
 * Handles the common paste patterns:
 *  - inline `<style>` blocks;
 *  - the stylesheet's *raw contents* pasted outside the document (after
 *    `</html>` or before `<!doctype>`), NOT wrapped in <style> — frequent when
 *    a user copies the HTML and the CSS file separately;
 *  - absolute stylesheet <link>s (e.g. Google Fonts). Relative links like
 *    `assets/styles.css` are skipped — we can't fetch them.
 *
 * The captured CSS is suffixed with a small "static snapshot" override that
 * un-hides JS-gated reveal/animation classes (the imported page's scripts don't
 * run, so `.reveal { opacity: 0 }` would otherwise leave content invisible).
 */
export function extractPageAssets(html: string): { css: string; links: string[] } {
  const cssParts: string[] = [];

  // 1. Inline <style> blocks.
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html))) cssParts.push(m[1]);

  // 2. Raw CSS pasted outside the HTML document.
  const doc = html.match(/<(?:!doctype|html)\b[\s\S]*?<\/html\s*>/i);
  const outside = doc
    ? html.slice(0, doc.index ?? 0) + "\n" + html.slice((doc.index ?? 0) + doc[0].length)
    : /<(?:html|body|main|section|div|header|footer|nav)\b/i.test(html)
      ? ""
      : html;
  if (looksLikeCss(outside)) cssParts.push(outside);

  // 3. Absolute stylesheet <link>s only.
  const links: string[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html))) {
    const tag = lm[0];
    if (!/rel=["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && /^https?:\/\//i.test(href)) links.push(href);
  }

  let css = cssParts.join("\n").trim();
  if (css) css += "\n" + STATIC_SNAPSHOT_CSS;
  return { css, links: [...new Set(links)] };
}

/** Heuristic: does this text look like a CSS stylesheet (vs HTML/prose)? */
function looksLikeCss(s: string): boolean {
  const t = s.trim();
  if (t.length < 40) return false;
  if (/@media|@font-face|@keyframes|:root\b/i.test(t)) return true;
  const braces = (t.match(/\{/g) || []).length;
  return braces >= 3 && /[a-z-]+\s*:\s*[^;{}]+;/i.test(t);
}

// Imported pages are static snapshots — their scripts (scroll reveal, counters,
// menus) don't run. Force JS-gated "hidden until revealed" classes visible so
// content isn't stuck at opacity:0.
const STATIC_SNAPSHOT_CSS =
  ".reveal,[data-reveal],[data-aos],.fade-in,.fade-up,.fade-left,.fade-right,.animate,.animate-in,.will-reveal,.scroll-reveal{opacity:1 !important;transform:none !important;visibility:visible !important}";

/**
 * Static snapshot: animated counters (`<span data-counter="4200">0</span>`)
 * rely on JS to count up from 0. Without the script they'd show 0, so we set
 * the displayed text to the target value.
 */
function resolveStaticCounters(code: string): string {
  return code.replace(
    /(data-counter=["'](\d[\d.,]*)["'][^>]*>)\s*0[\d.,]*\s*(<)/gi,
    (_full, pre: string, num: string, post: string) => `${pre}${num}${post}`,
  );
}

/**
 * Make a converted section self-contained by re-attaching the page stylesheet,
 * so it renders identically in the editor iframe and the published site. Done
 * deterministically (no extra AI tokens): rename the model's default export to
 * a plain function and wrap it in a new default export that renders the
 * <link>/<style> before the section markup.
 */
function injectStyles(code: string, css: string, links: string[]): string {
  if (!css && links.length === 0) return code;
  const nameMatch = code.match(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/);
  if (!nameMatch) return code; // unexpected shape — leave as-is (Tailwind CDN may still cover it)
  const name = nameMatch[1];
  const inner = code.replace(/export\s+default\s+function\s+/g, "function ");
  const head = [
    ...links.map((href) => `      <link rel="stylesheet" href=${JSON.stringify(href)} />`),
    css ? `      <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(css)} }} />` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${inner}

export default function ${name}WithStyles(props: { tokens?: Record<string, string>; data?: Record<string, unknown>; variables?: Record<string, string> }) {
  return (
    <>
${head}
      <${name} {...props} />
    </>
  );
}
`;
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
/** Max slimmed-HTML length still converted in a single AI call. */
const SINGLE_CALL_MAX = 24000;
/** How many section chunks to convert in parallel for large pages. */
const CONVERSION_CONCURRENCY = 4;

/** Convert one HTML chunk (one or more sections) into parsed sections. */
async function convertChunk(
  htmlChunk: string,
  model: string,
  signal?: AbortSignal,
): Promise<ImportedSection[]> {
  const stream = anthropic.messages.stream(
    {
      model,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(htmlChunk) }],
    },
    signal ? { signal } : undefined,
  );
  const message = await stream.finalMessage();
  const raw = message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return parseImportedSections(raw);
}

export async function convertHtmlToSections(
  html: string,
  opts: { model?: string; signal?: AbortSignal; css?: string; links?: string[] } = {},
): Promise<ImportedSection[]> {
  const model = resolveImportModel(opts.model);

  // Strip non-structural bulk (inline CSS, scripts, triplicated responsive
  // variants, hydration JSON) before sending to the model. The page stylesheet
  // is captured + re-attached separately below, so this slashes token usage
  // without losing fidelity. Fall back to the raw HTML if slimming yields nothing.
  let aiHtml = html;
  try {
    const slim = slimImportHtml(html);
    if (slim.trim()) aiHtml = slim;
  } catch {
    /* keep raw html */
  }

  // A whole large page overflows a single response's token budget (and the
  // function timeout). Split it into section-sized chunks and convert them
  // concurrently, preserving document order. Small pages stay a single call.
  const chunks = aiHtml.length <= SINGLE_CALL_MAX ? [aiHtml] : splitForConversion(aiHtml);
  const results: ImportedSection[][] = new Array(chunks.length);
  let next = 0;
  const runWorker = async (): Promise<void> => {
    for (let i = next++; i < chunks.length; i = next++) {
      results[i] = await convertChunk(chunks[i], model, opts.signal);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONVERSION_CONCURRENCY, chunks.length) }, runWorker),
  );
  const sections = results.flat();

  // Re-attach the page's stylesheet so each section is self-contained and
  // renders faithfully (custom CSS classes, fonts) — not just Tailwind utilities.
  // The URL importer pre-extracts the stylesheet (the HTML it sends is already
  // stripped of <style>), so prefer caller-provided assets when present.
  const { css, links } =
    opts.css !== undefined || opts.links !== undefined
      ? { css: opts.css ?? "", links: opts.links ?? [] }
      : extractPageAssets(html);
  for (const s of sections) {
    s.code = resolveStaticCounters(s.code);
    if (css || links.length > 0) s.code = injectStyles(s.code, css, links);
  }
  return sections;
}
