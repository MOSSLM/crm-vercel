/**
 * Signaux → notes. Fonction pure, sans réseau, sans base : entièrement testable.
 *
 * Même parti pris que `src/lib/donnees-publiques/score.ts` : « un score nu ne se
 * conteste pas, un score décomposé se relit ». Ici l'enjeu est plus fort encore,
 * parce que le score est montré au prospect lui-même.
 *
 * TROIS RÈGLES STRUCTURELLES
 *
 * 1. **Le poids d'une preuve non mesurée est retiré du dénominateur.** On ne
 *    punit jamais un site pour ce qu'on n'a pas su regarder. Une note est donc
 *    toujours « sur ce qu'on a vu », et `confiance` dit combien on a vu.
 *
 * 2. **Une page vide baisse la confiance, pas la note.** Un site rendu côté
 *    client renvoie un HTML quasi vide ; le lire au premier degré donnerait
 *    10/100 à des sites très corrects. Il en va de même d'une page d'attente ou
 *    d'une redirection, qui n'ont pas de JavaScript pour se signaler. Les axes
 *    qui dépendent du contenu passent en confiance faible, et la page publique
 *    ne les affiche pas.
 *
 * 3. **Une clé d'audit n'est émise que sur une mesure positive.** Le doute ne
 *    déclenche rien : mieux vaut un rapport court et vrai qu'un rapport complet
 *    et contestable.
 */

import type {
  AxeId,
  Confiance,
  ContexteEntreprise,
  NoteAxe,
  Preuve,
  ResultatScore,
  SignauxSite,
  Verdict,
} from "./types";

/** Pondération des axes dans la note globale. */
export const POIDS_AXES: Record<AxeId, number> = {
  vitesse: 30,
  seo: 30,
  mobile: 20,
  conversion: 20,
};

// ---------------------------------------------------------------------------
// Seuils — rassemblés ici parce qu'ils sont l'argumentaire, pas des détails
// ---------------------------------------------------------------------------

export const SEUILS = {
  /** Au-delà, le serveur est lent à répondre (avant même le rendu). */
  ttfbMs: 800,
  /** Au-delà de 2,5 s pour recevoir la page, on parle de site lent. */
  chargementMs: 2_500,
  /** Une page d'accueil au-delà de 2 Mo de HTML est anormale. */
  poidsOctets: 2_000_000,
  titreMin: 15,
  titreMax: 65,
  descriptionMin: 50,
  descriptionMax: 165,
  /** En dessous, on considère qu'il n'y a pas de parcours de conversion. */
  ctaMin: 2,
  /** Largeur au-delà de laquelle un élément fixe déborde d'un mobile. */
  largeurMobilePx: 480,
  /** Sous ce nombre de caractères visibles, la page est une coquille. */
  texteSpa: 500,
  /**
   * En dessous, le HTML servi ne peut pas être une page d'accueil : c'est une
   * coquille, une redirection ou une page d'attente.
   */
  htmlCoquilleOctets: 5_000,
} as const;

// ---------------------------------------------------------------------------
// Petits fabricants de preuves
// ---------------------------------------------------------------------------

/** Preuve binaire : présent = bon, absent = problème. */
function pBool(
  cle: string,
  libelle: string,
  present: boolean | null,
  poids: number,
  labels: { oui: string; non: string },
): Preuve {
  if (present === null) {
    return { cle, libelle, valeur: null, seuil: null, poids, verdict: "inconnu" };
  }
  return {
    cle,
    libelle,
    valeur: present ? labels.oui : labels.non,
    seuil: null,
    poids,
    verdict: present ? "ok" : "probleme",
  };
}

/**
 * Preuve chiffrée : sous le seuil = bon, au-delà = problème (avec zone grise).
 *
 * `format` reçoit l'échelle de la ligne — la plus grande des deux valeurs — et
 * non chaque nombre isolément. Sans ça, on affiche « 900 ms » face à un seuil de
 * « 2,5 s » et on demande au prospect de convertir de tête au moment précis où
 * on lui demande d'accepter le verdict. Les deux nombres d'une même ligne
 * portent donc toujours la même unité.
 */
