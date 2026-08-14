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

/**
 * Les axes de l'analyse.
 *
 * Les quatre premiers notent LE SITE et composent la note globale. Le cinquième
 * ne parle pas du site mais de la réputation : il s'affiche, il produit des
 * constats vendables, et il pèse ZÉRO dans la note globale — sinon
 * « votre site : 62/100 » inclurait des choses qui ne sont pas le site.
 */
export type AxeId = "vitesse" | "seo" | "mobile" | "contenu" | "conversion" | "popularite";

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
  /**
   * À quel point CE site-ci rate CE signal — de 0 (au seuil) à 1 (rate tout).
   *
   * `poids` et `gravite` répondent à deux questions différentes, et les confondre
   * produit un document qui ne s'adapte pas au prospect. Le poids dit combien le
   * signal compte dans la note ; la gravité dit à quel point ce site-là le rate.
   *
   * Le cas qui a imposé ce champ : un serveur mesuré à 1,32 s pour un seuil à
   * 0,8 s bascule en « problème » de 120 ms, mais `ttfb` est la preuve la plus
   * lourde de son axe (35). Trié sur le seul poids, ce quasi-succès passait
   * DEVANT un formulaire de contact totalement absent et un téléphone non
   * cliquable — et faisait la une d'un audit dont ce n'était pas le sujet.
   *
   * Absent sur les preuves `ok` et `inconnu` : il n'y a rien à classer.
   */
  gravite?: number;
}

/**
 * Un constat relevé par Lighthouse, tel que Google le formule.
 *
 * POURQUOI UN TYPE À PART, ET PAS UNE `Preuve` DE PLUS.
 *
 * Une `Preuve` porte notre mesure et NOTRE seuil : c'est nous qui décidons
 * qu'au-delà de 2,5 s c'est un problème, et c'est nous qui l'assumons. Un
 * constat Google porte le sien, plus une chose que nous ne pouvons pas produire :
 * un GAIN chiffré — « 3,7 s à récupérer ». Ce n'est pas une mesure, c'est une
 * promesse, et elle est faite par Google.
 *
 * Les confondre dans une seule structure ferait passer l'estimation de Google
 * pour un de nos calculs. En rendez-vous, la distinction est exactement ce qui a
 * de la valeur : le prospect peut refaire le test lui-même en trente secondes.
 *
 * `titre` et `valeur` arrivent déjà en français et déjà formatés (`locale=fr`) :
 * on affiche les mots de Google, on ne les traduit pas.
 */
export interface ConstatGoogle {
  /** Identifiant Lighthouse — `render-blocking-insight`, `tap-targets`… */
  id: string;
  /**
   * La catégorie Google qui compte ce constat : `performance`, `seo`,
   * `accessibility`, `best-practices`. C'est elle qui range le constat sous le
   * bon axe — sans quoi on ne sait dire que « 31 choses », jamais « voilà ce qui
   * pèse sur votre référencement ».
   */
  categorie: string | null;
  /** Intitulé français de Google : « Réduisez les ressources JavaScript inutilisées ». */
  titre: string;
  /** Sa valeur affichée : « Économies estimées : 3 650 ms ». `null` si l'audit n'en donne pas. */
  valeur: string | null;
  /** Millisecondes que Google estime récupérables. */
  gainMs: number | null;
  /** Octets que Google estime récupérables. */
  gainOctets: number | null;
  /** Nombre d'éléments concernés (images, scripts, liens…), quand Google les liste. */
  elements: number | null;
  /** Rouge chez Google (< 0,5) ou orange. */
  verdict: "probleme" | "moyen";
}

/** Un élément précis visé par un constat : cette image-ci, ce script-là. */
export interface ElementConstat {
  /** La ressource en cause, quand l'audit en nomme une. */
  url: string | null;
  /** L'élément du DOM concerné (sélecteur ou extrait), quand il y en a un. */
  element: string | null;
  gainMs: number | null;
  gainOctets: number | null;
  tailleOctets: number | null;
}

/** Un constat, avec le conseil de Google et la liste de ce qui est visé. */
export interface ConstatGoogleDetaille extends ConstatGoogle {
  /**
   * L'explication de Google : ce qu'il faut faire et pourquoi. C'est la matière
   * première de la rédaction — la seule partie de PageSpeed qui explique au lieu
   * de constater.
   */
  conseil: string;
  elementsDetail: ElementConstat[];
}

/**
 * Tout ce que Lighthouse a dit d'un site, mis de côté pour préparer l'audit.
 *
 * CE N'EST PAS L'AUDIT. C'est le dossier d'instruction : la rédaction y puise,
 * le prospect n'en voit jamais que ce qu'on en a retenu. D'où le stockage à part
 * — table dédiée, chargée seulement quand on prépare — et non dans la ligne que
 * le pipeline liste trente par trente.
 */
