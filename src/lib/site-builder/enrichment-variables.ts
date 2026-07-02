/**
 * Variables issues de l'enrichissement automatique (`automated_enrichment`)
 * et variables dérivées (département/région depuis le code postal, téléphone
 * normalisé pour les liens `tel:`, domaine email).
 *
 * Partagé par les deux résolveurs :
 *  - src/lib/site-builder/resolve-variables.ts (publish + rendu public)
 *  - /api/site-builder/variables (preview éditeur)
 *
 * Règle de précédence : tout ici est un COMPLÉMENT — une variable déjà
 * renseignée (entreprises, overrides projet, variables manuelles) n'est
 * jamais écrasée (`fillIfEmpty`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { geoFromCodePostal } from "./geo-fr";

export interface EnrichmentSlice {
  areas_served: unknown;
  years_in_business: number | null;
  founded_year: number | null;
  opening_hours: unknown;
}

/** Dernière ligne d'enrichissement de l'entreprise, ou null (table/ligne absente). */
export async function fetchEnrichmentSlice(
  supabase: SupabaseClient,
  enterpriseId: number,
): Promise<EnrichmentSlice | null> {
  const { data, error } = await supabase
    .from("automated_enrichment")
    .select("areas_served, years_in_business, founded_year, opening_hours")
    .eq("entreprise_id", enterpriseId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as EnrichmentSlice | null) ?? null;
}

/** JSON array of strings → readable list; anything else → "". */
function toReadableList(value: unknown, max = 15): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, max)
    .map((v) => v.trim())
    .join(", ");
}

/** Horaires : accepte une chaîne ou un tableau de chaînes, sinon "". */
function toReadableHours(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join(" · ");
  }
  return "";
}

function fillIfEmpty(vars: Record<string, string>, key: string, value: string): void {
  if (!value) return;
  const current = vars[key];
  if (current === undefined || current === "") vars[key] = value;
}

/**
 * Complète la map de variables avec les données d'enrichissement :
 * `entreprise.zones_desservies`, `entreprise.annee_experience` (via
 * years_in_business, sinon dérivée de founded_year) et un repli pour
 * `entreprise.horaires`. Mutation en place, valeurs existantes préservées.
 */
export function applyEnrichmentVariables(
  vars: Record<string, string>,
  slice: EnrichmentSlice | null,
  currentYear: number = new Date().getFullYear(),
): void {
  if (!slice) return;

  fillIfEmpty(vars, "entreprise.zones_desservies", toReadableList(slice.areas_served));

  const years =
    typeof slice.years_in_business === "number" && slice.years_in_business > 0
      ? slice.years_in_business
      : typeof slice.founded_year === "number" && slice.founded_year > 1800 && slice.founded_year <= currentYear
        ? currentYear - slice.founded_year
        : null;
  if (years !== null) fillIfEmpty(vars, "entreprise.annee_experience", String(years));

  fillIfEmpty(vars, "entreprise.horaires", toReadableHours(slice.opening_hours));
}

/**
 * Variables dérivées d'autres variables déjà résolues :
 *  - `entreprise.departement` / `entreprise.region` depuis le code postal
 *  - `entreprise.telephone_lien` (chiffres seuls, `+` conservé) pour `href="tel:…"`
 *  - `entreprise.email_domain` depuis l'email
 * Mutation en place, valeurs existantes préservées.
 */
export function applyDerivedVariables(vars: Record<string, string>): void {
  const geo = geoFromCodePostal(vars["entreprise.code_postal"]);
  if (geo) {
    fillIfEmpty(vars, "entreprise.departement", geo.departement);
    fillIfEmpty(vars, "entreprise.region", geo.region);
  }

  const phone = vars["entreprise.telephone"] ?? "";
  const phoneLink = (phone.startsWith("+") ? "+" : "") + phone.replace(/\D/g, "");
  if (phoneLink.replace(/\D/g, "").length >= 6) {
    fillIfEmpty(vars, "entreprise.telephone_lien", phoneLink);
  }

  const email = vars["entreprise.email"] ?? "";
  if (email.includes("@")) {
    fillIfEmpty(vars, "entreprise.email_domain", email.slice(email.indexOf("@") + 1));
  }
}