function pSeuil(
  cle: string,
  libelle: string,
  valeur: number | null,
  seuil: number,
  poids: number,
  format: (n: number, echelle: number) => string,
  { inverse = false }: { inverse?: boolean } = {},
): Preuve {
  if (valeur === null || !Number.isFinite(valeur)) {
    return { cle, libelle, valeur: null, seuil: format(seuil, seuil), poids, verdict: "inconnu" };
  }
  const echelle = Math.max(valeur, seuil);
  const depasse = inverse ? valeur < seuil : valeur > seuil;
  // Zone grise à 1,5× le seuil : « moyen » vaut la moitié des points, ce qui
  // évite qu'un site à 2,6 s soit noté comme un site à 12 s.
  const limiteGrave = inverse ? seuil * 0.5 : seuil * 1.5;
  const grave = inverse ? valeur < limiteGrave : valeur > limiteGrave;
  const verdict: Verdict = !depasse ? "ok" : grave ? "probleme" : "moyen";
  return {
    cle,
    libelle,
    valeur: format(valeur, echelle),
    seuil: format(seuil, echelle),
    poids,
    verdict,
  };
}

const pointsDe = (v: Verdict): number => (v === "ok" ? 1 : v === "moyen" ? 0.5 : 0);

/**
 * Agrège des preuves en note /100, en ignorant les preuves non mesurées.
 * Renvoie 0 et une confiance nulle si RIEN n'a pu être mesuré — le cas d'un site
 * injoignable, où prétendre à une note serait absurde.
 */
function agreger(preuves: Preuve[], degrade: boolean): NoteAxe {
  const mesurees = preuves.filter((p) => p.verdict !== "inconnu");
  const totalPoids = mesurees.reduce((a, p) => a + p.poids, 0);
  const obtenus = mesurees.reduce((a, p) => a + p.poids * pointsDe(p.verdict), 0);

  const note = totalPoids > 0 ? Math.round((obtenus / totalPoids) * 100) : 0;

  // La couverture — quelle part des signaux prévus a pu être mesurée — décide
  // de la confiance autant que le mode dégradé.
  const poidsPrevu = preuves.reduce((a, p) => a + p.poids, 0);
  const couverture = poidsPrevu > 0 ? totalPoids / poidsPrevu : 0;

  let confiance: Confiance = "haute";
  if (degrade || couverture < 0.5) confiance = "faible";
  else if (couverture < 0.8) confiance = "moyenne";

  return { note, confiance, preuves };
}

// ---------------------------------------------------------------------------
// Les quatre axes
// ---------------------------------------------------------------------------

function axeVitesse(s: SignauxSite): NoteAxe {
  const preuves: Preuve[] = [
    // UNE seule preuve de temps, et elle porte le nom de ce qu'elle mesure.
    //
    // Il y en avait deux — « temps de réponse du serveur » et « temps pour
    // afficher la page » — pesant ensemble 55 points sur 100. Or elles
    // chronométraient le même événement : entre le premier octet et le dernier du
    // HTML il n'y a que le transfert du document, d'où les relevés 534/535 ms,
    // 3 418/3 420 ms, 5 123/5 125 ms. Et « afficher » promettait un rendu qui n'a
    // pas lieu : ni CSS, ni JS, ni images ne sont exécutés ici. Le seul vrai temps
    // d'affichage est le LCP, que seul PageSpeed nous donne.
    pSeuil("ttfb", "Temps de réponse du serveur", s.ttfbMs, SEUILS.ttfbMs, 35, ms),
    // Le poids qui compte est celui de la page entière, pas du seul document :
    // le maximum de HTML observé sur tout le parc est de 587 Ko, pour un seuil à
    // 2 Mo — la preuve ne se déclenchait donc jamais.
    pSeuil("poids", "Poids total de la page", s.poidsTotalOctets, SEUILS.poidsOctets, 25, ko),
    pBool("compression", "Compression activée", s.joignable ? s.compression : null, 10, {
      oui: "activée",
      non: "absente",
    }),
    pBool("cache", "Mise en cache configurée", s.joignable ? s.cacheControl : null, 5, {
      oui: "configurée",
      non: "absente",
    }),
    pSeuil(
      "scripts_bloquants",
      "Scripts qui retardent l'affichage",
      s.joignable ? s.nbScriptsBloquants : null,
      3,
      15,
      compte,
    ),
    pSeuil(
      "images_lazy",
      "Images chargées inutilement au démarrage",
      s.joignable && s.nbImages > 0 ? s.nbImagesSansLazy : null,
      3,
      10,
      compte,
    ),
  ];
  // Poids des preuves : 35 + 25 + 10 + 5 + 15 + 10 = 100. Les points libérés par
  // la fusion des deux mesures de temps sont rendus au poids et aux scripts, qui
  // sont les deux leviers qu'on vend réellement.
  // La vitesse ne dépend pas du contenu : une SPA se chronomètre aussi bien
  // qu'un site statique. Cet axe garde donc sa confiance.
  return agreger(preuves, !s.joignable);
}

