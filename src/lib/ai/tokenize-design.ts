/**
 * AI variable tokenization for an imported "Claude design".
 *
 * Unlike import-page-sections.ts (which DECOMPOSES a page into TSX sections),
 * this keeps the page WHOLE. It only identifies the spots that are specific to
 * a company (identity data) and returns a small list of exact substrings to
 * replace with `{{ entreprise.* }}` tokens. The tokens are resolved per company
 * at render time by the whole-page wrapper (see wrap-raw-html.ts).
 *
 * The model returns replacements (not the whole HTML) so the output stays tiny
 * and robust; the replacement is applied deterministically server-side.
 */
import Anthropic from "@anthropic-ai/sdk";

// Lazily constructed so importing the pure helpers (applyReplacements) never
// instantiates the SDK client (which throws in browser-like/test envs).
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Variables the whole-page wrapper can resolve (from resolveEnterpriseVariables). */
export const TOKENIZABLE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: "{{ entreprise.nom }}", label: "Nom de l'entreprise" },
  { token: "{{ entreprise.telephone }}", label: "Téléphone" },
  { token: "{{ entreprise.telephone_lien }}", label: "Téléphone (lien tel:)" },
  { token: "{{ entreprise.email }}", label: "Email" },
  { token: "{{ entreprise.email_domain }}", label: "Domaine email" },
  { token: "{{ entreprise.adresse }}", label: "Adresse" },
  { token: "{{ entreprise.ville }}", label: "Ville" },
  { token: "{{ entreprise.code_postal }}", label: "Code postal" },
  { token: "{{ entreprise.region }}", label: "Région" },
  { token: "{{ entreprise.departement }}", label: "Département" },
  { token: "{{ entreprise.location }}", label: "Zone principale" },
  { token: "{{ entreprise.zones_desservies }}", label: "Zones desservies" },
  { token: "{{ entreprise.horaires }}", label: "Horaires" },
  { token: "{{ entreprise.logo_url }}", label: "Logo (URL)" },
  { token: "{{ entreprise.site_web_canonique }}", label: "Site web" },
  { token: "{{ entreprise.annee_experience }}", label: "Années d'expérience" },
  { token: "{{ entreprise.clients_count }}", label: "Nombre de clients" },
  { token: "{{ entreprise.installations }}", label: "Installations réalisées" },
  { token: "{{ entreprise.qualifications }}", label: "Qualifications (RGE…)" },
];

const ALLOWED_TOKENS = new Set(TOKENIZABLE_VARIABLES.map((v) => v.token));

export interface DesignReplacement {
  /** Exact substring as it appears in the HTML (text or attribute value). */
  find: string;
  /** One of the allowed `{{ entreprise.* }}` tokens. */
  token: string;
  /** Human label for the review UI. */
  label: string;
}

export interface TokenizeResult {
  /** HTML with the replacements applied. */
  html: string;
  /** Replacements that actually matched, with their occurrence count. */
  mapping: Array<DesignReplacement & { count: number }>;
}

/** Hard cap on HTML sent to the model (token budget). */
const MAX_HTML_CHARS = 90_000;

const SYSTEM_PROMPT = `Tu analyses le HTML d'un site web déjà conçu. Ton UNIQUE rôle : repérer les informations d'IDENTITÉ spécifiques à l'entreprise pour les rendre variables (le même design servira plusieurs entreprises).

Tu dois retourner les chaînes EXACTES à remplacer par une variable, et rien d'autre.

À VARIABILISER (uniquement si présent SANS AMBIGUÏTÉ) :
- Nom de l'entreprise → {{ entreprise.nom }}
- Numéro de téléphone → {{ entreprise.telephone }}
- Email de contact → {{ entreprise.email }}
- Adresse postale → {{ entreprise.adresse }}
- Ville → {{ entreprise.ville }}
- Code postal → {{ entreprise.code_postal }}
- URL du logo (valeur d'un src d'image de logo) → {{ entreprise.logo_url }}
- URL du site web de l'entreprise → {{ entreprise.site_web_canonique }}
- Horaires d'ouverture → {{ entreprise.horaires }}
- Liste de villes/zones d'intervention → {{ entreprise.zones_desservies }}

NE JAMAIS TOUCHER : titres marketing, slogans, descriptions de services, textes génériques, noms de menus, mentions légales génériques, libellés de boutons, icônes, classes CSS, URLs d'images décoratives/illustrations.

RÈGLES :
- "find" = la sous-chaîne EXACTE telle qu'elle apparaît dans le HTML (sans la reformater). Pour un téléphone affiché "01 23 45 67 89", find = "01 23 45 67 89" ; s'il est aussi dans href="tel:0123456789", ajoute une 2e entrée avec find = "0123456789" et token = {{ entreprise.telephone_lien }}.
- Préfère des chaînes précises et non ambiguës. En cas de doute, n'inclus pas l'entrée.
- N'invente jamais de valeur : "find" doit exister littéralement dans le HTML fourni.

Réponds UNIQUEMENT avec du JSON valide, sans texte autour, au format :
{"replacements":[{"find":"...","token":"{{ entreprise.nom }}","label":"Nom de l'entreprise"}]}`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Réponse IA non JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Escape a string for use as a literal in a global RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apply replacements to the HTML (all occurrences) and report match counts. */
export function applyReplacements(html: string, replacements: DesignReplacement[]): TokenizeResult {
  let out = html;
  const mapping: Array<DesignReplacement & { count: number }> = [];
  for (const r of replacements) {
    if (!r.find || !ALLOWED_TOKENS.has(r.token)) continue;
    // Avoid double-tokenizing and skip non-matching finds.
    if (r.find.includes("{{")) continue;
    const re = new RegExp(escapeRegExp(r.find), "g");
    const count = (out.match(re) ?? []).length;
    if (count === 0) continue;
    out = out.replace(re, r.token);
    mapping.push({ ...r, count });
  }
  return { html: out, mapping };
}

export interface TokenizeOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Runs the tokenization pass. Returns the tokenized HTML plus the mapping of
 * applied replacements (for the human review screen).
 */
export async function tokenizeDesign(html: string, opts: TokenizeOptions = {}): Promise<TokenizeResult> {
  const prompt = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;

  const res = await getClient().messages.create(
    {
      model: opts.model || DEFAULT_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `HTML du site :\n\n${prompt}` }],
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const parsed = extractJson(text) as { replacements?: unknown };
  const rawList = Array.isArray(parsed.replacements) ? parsed.replacements : [];

  const replacements: DesignReplacement[] = rawList
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.find === "string" && typeof r.token === "string" && ALLOWED_TOKENS.has(r.token as string))
    .map((r) => ({
      find: r.find as string,
      token: r.token as string,
      label:
        (typeof r.label === "string" && r.label) ||
        TOKENIZABLE_VARIABLES.find((v) => v.token === r.token)?.label ||
        "Variable",
    }));

  // Apply against the FULL html (prompt may have been truncated for the model).
  return applyReplacements(html, replacements);
}
