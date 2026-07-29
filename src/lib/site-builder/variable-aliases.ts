/**
 * Alias de tokens `{{ entreprise.* }}`.
 *
 * La substitution est un simple `variables[key] ?? ""` (wrap-raw-html.ts,
 * interpolate-vars.ts, l'aperçu du builder) : un token dont l'orthographe
 * s'écarte d'un caractère de la liste canonique rend une chaîne VIDE, en
 * silence. C'est le mode d'échec numéro un des chiffres clés — « annees » au
 * pluriel, « interventions » au lieu d'« installations », « nb_clients » au lieu
 * de « clients_count » — et il ne se voit qu'une fois le site déployé, puisque
 * l'aperçu sans entreprise injecte des valeurs d'exemple.
 *
 * On duplique donc chaque valeur canonique sous ses variantes plausibles. C'est
 * volontairement un filet, pas une invitation : la liste de référence reste
 * `docs/site-builder/claude-design-variables.md`, et le panneau « Diagnostic
 * d'hydratation » du builder signale tout token hors de cette liste.
 *
 * Sens unique : canonique → alias, jamais l'inverse, pour qu'un design qui écrit
 * l'alias ne puisse pas primer sur une valeur posée à la main.
 */

/** alias → clé canonique. */
export const VARIABLE_ALIASES: Readonly<Record<string, string>> = {
  // Années d'expérience
  "entreprise.annees_experience": "entreprise.annee_experience",
  "entreprise.annees_d_experience": "entreprise.annee_experience",
  "entreprise.experience": "entreprise.annee_experience",
  "entreprise.years_experience": "entreprise.annee_experience",
  // Clients satisfaits
  "entreprise.clients": "entreprise.clients_count",
  "entreprise.nb_clients": "entreprise.clients_count",
  "entreprise.clients_satisfaits": "entreprise.clients_count",
  "entreprise.satisfied_clients": "entreprise.clients_count",
  // Installations / chantiers réalisés
  "entreprise.interventions": "entreprise.installations",
  "entreprise.nb_interventions": "entreprise.installations",
  "entreprise.chantiers": "entreprise.installations",
  "entreprise.realisations": "entreprise.installations",
  "entreprise.installations_realisees": "entreprise.installations",
  // Qualifications (RGE, Qualibat…)
  "entreprise.certifications": "entreprise.qualifications",
  "entreprise.labels": "entreprise.qualifications",
  "entreprise.rge": "entreprise.qualifications",
  "entreprise.nb_qualifications": "entreprise.qualifications",
  // Identité — variantes rencontrées dans les templates historiques
  "entreprise.telephone_link": "entreprise.telephone_lien",
  "entreprise.ville_seo_": "entreprise.ville_seo",
  "entreprise.site_web": "entreprise.site_web_canonique",
  "entreprise.zone_desservie": "entreprise.zones_desservies",
};

/**
 * Duplique chaque valeur canonique non vide sous ses alias. Mutation en place.
 * N'écrase jamais une clé déjà renseignée (un alias explicitement posé dans le
 * jsonb `variables` du projet reste prioritaire).
 */
export function applyVariableAliases(vars: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(VARIABLE_ALIASES)) {
    const value = vars[canonical];
    if (value === undefined || value === "") continue;
    if (vars[alias] === undefined || vars[alias] === "") vars[alias] = value;
  }
}
