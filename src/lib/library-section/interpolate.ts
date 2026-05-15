/**
 * Variable interpolation helpers shared by:
 *  - Server SSR (LibrarySectionInline + apply-overrides-html)
 *  - Client hydrator (LibrarySectionHydrator)
 *  - Editor iframe (LibrarySectionIframe injected script — JS-only mirror)
 *
 * A library section may reference variables in two ways:
 *  1. Hardcoded `{{ entreprise.nom }}` in its JSX (handled by DOM walker
 *     post-render — see apply-overrides-html / iframe applicator).
 *  2. As placeholder strings inside data fields (e.g.
 *     `data.headline = "Bienvenue chez {{ entreprise.nom }}"`). These must
 *     be resolved BEFORE passing data to the component so React renders the
 *     resolved text directly.
 */

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function interpolateString(text: string, variables: Record<string, string>): string {
  if (typeof text !== "string" || !text) return text;
  if (text.indexOf("{{") === -1) return text;
  return text.replace(TOKEN_RE, (_, key) => {
    const v = variables[key];
    return v != null ? v : "";
  });
}

/** Recursively interpolates `{{ var }}` tokens in every string field of
 *  the given data tree. Non-string values are passed through unchanged. */
export function interpolateData<T>(value: T, variables: Record<string, string>): T {
  if (typeof value === "string") {
    return interpolateString(value, variables) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateData(v, variables)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = interpolateData((value as Record<string, unknown>)[k], variables);
    }
    return out as unknown as T;
  }
  return value;
}