export interface ContextePsi {
  url: string;
  strategie: "mobile" | "desktop";
  recupereLe: string;
  versionLighthouse: string | null;
  /** Les quatre notes de Google, sur 100. */
  categories: Record<string, number | null>;
  /** Les métriques chiffrées, avec la valeur telle que Google l'affiche. */
  metriques: Array<{ cle: string; titre: string; valeur: string | null; numerique: number | null }>;
  constats: ConstatGoogleDetaille[];
  /** Ce qui passe : utile pour ne pas reprocher à quelqu'un ce qu'il fait bien. */
  reussis: string[];
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
   * Poids de la page entière — document, images, scripts, feuilles — additionné
   * depuis les `content-length` des ressources déclarées.
   *
   * `null` quand aucun serveur n'a exposé de taille. C'est « on n'a pas pu
   * peser », jamais « c'est léger » : la preuve reste alors `inconnu`.
   */
  poidsTotalOctets: number | null;
  /** Ressources dont la taille a effectivement été obtenue. */
  ressourcesPesees: number;

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
  /**
   * Combien de pages le site déclare, d'après son propre plan.
   *
   * LE SEUL SIGNAL DE CONTENU QUI NE COÛTE RIEN. On téléchargeait déjà
   * `sitemap.xml` pour n'en garder qu'un booléen ; en compter les `<loc>`
   * distingue un site de quatre pages d'un site de quarante, gratuitement et
   * sans jugement. C'est la mesure qui répond au site vide qui charge vite :
   * PageSpeed récompense le vide, ce comptage le constate.
   *
   * `null` quand le plan est absent, illisible, ou qu'aucune URL n'a pu être
   * lue — une absence de plan n'est pas une absence de pages.
   */
  nbPagesSitemap: number | null;
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
  /** Document + ressources déclarées. `null` = non pesé, jamais « léger ». */
  poidsTotalOctets: number | null;
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
  /**
   * La page ne contient quasiment rien — coquille de SPA, page parking, « site
   * en construction », redirection HTML. Contrairement à `ressembleSpa`, ce
   * drapeau n'exige PAS la présence de JavaScript.
   *
   * Il existe parce qu'une page de 1 Ko sans le moindre script a été notée
   * « conversion 0/100, confiance haute » : on s'apprêtait à envoyer un rapport
   * accablant sur une page qui n'est pas le site de l'entreprise. Comme
   * `ressembleSpa`, il baisse la confiance et jamais la note.
   */
  coquille: boolean;
  /** La page annonce elle-même qu'elle n'est pas un site (parking, en travaux). */
  pageParking: boolean;

  // ── SEO ─────────────────────────────────────────────────────────────────
  title: string | null;
  metaDescription: string | null;
  nbH1: number;
  canonical: boolean;
  lang: string | null;
  noindex: boolean;
  robotsTxt: boolean | null;
  sitemapXml: boolean | null;
  /**
   * Combien de pages le site déclare, d'après son propre plan.
   *
   * Le seul signal de contenu qui ne coûte rien : on téléchargeait déjà
   * `sitemap.xml` pour n'en garder qu'un booléen. `null` quand le plan est
   * absent ou illisible — une absence de plan n'est pas une absence de pages.
   */
  nbPagesSitemap: number | null;
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

  // ── Popularité locale : ce que seul le croisement révèle ─────────────────
  /**
   * La ville de l'entreprise apparaît-elle dans le titre ou le h1 ?
   * `null` quand on ne connaît pas sa ville : on ne juge pas ce qu'on ignore.
   */
  villeDansTitre: boolean | null;
  /**
   * La page cite-t-elle une qualification que l'ADEME confirme encore ?
   * `null` quand l'entreprise n'en détient aucune — la question ne se pose pas.
   */
  mentionneRge: boolean | null;
}

/**
 * Contexte CRM utile au scoreur, qu'on ne peut pas lire dans la page.
 *
 * C'est ce qui rend l'audit intransigeant là où un outil générique reste vague :
 * croiser la page avec ce qu'on sait déjà de l'entreprise permet de constater
 * des écarts — 43 avis Google et zéro affiché, une qualification RGE détenue et
 * jamais citée — qu'aucune lecture de HTML seule ne peut produire.
 */
export interface ContexteEntreprise {
  /** Nombre d'avis Google connus : sans lui, « avis absents » ne veut rien dire. */
  nombreAvis?: number | null;
  telephone?: string | null;
  /** Note Google moyenne, sur 5. */
  noteMoyenne?: number | null;
  /** Ville de l'entreprise : la requête qui compte est « métier + ville ». */
  ville?: string | null;
  nom?: string | null;
  /**
   * Qualifications RGE encore valides, en libellés. Une liste vide et `undefined`
   * ne veulent pas dire la même chose : la première dit « aucune », la seconde
   * « on n'a pas regardé ».
   */
  qualificationsRge?: string[] | null;
}
