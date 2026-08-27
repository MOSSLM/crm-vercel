/**
 * Les critères que l'explorateur sait trancher — la liste, en un seul endroit.
 *
 * POURQUOI ELLE EST PARTAGÉE. Deux routes s'en servent : `/explorer`, qui les
 * applique, et `/segments`, qui les enregistre. Si elles divergeaient, un
 * segment pourrait garder un drapeau que la recherche ne connaît plus : il se
 * rejouerait alors en silence avec un critère de moins, et rendrait une
 * population plus large que son nom ne le promet. Un filtre qui ment est pire
 * qu'un filtre absent.
 *
 * CE QUI N'EST PAS ICI, ET POURQUOI. La vision décrit vingt et une familles de
 * filtres. On n'expose que celles dont la donnée sait vraiment trancher —
 * c'est-à-dire distinguer « on a vérifié, il n'y a rien » de « on n'a jamais
 * regardé ». Les finances, l'effectif, la note Google et la qualification IA
 * lisent des colonnes majoritairement vides, où ces deux cas se confondent :
 * les exposer aujourd'hui ferait mentir chaque résultat, exactement comme les
 * 448 « sites faibles » du 16/08 dont 431 étaient en réalité des fiches jamais
 * mesurées. Elles viendront avec le statut à trois états.
 */

/** Les marquages, tels que `chercher_entreprises` les interprète. */
export const FLAGS_CONNUS = new Set([
  "vivantes",
  "sans_site",
  "sans_google",
  "sans_siret",
  "qualite",
  "fusionnee",
  "archivee",
  "masquee",
  // Le logo. Il n'est PLUS une exigence pour fabriquer une démo — `hydrate-logo`
  // compose le nom quand il manque — donc il a disparu des écrans en même temps
  // que l'exigence. Il reste pourtant un tri de travail : 738 fiches sur 60 445
  // en ont un, et celles qui ont un vrai site en portent forcément un qu'on n'a
  // pas encore pris. Deux cases plutôt qu'un booléen, comme le reste du
  // vocabulaire ; les cocher toutes les deux rend un ensemble vide, ce qui est
  // la lecture littérale de « avec logo ET sans logo ».
  "avec_logo",
  "sans_logo",
]);

/** Les provenances réellement présentes en base, mesurées le 16/08. */
export const SOURCES_CONNUES = new Set(["ademe_rge", "api_gouv", "google_maps", "reseau_proeco"]);