function axeSeo(s: SignauxSite): NoteAxe {
  const titreLong = s.title?.trim().length ?? null;
  const descLong = s.metaDescription?.trim().length ?? null;

  const preuves: Preuve[] = [
    {
      cle: "title",
      libelle: "Titre de la page",
      valeur: s.title?.trim() ? `${titreLong} caractères` : s.joignable ? "absent" : null,
      seuil: `${SEUILS.titreMin} à ${SEUILS.titreMax} caractères`,
      poids: 15,
      verdict: !s.joignable
        ? "inconnu"
        : !titreLong
          ? "probleme"
          : titreLong >= SEUILS.titreMin && titreLong <= SEUILS.titreMax
            ? "ok"
            : "moyen",
    },
    {
      cle: "description",
      libelle: "Description affichée par Google",
      valeur: s.metaDescription?.trim() ? `${descLong} caractères` : s.joignable ? "absente" : null,
      seuil: `${SEUILS.descriptionMin} à ${SEUILS.descriptionMax} caractères`,
      poids: 12,
      verdict: !s.joignable
        ? "inconnu"
        : !descLong
          ? "probleme"
          : descLong >= SEUILS.descriptionMin && descLong <= SEUILS.descriptionMax
            ? "ok"
            : "moyen",
    },
    {
      cle: "h1",
      libelle: "Titre principal unique",
      valeur: s.joignable ? `${s.nbH1}` : null,
      seuil: "1",
      poids: 8,
      verdict: !s.joignable ? "inconnu" : s.nbH1 === 1 ? "ok" : s.nbH1 === 0 ? "probleme" : "moyen",
    },
    pBool("https", "Connexion sécurisée (HTTPS)", s.joignable ? s.https : null, 15, {
      oui: "active",
      non: "absente",
    }),
    pBool("canonical", "Adresse canonique déclarée", s.joignable ? s.canonical : null, 5, {
      oui: "déclarée",
      non: "absente",
    }),
    pBool("lang", "Langue de la page déclarée", s.joignable ? Boolean(s.lang) : null, 4, {
      oui: s.lang ?? "déclarée",
      non: "absente",
    }),
    {
      cle: "noindex",
      libelle: "Page visible par les moteurs de recherche",
      valeur: s.joignable ? (s.noindex ? "bloquée (noindex)" : "visible") : null,
      seuil: null,
      // Le poids le plus lourd de l'axe : un `noindex` sur la page d'accueil
      // rend le site invisible sur Google, ce qui prime sur tout le reste.
      poids: 20,
      verdict: !s.joignable ? "inconnu" : s.noindex ? "probleme" : "ok",
    },
    pBool("robots_txt", "Fichier robots.txt", s.robotsTxt, 4, { oui: "présent", non: "absent" }),
    pBool("sitemap", "Plan du site (sitemap.xml)", s.sitemapXml, 5, {
      oui: "présent",
      non: "absent",
    }),
    pBool("jsonld", "Fiche entreprise structurée", s.joignable ? s.jsonLdLocalBusiness : null, 6, {
      oui: "présente",
      non: "absente",
    }),
    pBool(
      "nap",
      "Nom, adresse et téléphone dans la page",
      s.joignable ? s.napNom && s.napAdresse && s.napTelephone : null,
      6,
      { oui: "complets", non: "incomplets" },
    ),
    pSeuil(
      "images_alt",
      "Images sans description alternative",
      s.joignable && s.nbImages > 0 ? s.nbImagesSansAlt : null,
      Math.max(1, Math.round(s.nbImages * 0.2)),
      5,
      compte,
    ),
  ];
  // Le SEO se lit dans le HTML : une page quasi vide rend cet axe non concluant,
  // qu'elle soit une SPA ou une page d'attente sans le moindre script.
  return agreger(preuves, !s.joignable || s.coquille);
}

