/**
 * Le vocabulaire de l'analyse de site.
 *
 * UNE DÉCISION DE CONCEPTION DOMINE CE FICHIER : une note ne circule jamais
 * seule, elle circule avec ses preuves.
 *
 * Ce n'est pas de la coquetterie. Ces notes sont montrées à un prospect, sur une
 * page publique, à propos de SON site. « Votre site : 41/100 » est indéfendable
 * en rendez-vous ; « 4,2 s pour afficher la page, seuil 2,5 s » se vérifie
 * devant lui. Le modèle de données rend donc la preuve obligatoire — une
 * `Preuve` sans `valeur` mesurée ne compte pas dans la note et ne s'affiche pas.
 *
 * Corollaire : on ne prétend jamais mesurer ce qu'on ne mesure pas. Pas de Core
 * Web Vitals (LCP/CLS/INP), pas d'accessibilité réelle, pas de vitesse ressentie
 * après exécution du JS — tout cela exige un vrai navigateur. Ce que l'analyseur
 * voit, ce sont des en-têtes HTTP, du HTML et un chronomètre. C'est beaucoup, et
 * c'est honnête.
 */

/** Le verdict d'un signal, du point de vue du prospect. */
export type Verdict = "ok" | "moyen" | "probleme" | "inconnu";

/** Confiance dans une note, quand la mesure est structurellement partielle. */
export type Confiance = "haute" | "moyenne" | "faible";

/** Les quatre axes notés. */
export type AxeId = "vitesse" | "seo" | "mobile" | "conversion";

/**
 * Un signal mesuré, avec ce qui le rend opposable : la valeur constatée et le
 * seuil qui la juge.
 *
 * `valeur === null` veut dire « pas mesuré » — jamais « nul ». Les deux étaient
 * confondus dans une note nue, et c'est exactement ce qui produit une
 * affirmation fausse (« aucun contenu SEO » sur une SPA qui en a plein).
 */
export interface Preuve {
  cle: string;
  /** Formulation destinée au prospect, pas au développeur. */
  libelle: string;
  /** Ce qu'on a constaté, déjà formaté (« 4,2 s », « absente », « 3 »). */
  valeur: string | null;
  /** Le seuil qui décide, formaté de même. Null quand le signal est binaire. */
  seuil: string | null;
  /** Points que ce signal pèse dans son axe. */
  poids: number;
  verdict: Verdict;
}

export interface NoteAxe {
  /** 0..100, calculée sur les seules preuves réellement mesurées. */
  note: number;
  confiance: Confiance;
  preuves: Preuve[];
}

export interface ResultatScore {
  noteGlobale: number;
  axes: Record<AxeId, NoteAxe>;
  /** Libellé court à 5 niveaux, pour les affichages qui n'ont qu'une ligne. */
  libelle: string;
  /** Clés du catalogue d'audit déclenchées par les mesures. */
  issueKeys: string[];
  /** Anomalies à montrer à l'opérateur — jamais au prospect. */
  alertes: string[];
}

/**
 * Ce que `collect` rapporte du réseau, avant toute interprétation.
 * Un site injoignable ou bloqué remplit quand même cette structure : c'est une
 * donnée d'audit, pas une erreur.
 */
export interface CollecteSite {
  urlDemandee: string;
  urlFinale: string | null;
  httpStatus: number | null;
  /** Vrai quand le serveur nous a opposé une protection anti-robot. */
  bloque: boolean;
  motifBlocage: string | null;
  /** Vrai quand rien n'a répondu du tout (DNS, TLS, délai). */
  injoignable: boolean;
  erreur: string | null;

  html: string | null;
  enTetes: Record<string, string>;
  https: boolean;

  ttfbMs: number | null;
  chargementMs: number | null;
  poidsOctets: number | null;

