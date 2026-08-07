/**
 * Les variables qu'une fiche doit porter avant qu'on puisse générer son site.
 *
 * Ces règles existaient dans `MarketingWebPipeline.tsx`, un fichier `"use
 * client"` de près de 1 900 lignes. Rien d'autre ne pouvait les importer : ni la
 * grille de complétion en masse, ni le test qui les compare à `missingForSite`
 * côté API — lequel en était réduit à RECOPIER la liste des libellés. Une copie
 * ne garde pas deux listes alignées, elle ajoute une troisième chose à tenir.
 *
 * D'où ce module : du TypeScript pur, sans React ni JSX, importable de partout,
 * y compris depuis un test d'API.
 *
 * Le pendant serveur est `missingForSite` (`src/app/api/marketing-pipeline/
 * _board.ts`), et `missing-for-site.test.ts` vérifie que les deux produisent
 * exactement les mêmes libellés.
 */

export const toArr = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);
export const fromArr = (a?: unknown): string =>
  Array.isArray(a) ? a.filter((x) => typeof x === "string").join(", ") : "";
export const numStr = (v: unknown): string => (v == null || v === "" ? "" : String(v));

/** Une stat vide au sens du rendu : "", "0", "-" et "—" n'affichent rien. */
export const filledStat = (v: string): boolean => {
  const t = v.trim();
  return t !== "" && t !== "0" && t !== "-" && t !== "—";
};

/**
 * Les valeurs que les règles LISENT — et rien de plus.
 *
 * Volontairement plus étroit que le `EditForm` de la modale (une trentaine de
 * champs) : la grille de complétion n'édite que les champs requis, et n'a pas à
 * inventer une adresse ou un résumé de site pour pouvoir appeler `ok()`.
 * `EditForm` en reste un sur-ensemble structurel, donc la modale continue de
 * passer son formulaire entier sans conversion.
 */
export interface RequiredValues {
  name: string;
  ville: string;
  code_postal: string;
  telephone: string;
  service_tags: string;
  note_moyenne: string;
  /** Lu par la seule règle de la note : sans avis, il n'y a rien à noter. */
  nombre_avis: string;
  lm_override_city: string;
  lm_logo_url: string;
  lm_stat_years: string;
  lm_stat_clients: string;
  lm_stat_installations: string;
  /** Chiffres confirmés par le client : satisfont l'exigence comme une estimation. */
  lm_stat_years_official: string;
  lm_stat_clients_official: string;
  lm_stat_installations_official: string;
}

/**
 * Une exigence : le champ qui la porte, son libellé (celui que le board affiche
 * dans « n manquants »), son aide, et le prédicat qui dit si elle est tenue.
 *
 * `hint` vit ici et non dans le rendu : la modale l'affiche sous le champ, la
 * grille en fait l'infobulle de sa colonne. Écrite deux fois, elle aurait dérivé.
 */
export type RequiredRule = {
  field: keyof RequiredValues;
  label: string;
  hint?: string;
  ok: (f: RequiredValues) => boolean;
  /**
   * L'exigence a-t-elle seulement lieu d'être sur cette fiche ? Absent = oui,
   * toujours. Seule la note s'en sert : sans avis, il n'y a rien à noter, et
   * l'astérisque comme le rouge doivent disparaître plutôt que réclamer un
   * chiffre que l'entreprise n'a pas.
   */
  applies?: (f: RequiredValues) => boolean;
};

/** L'exigence porte-t-elle sur cette fiche ? (cf. `RequiredRule.applies`) */
export const ruleApplies = (rule: RequiredRule, values: RequiredValues): boolean =>
  rule.applies ? rule.applies(values) : true;

/** Champ du formulaire porté par une règle de complétude. */
export type RequiredField = RequiredRule["field"];