function axeMobile(s: SignauxSite): NoteAxe {
  const preuves: Preuve[] = [
    pBool("viewport", "Adaptation à l'écran du téléphone", s.joignable ? s.viewport : null, 40, {
      oui: "déclarée",
      non: "absente",
    }),
    pBool(
      "zoom",
      "Zoom autorisé sur mobile",
      s.joignable && s.viewport ? !s.viewportZoomBloque : null,
      10,
      { oui: "autorisé", non: "bloqué" },
    ),
    // `nbMediaQueries` vaut `null` quand la page déclare des feuilles externes
    // dont aucune n'a pu être lue : « on ne sait pas » sort du dénominateur au
    // lieu de valoir zéro et de coûter 20 points.
    pSeuil(
      "media_queries",
      "Règles d'affichage mobile",
      s.joignable ? s.nbMediaQueries : null,
      1,
      20,
      compte,
      { inverse: true },
    ),
    pSeuil(
      "largeurs_fixes",
      `Éléments plus larges que ${SEUILS.largeurMobilePx} px`,
      s.joignable ? s.nbLargeursFixes : null,
      2,
      20,
      compte,
    ),
    pSeuil(
      "polices",
      "Textes trop petits sur mobile",
      s.joignable ? s.nbPolicesTropPetites : null,
      2,
      10,
      compte,
    ),
  ];
  // `viewport` et les largeurs fixes se lisent dans le HTML servi, même sur une
  // SPA : cet axe reste concluant. Seule une capture 390 px le confirmerait
  // vraiment, et c'est ce que fait `shot.ts` en complément.
  return agreger(preuves, !s.joignable);
}

function axeConversion(s: SignauxSite, ctx: ContexteEntreprise): NoteAxe {
  const aDesAvisGoogle = (ctx.nombreAvis ?? 0) > 0;
  const preuves: Preuve[] = [
    // Sans aucun numéro nulle part, la question « est-il cliquable ? » n'a pas de
    // réponse : c'est `inconnu`. Répondre « non » reprocherait un défaut de forme
    // sur une information que la page ne porte pas — et, depuis que les clés
    // dérivent des verdicts, cela émettrait `phone_not_clickable` sur des sites
    // qui n'affichent pas de téléphone du tout.
    pBool(
      "tel",
      "Numéro cliquable depuis un mobile",
      s.joignable && (s.telCliquable || s.telephoneEnTexte) ? s.telCliquable : null,
      25,
      { oui: "oui", non: "non" },
    ),
    pBool(
      "formulaire",
      "Moyen de vous contacter en ligne",
      s.joignable ? s.formulaire || s.mailto : null,
      20,
      { oui: "présent", non: "absent" },
    ),
    pSeuil("cta", "Boutons d'action", s.joignable ? s.nbCta : null, SEUILS.ctaMin, 20, compte, {
      inverse: true,
    }),
    {
      cle: "avis",
      libelle: "Avis clients affichés sur le site",
      // Sans avis Google connus, la question ne se pose pas : `inconnu`, donc
      // retiré du dénominateur plutôt que compté comme un manque.
      valeur: !s.joignable || !aDesAvisGoogle
        ? null
        : s.avisDansLaPage || s.widgetAvis
          ? "affichés"
          : "absents",
      seuil: null,
      poids: 15,
      verdict: !s.joignable || !aDesAvisGoogle
        ? "inconnu"
        : s.avisDansLaPage || s.widgetAvis
          ? "ok"
          : "probleme",
    },
    pBool("mentions", "Mentions légales", s.joignable ? s.mentionsLegales : null, 8, {
      oui: "présentes",
      non: "absentes",
    }),
    pBool("cookies", "Information cookies / RGPD", s.joignable ? s.bandeauCookies : null, 4, {
      oui: "présente",
      non: "absente",
    }),
    pSeuil(
      "reseaux",
      "Liens vers vos réseaux sociaux",
      s.joignable ? s.nbReseauxSociaux : null,
      1,
      8,
      compte,
      { inverse: true },
    ),
  ];
  return agreger(preuves, !s.joignable || s.coquille);
}

