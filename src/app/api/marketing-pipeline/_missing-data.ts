/**
 * Complétion en masse : traduire ce qu'une ligne de la grille a MODIFIÉ en deux
 * patchs SQL — un pour `entreprises`, un pour `lead_magnet_projects`.
 *
 * Toute la difficulté tient en une phrase : **une clé absente n'est pas une clé
 * à vider**. `company-details`, la route de la fiche, est un écrasement complet
 * — elle renvoie toujours le formulaire entier, donc `name: company.name ||
 * null` est sans danger là-bas. Une grille qui ne connaît que trois colonnes ne
 * peut pas faire ça : elle effacerait l'adresse, l'e-mail, les horaires et le
 * reste de la fiche à chaque enregistrement.
 *
 * D'où ces deux fonctions, pures et testées : elles ne produisent QUE les
 * colonnes réellement envoyées.
 */

/** Champs entreprise que la grille peut écrire (les autres n'ont rien à y faire). */
export type CompanyPatchInput = {
  name?: string | null;
  ville?: string | null;
  code_postal?: string | null;
  telephone?: string | null;
  service_tags?: string[];
  note_moyenne?: number | null;
};

/** Champs du dossier lead magnet que la grille peut écrire. */
export type ProjectPatchInput = {
  override_city?: string | null;
  logo_url?: string | null;
  stat_years_experience?: string | null;
  stat_satisfied_clients?: string | null;
  stat_installations_completed?: string | null;
};

const clean = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/**
 * Patch `entreprises`. Vide (`null`) quand la ligne n'a touché aucun champ
 * entreprise : l'appelant saute alors l'UPDATE au lieu d'écrire un
 * `updated_at` — et surtout un `manually_enriched` — pour rien.
 *
 * `manually_enriched` n'est posé QUE si le patch écrit vraiment quelque chose :
 * c'est le drapeau qui dit « un humain est passé par là », il ne doit pas se
 * lever parce qu'on a complété le logo, qui vit sur le dossier lead magnet.
 */
export function buildCompanyPatch(
  input: CompanyPatchInput,
  now: string,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if ("name" in input) patch.name = clean(input.name);
  if ("ville" in input) patch.ville = clean(input.ville);
  if ("code_postal" in input) patch.code_postal = clean(input.code_postal);
  if ("telephone" in input) patch.telephone = clean(input.telephone);
  if ("service_tags" in input) patch.service_tags = input.service_tags ?? [];
  if ("note_moyenne" in input) patch.note_moyenne = input.note_moyenne ?? null;
  if (Object.keys(patch).length === 0) return null;
  patch.manually_enriched = true;
  patch.updated_at = now;
  return patch;
}

/**
 * Patch `lead_magnet_projects`. `null` quand rien n'a bougé.
 *
 * Deux règles reprises telles quelles de la fiche, sous peine de voir les deux
 * écrans écrire différemment la même chose :
 *
 *  - `override_location` est le miroir historique de la ville SEO. Les designs
 *    qui utilisent encore `{{ entreprise.location }}` le lisent : ne pas le
 *    synchroniser ferait afficher au site une ville que la fiche ne montre plus.
 *  - `override_city_source` ne bascule sur `'manual'` que si la ville CHANGE
 *    réellement. Sans cette comparaison, un enregistrement de masse marquerait
 *    « saisi à la main » toutes les villes posées par l'enrichissement, et les
 *    sortirait du recalcul automatique alors que personne ne les a validées.
 *
 * @param previousCity Ville SEO actuellement en base, pour cette comparaison.
 */
export function buildProjectPatch(
  input: ProjectPatchInput,
  previousCity: string | null,
  now: string,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if ("override_city" in input) {
    const next = clean(input.override_city);
    patch.override_city = next;
    patch.override_location = next;
    if ((previousCity ?? "") !== (next ?? "")) {
      patch.override_city_source = next ? "manual" : null;
    }
  }
  if ("logo_url" in input) patch.logo_url = clean(input.logo_url);
  if ("stat_years_experience" in input) patch.stat_years_experience = clean(input.stat_years_experience);
  if ("stat_satisfied_clients" in input) patch.stat_satisfied_clients = clean(input.stat_satisfied_clients);
  if ("stat_installations_completed" in input) {
    patch.stat_installations_completed = clean(input.stat_installations_completed);
  }
  if (Object.keys(patch).length === 0) return null;
  patch.updated_at = now;
  return patch;
}
