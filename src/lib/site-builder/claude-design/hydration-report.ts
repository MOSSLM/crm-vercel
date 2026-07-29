/**
 * Diagnostic d'hydratation d'un design Claude.
 *
 * La substitution est un `variables[key] ?? ""` : un token mal orthographié, ou
 * dont la donnée manque, ne produit RIEN — pas d'erreur, pas de log, juste un
 * trou dans la page. Et l'aperçu sans entreprise ment, puisqu'il injecte des
 * valeurs d'exemple. Toute une classe de bugs (les chiffres clés en tête) ne se
 * découvrait donc qu'une fois le site déployé, à l'œil.
 *
 * Ce module rend cette classe visible : il scanne le markup d'une page, croise
 * chaque `{{ token }}` et chaque `[Crochet]` avec les variables réellement
 * résolues pour l'entreprise testée, et classe le résultat. Pur et testable —
 * le panneau du builder ne fait que l'afficher.
 */
import { CLAUDE_DESIGN_VARIABLES } from "./sample-variables";
import { VARIABLE_ALIASES } from "../variable-aliases";
import { detectBracketTokens } from "./bracket-tokens";

/** Gravité d'une entrée du rapport, la plus grave d'abord. */
export type HydrationSeverity = "unknown" | "empty" | "bracket" | "ok";

export interface HydrationFinding {
  /** Le token (`entreprise.nom`) ou le crochet littéral (`[Ville SEO]`). */
  name: string;
  severity: HydrationSeverity;
  /** Nombre d'occurrences dans la page. */
  count: number;
  /** Valeur résolue pour l'entreprise testée (vide ou absente ⇒ ""). */
  value: string;
  /** Message court, affichable tel quel. */
  hint: string;
}

export interface HydrationReport {
  findings: HydrationFinding[];
  /** Compteurs par gravité, pour la pastille du panneau. */
  unknown: number;
  empty: number;
  brackets: number;
}

/** Les clés qu'un design peut légitimement écrire : la liste de référence, ses
 *  alias tolérés, et les clés réellement présentes dans la map de l'entreprise. */
function knownKeys(variables: Record<string, string> | null): Set<string> {
  const keys = new Set<string>();
  for (const v of CLAUDE_DESIGN_VARIABLES) keys.add(v.token.replace(/\{\{\s*|\s*\}\}/g, ""));
  for (const alias of Object.keys(VARIABLE_ALIASES)) keys.add(alias);
  for (const k of Object.keys(variables ?? {})) if (!k.startsWith("__")) keys.add(k);
  return keys;
}

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Analyse une page.
 *
 * `variables` est la map résolue de l'entreprise testée, ou `null` quand aucune
 * entreprise n'est sélectionnée — dans ce cas on ne peut rien dire du
 * remplissage, seulement de l'orthographe des tokens et des crochets restants.
 */
export function buildHydrationReport(
  html: string,
  variables: Record<string, string> | null,
): HydrationReport {
  const findings: HydrationFinding[] = [];
  if (!html) return { findings, unknown: 0, empty: 0, brackets: 0 };

  const known = knownKeys(variables);

  // 1. Tokens {{ … }}
  const counts = new Map<string, number>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    const value = variables?.[key] ?? "";
    if (!known.has(key)) {
      findings.push({
        name: key,
        severity: "unknown",
        count,
        value: "",
        hint: "Token non reconnu — il s'affichera vide. Vérifie l'orthographe.",
      });
    } else if (variables && value === "") {
      findings.push({
        name: key,
        severity: "empty",
        count,
        value: "",
        hint: "Reconnu mais vide pour cette entreprise — à compléter dans la fiche.",
      });
    } else {
      findings.push({ name: key, severity: "ok", count, value, hint: "" });
    }
  }

  // 2. Crochets [ … ] restés littéraux après l'import : ils s'affichent tels quels.
  for (const bracket of detectBracketTokens(html)) {
    findings.push({
      name: bracket.find,
      severity: "bracket",
      count: bracket.count,
      value: "",
      hint: "Crochet non converti — il s'affichera littéralement sur le site.",
    });
  }

  const order: Record<HydrationSeverity, number> = { unknown: 0, empty: 1, bracket: 2, ok: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count || a.name.localeCompare(b.name));

  return {
    findings,
    unknown: findings.filter((f) => f.severity === "unknown").length,
    empty: findings.filter((f) => f.severity === "empty").length,
    brackets: findings.filter((f) => f.severity === "bracket").length,
  };
}

/** Fusionne les rapports de plusieurs pages (le design entier). */
export function mergeHydrationReports(
  pages: Array<{ slug: string; report: HydrationReport }>,
): { unknown: number; empty: number; brackets: number } {
  return pages.reduce(
    (acc, p) => ({
      unknown: acc.unknown + p.report.unknown,
      empty: acc.empty + p.report.empty,
      brackets: acc.brackets + p.report.brackets,
    }),
    { unknown: 0, empty: 0, brackets: 0 },
  );
}