  /**
   * CSS des feuilles externes, concaténé.
   *
   * Sans lui, `nbMediaQueries` valait 0 sur la moitié du parc — non parce que ces
   * sites n'étaient pas adaptatifs, mais parce que leurs règles vivent dans un
   * fichier qu'on ne lisait pas.
   */
  cssExterne: string;
  /** Feuilles `<link rel=stylesheet>` déclarées par la page. */
  nbFeuillesDeclarees: number;
  /** Feuilles effectivement récupérées. Zéro sur des déclarations ⇒ CSS illisible. */
  nbFeuillesLues: number;

  /** null quand la vérification n'a pas pu aboutir — distinct de `false`. */
  robotsTxt: boolean | null;
  sitemapXml: boolean | null;
}

/** Les signaux bruts extraits du HTML. Aucun jugement ici : que des faits. */
export interface SignauxSite {
  // ── Jonction ────────────────────────────────────────────────────────────
  joignable: boolean;
  bloque: boolean;
  httpStatus: number | null;
  https: boolean;

  // ── Chronométrage et poids ──────────────────────────────────────────────
  ttfbMs: number | null;
  chargementMs: number | null;
  poidsOctets: number | null;
  compression: boolean;
  cacheControl: boolean;

  // ── Structure ───────────────────────────────────────────────────────────
  longueurTexteVisible: number;
  nbScripts: number;
  nbScriptsBloquants: number;
  nbCssBloquants: number;
  /**
   * Le HTML ressemble-t-il à une coquille de SPA (peu de texte, beaucoup de JS) ?
   * Ce drapeau ne baisse aucune note : il baisse la CONFIANCE. Un site React
   * parfaitement référencé rendrait sinon un 12/100 mensonger.
   */
  ressembleSpa: boolean;

  // ── SEO ─────────────────────────────────────────────────────────────────
  title: string | null;
  metaDescription: string | null;
  nbH1: number;
  canonical: boolean;
  lang: string | null;
  noindex: boolean;
  robotsTxt: boolean | null;
  sitemapXml: boolean | null;
  jsonLdLocalBusiness: boolean;
  napNom: boolean;
  napAdresse: boolean;
  napTelephone: boolean;
  nbImages: number;
  nbImagesSansAlt: number;
  nbImagesSansLazy: number;

  // ── Mobile ──────────────────────────────────────────────────────────────
  viewport: boolean;
  viewportZoomBloque: boolean;
  /**
   * `null` quand la page déclare des feuilles externes dont aucune n'a pu être
   * lue : on ignore alors si les règles mobiles existent. Compter 0 dans ce cas
   * revenait à conclure « pas adapté au mobile » faute d'avoir regardé.
   */
  nbMediaQueries: number | null;
  nbLargeursFixes: number;
  nbPolicesTropPetites: number | null;
  /** Le CSS de la page a-t-il pu être lu en entier ? Décide des deux champs ci-dessus. */
  cssLisible: boolean;

  // ── Confiance & conversion ──────────────────────────────────────────────
  telCliquable: boolean;
  telephoneEnTexte: boolean;
  formulaire: boolean;
  mailto: boolean;
  avisDansLaPage: boolean;
  /**
   * Domaine du widget d'avis détecté (Trustindex, Elfsight…), s'il y en a un.
   *
   * SANS CE SIGNAL, on annonce à un artisan que ses avis n'apparaissent pas
   * alors qu'ils sont bien sur sa page, chargés par un script. Une seule
   * affirmation fausse de ce genre discrédite tout le rapport.
   */
  widgetAvis: string | null;
  mentionsLegales: boolean;
  bandeauCookies: boolean;
  nbReseauxSociaux: number;
  nbCta: number;
}

/** Contexte CRM utile au scoreur, qu'on ne peut pas lire dans la page. */
export interface ContexteEntreprise {
  /** Nombre d'avis Google connus : sans lui, « avis absents » ne veut rien dire. */
  nombreAvis?: number | null;
  telephone?: string | null;
}