// ---------------------------------------------------------------------------
// Clés d'audit
// ---------------------------------------------------------------------------

/**
 * Les clés du catalogue déclenchées par les mesures — ce qui remplit
 * `entreprises_audit_site.issue_keys`, lu par `AuditWorkspace` pour pré-cocher
 * les cartes de l'audit.
 *
 * UNE SEULE SOURCE DE VÉRITÉ : une clé est émise si, et seulement si, la preuve
 * correspondante porte le verdict `probleme`.
 *
 * Cette fonction rejugeait auparavant les signaux bruts avec ses propres seuils,
 * en parallèle du barème des preuves. D'où deux vérités sur la même page : un
 * site noté « 88/100 en rapidité » recevait la carte « votre site est lent »
 * parce que son TTFB dépassait 800 ms, alors que ses six autres preuves de
 * vitesse étaient bonnes. Le prospect lisait les deux, et l'une des deux suffit à
 * discréditer le document.
 *
 * En lisant les verdicts au lieu de les refaire, la contradiction devient
 * impossible par construction — pas par vigilance.
 */
interface RegleCle {
  cle: string;
  /** Preuves à consulter, par leur `cle`, tous axes confondus. */
  preuves: string[];
  /** `une` : une preuve en problème suffit. `toutes` : il les faut toutes. */
  mode: "une" | "toutes";
}

const REGLES_CLES: RegleCle[] = [
  // La lenteur se constate sur le temps de réponse, la réception ou le poids.
  { cle: "slow_site", preuves: ["ttfb", "poids"], mode: "une" },

  // Un site sans `viewport` n'est pas adaptatif, point.
  { cle: "outdated_or_not_mobile", preuves: ["viewport"], mode: "une" },
  // Sinon il faut DEUX symptômes concordants : des largeurs figées ET aucune
  // règle d'affichage mobile. Un seul des deux ne suffit pas — un site en
  // flexbox n'a parfois aucune media query et s'adapte parfaitement, et une
  // largeur figée isolée ne fait pas un site des années 2000.
  { cle: "outdated_or_not_mobile", preuves: ["largeurs_fixes", "media_queries"], mode: "toutes" },

  { cle: "phone_not_clickable", preuves: ["tel"], mode: "une" },
  { cle: "form_not_accessible", preuves: ["formulaire"], mode: "une" },
  { cle: "weak_cta", preuves: ["cta"], mode: "une" },
  { cle: "no_reviews_on_site", preuves: ["avis"], mode: "une" },
];

export function issueKeysDepuisAxes(axes: Record<AxeId, NoteAxe>, s: SignauxSite): string[] {
  // Un site injoignable — ou une page qui se déclare en travaux — ne déclenche
  // que sa propre clé : lui reprocher en plus son téléphone non cliquable serait
  // une affirmation sur un site qui n'existe pas encore.
  if (!s.joignable || s.pageParking) return ["no_site_or_unreachable"];

  const verdicts = new Map<string, Verdict>();
  for (const axe of Object.values(axes)) {
    for (const p of axe.preuves) verdicts.set(p.cle, p.verdict);
  }

  const keys: string[] = [];
  for (const regle of REGLES_CLES) {
    if (keys.includes(regle.cle)) continue;
    const etats = regle.preuves.map((c) => verdicts.get(c));
    // Une preuve non mesurée ne déclenche jamais rien : le doute n'accuse pas.
    const enProbleme = etats.filter((v) => v === "probleme").length;
    const declenche = regle.mode === "une" ? enProbleme > 0 : enProbleme === regle.preuves.length;
    if (declenche) keys.push(regle.cle);
  }

  return keys;
}

