/**
 * Ce que la liste « Variables disponibles » de l'inspecteur doit afficher.
 *
 * Elle rendait `resolved || v.sample` : une valeur résolue VIDE est falsy, donc
 * l'échantillon du template (`15`, `1200`…) s'affichait à sa place. Une variable
 * non renseignée pour l'entreprise avait exactement l'air d'une variable
 * remplie — au point que le panneau Diagnostic (qui, lui, disait « vide »)
 * semblait se contredire.
 *
 * L'inspecteur n'a pas à embellir : quand une entreprise est appliquée, il
 * montre SA donnée, ou dit clairement qu'il n'y en a pas. L'échantillon n'a de
 * sens que hors entreprise, et doit alors être annoncé comme tel.
 *
 * Extrait du JSX pour être testable.
 */

export type VariableDisplayKind = "value" | "empty" | "sample";

export interface VariableDisplay {
  text: string;
  kind: VariableDisplayKind;
}

export function variableDisplay(
  resolved: string | undefined | null,
  sample: string,
  hasCompany: boolean,
): VariableDisplay {
  if (hasCompany) {
    const value = (resolved ?? "").trim();
    return value ? { text: value, kind: "value" } : { text: "vide", kind: "empty" };
  }
  const fallback = (sample ?? "").trim();
  return fallback ? { text: fallback, kind: "sample" } : { text: "—", kind: "sample" };
}