export const SITE_REQUIRED: RequiredRule[] = [
  { field: "name", label: "Nom", ok: (f) => f.name.trim().length > 0 },
  { field: "ville", label: "Ville", ok: (f) => f.ville.trim().length > 0 },
  { field: "code_postal", label: "Code postal", ok: (f) => f.code_postal.trim().length > 0 },
  { field: "telephone", label: "Téléphone", ok: (f) => f.telephone.trim().length > 0 },
  {
    field: "service_tags",
    label: "Service tags",
    hint: "Choisis-les dans la liste des tags autorisés : ce sont eux qui commandent les pages et les visuels du site. Un métier absent de la liste se saisit dans le champ à côté.",
    ok: (f) => toArr(f.service_tags).length > 0,
  },
  // Avis Google : paire FACULTATIVE. Une entreprise sans fiche Google, ou avec
  // zéro avis, n'a rien à saisir ici et ne doit pas rester bloquée pour autant.
  // Seule la cohérence est exigée : des avis annoncés sans note afficheraient un
  // bloc noté vide. Pas de règle sur `nombre_avis`, jamais.
  // Doit rester aligné sur `missingForSite` côté API — le test
  // `missing-for-site.test.ts` compare les deux listes.
  {
    field: "note_moyenne",
    label: "Note moyenne",
    applies: (f) => Number(f.nombre_avis) > 0,
    ok: (f) => (Number(f.nombre_avis) > 0 ? Number(f.note_moyenne) > 0 : true),
  },
];

// Ville SEO, logo et chiffres clés vivent sur `lead_magnet_projects` : ils ne
// sont exigés que s'il y a un projet lead magnet, sinon la fiche d'une
// entreprise sans projet serait impossible à valider (ces champs n'ont nulle
// part où être enregistrés). Tout ce que le site affiche est obligatoire — un
// site généré sans logo ni chiffres clés sort avec des blocs vides.
export const SITE_REQUIRED_WITH_PROJECT: RequiredRule[] = [
  ...SITE_REQUIRED,
  {
    field: "lm_override_city",
    label: "Ville SEO",
    hint: "Grande ville la plus proche — celle mise en avant partout sur le site. Si l'entreprise est déjà dans une grande ville, remets la même.",
    ok: (f) => f.lm_override_city.trim().length > 0,
  },
  {
    field: "lm_logo_url",
    label: "Logo",
    hint: "Affiché en en-tête du site : sans lui, la démo sort sans identité.",
    ok: (f) => f.lm_logo_url.trim().length > 0,
  },
  // Un chiffre confirmé par le client satisfait l'exigence autant qu'une
  // estimation : c'est lui qui s'affichera. Doit rester aligné sur
  // `missingForSite` côté API, que le test compare à cette liste.
  {
    field: "lm_stat_years",
    label: "Années d'expérience",
    hint: "Chiffre clé affiché sur le site.",
    ok: (f) => filledStat(f.lm_stat_years_official) || filledStat(f.lm_stat_years),
  },
  {
    field: "lm_stat_clients",
    label: "Clients satisfaits",
    hint: "Chiffre clé affiché sur le site.",
    ok: (f) => filledStat(f.lm_stat_clients_official) || filledStat(f.lm_stat_clients),
  },
  {
    field: "lm_stat_installations",
    label: "Installations",
    hint: "Chiffre clé affiché sur le site.",
    ok: (f) => filledStat(f.lm_stat_installations_official) || filledStat(f.lm_stat_installations),
  },
  // Pas de règle sur `lm_stat_rge` : une entreprise sans qualification RGE est
  // parfaitement valide, le bloc « chiffres clés » se limite alors à trois
  // colonnes. Doit rester aligné sur `missingForSite` côté API.
];

export const siteRequiredFor = (hasProject: boolean): RequiredRule[] =>
  hasProject ? SITE_REQUIRED_WITH_PROJECT : SITE_REQUIRED;

/** Les champs requis encore vides, dans l'ordre des règles. */
export const missingFields = (values: RequiredValues, hasProject: boolean): RequiredField[] =>
  siteRequiredFor(hasProject).filter((r) => !r.ok(values)).map((r) => r.field);

/** Valeurs vides — point de départ d'une ligne de grille comme d'un formulaire. */
export const EMPTY_REQUIRED_VALUES: RequiredValues = {
  name: "",
  ville: "",
  code_postal: "",
  telephone: "",
  service_tags: "",
  note_moyenne: "",
  nombre_avis: "",
  lm_override_city: "",
  lm_logo_url: "",
  lm_stat_years: "",
  lm_stat_clients: "",
  lm_stat_installations: "",
  lm_stat_years_official: "",
  lm_stat_clients_official: "",
  lm_stat_installations_official: "",
};
