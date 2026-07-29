/**
 * Provenance des variables d'une entreprise, transportée dans la clé `__source`
 * de la map renvoyée par `/api/site-builder/variables`.
 *
 * Sans elle, un chiffre clé vide dans le builder est indiscernable d'un chiffre
 * clé absent en base : l'opérateur n'a aucun moyen de savoir si c'est la fiche
 * qui n'est pas remplie, ou le site qui lit le mauvais projet. Le panneau
 * « Diagnostic » affiche ces quatre champs pour rendre la réponse immédiate.
 *
 * Isomorphe (aucune dépendance serveur) : la route l'écrit, le builder le lit.
 */
/**
 * Comment le projet lead magnet a été choisi. Défini ici (module isomorphe) et
 * non dans `resolve-project-id.ts`, qui est `server-only` : le builder doit
 * pouvoir lire cette provenance côté client.
 */
export type ProjectSource = "explicit" | "site" | "ranked" | "none";

/** D'où viennent les chiffres clés, dans l'ordre de priorité du résolveur. */
export type StatsSource = "project" | "site_overrides" | "entreprise" | "none";

export interface VariablesSource {
  /** Projet lead magnet effectivement lu. */
  projectId: string | null;
  /** Comment il a été choisi. */
  projectSource: ProjectSource;
  /** Nombre de projets rattachés à l'entreprise (une ligne par opportunité). */
  candidates: number;
  statsSource: StatsSource;
}

/** Clé réservée dans la map de variables. */
export const VARIABLES_SOURCE_KEY = "__source";

/** Lit `__source` d'une map de variables. Tolérant : null si absent ou illisible. */
export function parseVariablesSource(
  variables: Record<string, string> | null | undefined,
): VariablesSource | null {
  const raw = variables?.[VARIABLES_SOURCE_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VariablesSource>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      projectSource: (parsed.projectSource ?? "none") as ProjectSource,
      candidates: typeof parsed.candidates === "number" ? parsed.candidates : 0,
      statsSource: (parsed.statsSource ?? "none") as StatsSource,
    };
  } catch {
    return null;
  }
}

/** Phrase courte expliquant d'où vient le projet lu, pour l'inspecteur. */
export function describeProjectSource(source: VariablesSource): string {
  switch (source.projectSource) {
    case "explicit":
      return "projet imposé par l'éditeur";
    case "site":
      return source.candidates > 1
        ? `projet lié au site (${source.candidates} projets sur l'entreprise)`
        : "projet lié au site";
    case "ranked":
      return source.candidates > 1
        ? `aucun projet lié au site — choisi parmi ${source.candidates} (le plus avancé)`
        : "aucun projet lié au site — seul projet de l'entreprise";
    default:
      return "aucun projet lead magnet pour cette entreprise";
  }
}

/** Phrase courte expliquant d'où viennent les chiffres clés. */
export function describeStatsSource(source: VariablesSource): string {
  switch (source.statsSource) {
    case "project":
      return "chiffres clés : projet lead magnet";
    case "site_overrides":
      return "chiffres clés : overrides du site";
    case "entreprise":
      return "chiffres clés : fiche entreprise";
    default:
      return "chiffres clés : aucun (ni projet, ni overrides, ni fiche)";
  }
}
