/**
 * Passe finale commune aux DEUX résolveurs de variables d'entreprise :
 *   - `resolve-variables.ts`            → publication + rendu du site public
 *   - `/api/site-builder/variables`     → aperçu de l'éditeur
 *
 * Les deux construisent la même map depuis des entrées différentes (une ligne
 * `sites` d'un côté, des paramètres de requête de l'autre), et avaient fini par
 * diverger : `entreprise.pays`, `entreprise.site_web` et les dix alias
 * `company.*` n'existaient que côté aperçu. Résultat, la classe de bug la plus
 * pénible du builder — « ça marche dans l'éditeur, c'est vide une fois
 * déployé ». Même leçon que `city-variables.ts` pour la ville SEO.
 *
 * Tout ce qui est DÉRIVABLE de la map elle-même vit donc ici, et les deux
 * résolveurs terminent par `finalizeEnterpriseVariables`.
 */
import { applyStatVariables } from "./stats-variables";
import { applyVariableAliases } from "./variable-aliases";
import type { StatItem } from "./menu-overrides";

function fillIfEmpty(vars: Record<string, string>, key: string, value: string): void {
  if (!value) return;
  if (vars[key] === undefined || vars[key] === "") vars[key] = value;
}

/**
 * Famille `company.*` : les alias anglais que certains templates historiques
 * utilisent encore. Entièrement dérivés des clés `entreprise.*`, donc toujours
 * cohérents avec elles.
 */
export function applyCompanyAliases(vars: Record<string, string>): void {
  const nom = vars["entreprise.nom"] ?? "";
  const ville = vars["entreprise.ville"] ?? "";
  const adresse = vars["entreprise.adresse"] ?? "";
  const site = vars["entreprise.site_web_canonique"] ?? "";

  vars["company.name"] = nom;
  vars["company.city"] = ville;
  vars["company.phone"] = vars["entreprise.telephone"] ?? "";
  vars["company.email"] = vars["entreprise.email"] ?? "";
  vars["company.address"] = [adresse, ville].filter(Boolean).join(", ");
  vars["company.rating"] = vars["entreprise.note_moyenne"] ?? "";
  vars["company.reviews"] = vars["entreprise.nombre_avis"] ?? "";
  vars["company.services"] = vars["entreprise.services"] ?? "";
  vars["company.logo"] = vars["entreprise.logo_url"] ?? "";
  vars["company.website"] = site;
}

/**
 * Termine la construction de la map, dans cet ordre :
 *   1. replis des chiffres clés depuis les stats résolues (`__stats`) ;
 *   2. valeurs par défaut des champs d'identité ;
 *   3. alias `company.*`, dérivés de l'état final des clés `entreprise.*` ;
 *   4. alias de tokens (orthographes voisines), toujours en dernier pour
 *      qu'ils copient des valeurs déjà complètes.
 *
 * Mutation en place, fill-only pour tout ce qui peut avoir été saisi à la main.
 */
export function finalizeEnterpriseVariables(
  vars: Record<string, string>,
  stats: StatItem[] | null | undefined,
): void {
  applyStatVariables(vars, stats);
  fillIfEmpty(vars, "entreprise.pays", "France");
  applyCompanyAliases(vars);
  applyVariableAliases(vars);
}
