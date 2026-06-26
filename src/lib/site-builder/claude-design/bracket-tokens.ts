/**
 * Deterministic, bracket-aware variable detection for Claude Design templates.
 *
 * Claude Design exports mark company-specific spots with `[Bracketed text]`
 * placeholders (e.g. `[Nom de l'entreprise]`, `[XX XX XX XX XX]`, `[N° et rue]`)
 * rather than the `{{ entreprise.* }}` tokens the renderer resolves. This module
 * finds those brackets, suggests the matching variable token, and applies a
 * (possibly user-corrected) mapping — replacing each literal `[...]` with a
 * `{{ entreprise.* }}` token that `wrap-raw-html.ts` resolves per company.
 *
 * It complements `tokenize-design.ts` (the optional AI pass) but is pure,
 * deterministic and unit-testable — no model call, no network.
 */

/** A `{{ entreprise.* }}` token (spaced form, matches the raw-wrapper regex). */
export interface BracketSuggestion {
  token: string;
  label: string;
}

/**
 * Maps the normalised inner text of a `[…]` placeholder to a variable token.
 * Only unambiguous placeholders get a suggestion; ambiguous numeric ones
 * (`[XX]`, `[XXX]`) are left for the review UI to disambiguate.
 */
const SUGGESTION_MAP: Record<string, BracketSuggestion> = {
  "nom de l'entreprise": { token: "{{ entreprise.nom }}", label: "Nom de l'entreprise" },
  "xx xx xx xx xx": { token: "{{ entreprise.telephone }}", label: "Téléphone" },
  "n° et rue": { token: "{{ entreprise.adresse }}", label: "Adresse" },
  "no et rue": { token: "{{ entreprise.adresse }}", label: "Adresse" },
  "xxx xxx xxx xxxxx": { token: "{{ entreprise.siret }}", label: "SIRET" },
  "prénom": { token: "{{ entreprise.fondateur }}", label: "Prénom du fondateur" },
  "prenom": { token: "{{ entreprise.fondateur }}", label: "Prénom du fondateur" },
  "entreprise": { token: "{{ entreprise.email_domain }}", label: "Domaine email" },
  "aco": { token: "{{ entreprise.attestation_fluides }}", label: "Attestation fluides" },
};

export interface BracketToken {
  /** The exact literal as it appears in the HTML, e.g. "[Nom de l'entreprise]". */
  find: string;
  /** Suggested `{{ entreprise.* }}` token, or null when ambiguous. */
  suggestedToken: string | null;
  /** Human label for the review UI. */
  label: string;
  /** Number of occurrences in the HTML. */
  count: number;
}

const BRACKET_RE = /\[([^\]\n]+)\]/g;

function normalize(inner: string): string {
  return inner.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Escape a string for use as a literal in a global RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds every distinct `[…]` placeholder with its occurrence count and a
 * best-effort suggested token. Already-tokenised text (`{{ … }}`) is ignored.
 */
export function detectBracketTokens(html: string): BracketToken[] {
  const counts = new Map<string, number>();
  BRACKET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BRACKET_RE.exec(html)) !== null) {
    const find = m[0];
    counts.set(find, (counts.get(find) ?? 0) + 1);
  }

  const out: BracketToken[] = [];
  for (const [find, count] of counts) {
    const inner = find.slice(1, -1);
    const suggestion = SUGGESTION_MAP[normalize(inner)] ?? null;
    out.push({
      find,
      suggestedToken: suggestion?.token ?? null,
      label: suggestion?.label ?? inner.trim(),
      count,
    });
  }
  // Stable order: most frequent first, then alphabetical.
  out.sort((a, b) => b.count - a.count || a.find.localeCompare(b.find));
  return out;
}

export interface BracketMappingEntry {
  /** The literal `[…]` to replace. */
  find: string;
  /** The chosen `{{ entreprise.* }}` token. */
  token: string;
  label: string;
}

export interface ApplyResult {
  html: string;
  applied: Array<BracketMappingEntry & { count: number }>;
}

/**
 * Applies a bracket→token mapping to the HTML (all occurrences), reporting how
 * many of each were replaced. Entries with an empty token or no match are
 * skipped. Pure.
 */
export function applyBracketTokens(html: string, mapping: BracketMappingEntry[]): ApplyResult {
  let out = html;
  const applied: Array<BracketMappingEntry & { count: number }> = [];
  for (const entry of mapping) {
    if (!entry.find || !entry.token) continue;
    const re = new RegExp(escapeRegExp(entry.find), "g");
    const count = (out.match(re) ?? []).length;
    if (count === 0) continue;
    out = out.replace(re, entry.token);
    applied.push({ ...entry, count });
  }
  return { html: out, applied };
}

/**
 * Builds a default mapping (only entries that have a suggested token) so the
 * importer can tokenise without user input; the review UI can still correct it.
 */
export function defaultMappingFromTokens(tokens: BracketToken[]): BracketMappingEntry[] {
  return tokens
    .filter((t): t is BracketToken & { suggestedToken: string } => t.suggestedToken !== null)
    .map((t) => ({ find: t.find, token: t.suggestedToken, label: t.label }));
}

/** Unbracketed identity strings sometimes hardcoded in a template (off by default). */
export interface IdentityCandidate {
  find: string;
  token: string;
  label: string;
  count: number;
}

const IDENTITY_CANDIDATES: Array<Omit<IdentityCandidate, "count">> = [
  { find: "Annecy", token: "{{ entreprise.ville }}", label: "Ville" },
  { find: "74000", token: "{{ entreprise.code_postal }}", label: "Code postal" },
];

/**
 * Detects known hardcoded identity strings (city / postal code) so the review
 * UI can offer them as optional replacements. Disabled by default in the UI to
 * avoid false positives.
 */
export function detectIdentityStrings(html: string): IdentityCandidate[] {
  const out: IdentityCandidate[] = [];
  for (const cand of IDENTITY_CANDIDATES) {
    const re = new RegExp(escapeRegExp(cand.find), "g");
    const count = (html.match(re) ?? []).length;
    if (count > 0) out.push({ ...cand, count });
  }
  return out;
}