/** Confort d'appel : depuis les signaux seuls, en passant par le barème. */
export function issueKeysDepuisSignaux(s: SignauxSite, ctx: ContexteEntreprise = {}): string[] {
  return issueKeysDepuisAxes(calculerAxes(s, ctx), s);
}

// ---------------------------------------------------------------------------
// Entrée publique
// ---------------------------------------------------------------------------

const LIBELLES: Array<{ min: number; texte: string }> = [
  { min: 85, texte: "Excellent" },
  { min: 70, texte: "Bon" },
  { min: 50, texte: "Perfectible" },
  { min: 30, texte: "Faible" },
  { min: 0, texte: "Critique" },
];

export function libelleDeNote(note: number): string {
  return LIBELLES.find((l) => note >= l.min)?.texte ?? "Critique";
}

/** Les quatre axes, sans les clés — pour que la dérivation puisse les relire. */
function calculerAxes(s: SignauxSite, ctx: ContexteEntreprise): Record<AxeId, NoteAxe> {
  return {
    vitesse: axeVitesse(s),
    seo: axeSeo(s),
    mobile: axeMobile(s),
    conversion: axeConversion(s, ctx),
  };
}

export function scorer(s: SignauxSite, ctx: ContexteEntreprise = {}): ResultatScore {
  const axes = calculerAxes(s, ctx);

  const alertes: string[] = [];
  if (!s.joignable) alertes.push("Site injoignable — aucune note n'est publiable.");
  if (s.bloque) alertes.push("Le site oppose une protection anti-robot : analyse partielle.");
  if (s.pageParking) {
    alertes.push(
      "La page se déclare elle-même en construction ou en attente : à traiter comme une " +
        "entreprise sans site, pas comme un site à corriger.",
    );
  } else if (s.ressembleSpa) {
    alertes.push(
      "Page rendue côté JavaScript : les axes SEO et conversion sont en confiance faible " +
        "et ne seront pas publiés sur le rapport.",
    );
  } else if (s.coquille) {
    alertes.push(
      "Page quasi vide : les axes SEO et conversion sont en confiance faible. Vérifier " +
        "qu'il s'agit bien du site de l'entreprise avant d'envoyer quoi que ce soit.",
    );
  }
  if (s.widgetAvis) {
    alertes.push(`Widget d'avis détecté (${s.widgetAvis}) — « avis absents » n'est pas émis.`);
  }
  if (s.joignable && !s.cssLisible) {
    alertes.push(
      "Feuilles de style externes illisibles : les règles d'affichage mobile n'ont pas " +
        "pu être vérifiées et sont exclues de la note.",
    );
  }

  // La note globale ne moyenne que les axes concluants : intégrer un axe en
  // confiance faible reviendrait à publier indirectement ce qu'on refuse
  // d'afficher directement.
  const retenus = (Object.keys(axes) as AxeId[]).filter((id) => axes[id].confiance !== "faible");
  const poidsTotal = retenus.reduce((a, id) => a + POIDS_AXES[id], 0);
  const noteGlobale =
    poidsTotal > 0
      ? Math.round(retenus.reduce((a, id) => a + axes[id].note * POIDS_AXES[id], 0) / poidsTotal)
      : 0;

  return {
    noteGlobale,
    axes,
    libelle: libelleDeNote(noteGlobale),
    issueKeys: issueKeysDepuisAxes(axes, s),
    alertes,
  };
}

// ---------------------------------------------------------------------------
// Formatage — dans ce fichier parce que les libellés sont montrés au prospect
// ---------------------------------------------------------------------------

/** L'unité est choisie sur l'échelle de la ligne, pas sur le nombre affiché. */
function ms(n: number, echelle = n): string {
  return echelle >= 1000
    ? `${(n / 1000).toFixed(1).replace(".", ",")} s`
    : `${Math.round(n)} ms`;
}

function ko(n: number, echelle = n): string {
  return echelle >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} Mo`
    : `${Math.round(n / 1000)} Ko`;
}

/** Un compte reste un compte : même signature, pour rester interchangeable. */
function compte(n: number): string {
  return `${n}`;
}
