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

import { AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";
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
  /**
   * ZÉRO, et c'est délibéré.
   *
   * La popularité locale — avis Google, qualifications affichées, ville dans le
   * titre — se constate et se vend, mais elle ne parle PAS du site. L'inclure
   * dans la note ferait dire à « votre site : 62/100 » des choses qui ne sont
   * pas le site, et la première question du prospect (« pourquoi 62 ? »)
   * n'aurait plus de réponse tenable.
   *
   * Un poids nul laisse l'axe s'afficher avec ses preuves et alimenter des
   * cartes, sans peser sur le chiffre : il ne contribue ni au numérateur ni au
   * dénominateur de la moyenne pondérée.
   */
  popularite: 0,
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
   * Plancher d'avis Google. La médiane du parc est de 20 : dix est délibérément
   * bas, pour ne constater qu'un manque criant.
   */
  avisMin: 10,
  /** Sous 4 sur 5, la note affichée dessert plus qu'elle ne rassure. */
  noteGoogleMin: 4,
  /** Sous 3,5, ce n'est plus une nuance : c'est un frein à l'achat. */
  noteGoogleGrave: 3.5,
  /**
   * En dessous, le HTML servi ne peut pas être une page d'accueil : c'est une
   * coquille, une redirection ou une page d'attente.
   */
  htmlCoquilleOctets: 5_000,
} as const;

// ---------------------------------------------------------------------------
// Petits fabricants de preuves
// ---------------------------------------------------------------------------

/**
 * Preuve binaire : présent = bon, absent = problème, INDÉTERMINÉ = inconnu.
 *
 * `== null` et non `=== null`, délibérément. Les signaux relus depuis la base
 * — ceux écrits avant l'ajout d'un champ — arrivent en `undefined`, et un
 * `=== null` les faisait tomber dans la branche « absent », c'est-à-dire lire
 * une absence de mesure comme un échec. C'est l'erreur exacte que tout ce
 * module existe pour ne pas commettre.
 */
function pBool(
  cle: string,
  libelle: string,
  present: boolean | null | undefined,
  poids: number,
  labels: { oui: string; non: string },
): Preuve {
  if (present == null) {
    return { cle, libelle, valeur: null, seuil: null, poids, verdict: "inconnu" };
  }
  return {
    cle,
    libelle,
    valeur: present ? labels.oui : labels.non,
    seuil: null,
    poids,
    verdict: present ? "ok" : "probleme",
    // Un signal binaire raté l'est totalement : il n'y a pas de « presque de
    // formulaire ». C'est ce qui le fait passer devant une mesure chiffrée qui
    // ne dépasse son seuil que d'un cheveu.
    gravite: present ? undefined : 1,
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
  valeur: number | null | undefined,
  seuil: number,
  poids: number,
  format: (n: number, echelle: number) => string,
  {
    inverse = false,
    limiteGrave: limiteGraveExplicite,
  }: { inverse?: boolean; limiteGrave?: number } = {},
): Preuve {
  if (valeur == null || !Number.isFinite(valeur)) {
    return { cle, libelle, valeur: null, seuil: format(seuil, seuil), poids, verdict: "inconnu" };
  }
  const echelle = Math.max(valeur, seuil);
  const depasse = inverse ? valeur < seuil : valeur > seuil;
  // Zone grise à 1,5× le seuil : « moyen » vaut la moitié des points, ce qui
  // évite qu'un site à 2,6 s soit noté comme un site à 12 s.
  //
  // Ce facteur suppose une grandeur non bornée — une durée, un poids, un compte.
  // Sur une échelle fermée comme une note sur 5, il n'a aucun sens : il faudrait
  // descendre à 2/5 pour déclencher, alors que 3,1/5 est déjà mauvais. D'où la
  // possibilité de fixer la limite explicitement.
  const limiteGrave =
    limiteGraveExplicite ?? (inverse ? seuil * 0.5 : seuil * 1.5);
  const grave = inverse ? valeur < limiteGrave : valeur > limiteGrave;
  const verdict: Verdict = !depasse ? "ok" : grave ? "probleme" : "moyen";
  return {
    cle,
    libelle,
    valeur: format(valeur, echelle),
    seuil: format(seuil, echelle),
    poids,
    verdict,
    gravite: depasse ? graviteDepassement(valeur, seuil, inverse) : undefined,
  };
}

/**
 * À quel point on rate le seuil : 0 en le touchant, 1 à trois fois.
 *
 * LE CHOIX DE LA COURBE. Trois fois le seuil pour la gravité maximale n'est pas
 * une constante de la nature — c'est le réglage qui range correctement le parc.
 * Sur le site qui a motivé ce champ : serveur à 1,65× le seuil → 0,33, poids de
 * page à 2,85× → 0,93. Le serveur passe donc derrière le poids de page, ce qui
 * est l'ordre qu'un artisan constaterait lui-même en ouvrant son site.
 *
 * Plus raide, tout ce qui dépasse un peu deviendrait grave et on retomberait sur
 * le tri par poids qu'on cherche à corriger. Plus plat, un site dix fois trop
 * lourd ne se distinguerait plus d'un site deux fois trop lourd.
 *
 * `inverse` : le signal est bon quand il est GRAND (une note sur 5, un nombre
 * d'avis). Rater c'est alors tomber sous le seuil, et zéro est le pire.
 */
function graviteDepassement(valeur: number, seuil: number, inverse: boolean): number {
  if (seuil <= 0) return 1;
  const rapport = inverse ? seuil / Math.max(valeur, 0.0001) : valeur / seuil;
  return Math.min(1, Math.max(0, (rapport - 1) / 2));
}

const pointsDe = (v: Verdict): number => (v === "ok" ? 1 : v === "moyen" ? 0.5 : 0);

/**
 * La note d'un ensemble de preuves, recalculée à la lecture.
 *
 * Existe pour que la popularité locale n'ait pas besoin de colonne dédiée : sa
 * note se déduit de ses preuves stockées, donc une migration non appliquée ne
 * peut pas faire échouer l'écriture d'une ligne entière.
 *
 * `null` quand rien n'a pu être mesuré — jamais zéro, qui se lirait comme un
 * jugement.
 */
export function noteDepuisPreuves(preuves: readonly Preuve[]): number | null {
  const mesurees = preuves.filter((p) => p.verdict !== "inconnu");
  const total = mesurees.reduce((a, p) => a + p.poids, 0);
  if (total === 0) return null;
  const obtenus = mesurees.reduce((a, p) => a + p.poids * pointsDe(p.verdict), 0);
  return Math.round((obtenus / total) * 100);
}

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

/**
 * La popularité locale : ce que le croisement révèle, et que la page seule ne
 * dira jamais.
 *
 * Cet axe ne note pas le site — il note la présence. Il pèse zéro dans la note
 * globale (voir `POIDS_AXES`) et existe pour deux raisons : produire des
 * constats vendables sur les entreprises dont le site va bien, et donner
 * quelque chose à dire aux 760 entreprises qui n'ont pas de site du tout.
 *
 * Il reste joignable-indépendant : une entreprise sans site a quand même une
 * fiche Google, des avis, et parfois une qualification RGE qu'elle n'exploite
 * pas. C'est le seul axe qui se mesure sur un domaine mort.
 */
function axePopularite(s: SignauxSite, ctx: ContexteEntreprise): NoteAxe {
  const avis = ctx.nombreAvis ?? null;
  const note = ctx.noteMoyenne ?? null;

  const preuves: Preuve[] = [
    // La médiane du parc est de 20 avis. Dix est un plancher volontairement bas :
    // on veut constater un manque criant, pas chicaner un artisan correct.
    pSeuil("avis_nombre", "Avis Google reçus", avis, SEUILS.avisMin, 35, compte, { inverse: true }),
    pSeuil("avis_note", "Note Google moyenne", note, SEUILS.noteGoogleMin, 25, etoiles, {
      inverse: true,
      limiteGrave: SEUILS.noteGoogleGrave,
    }),
    // `null` quand l'entreprise n'a aucune qualification : la question ne se
    // pose pas, et l'absence de réponse ne doit rien coûter.
    pBool("rge_affiche", "Qualification RGE mise en avant", s.mentionneRge, 25, {
      oui: "citée sur le site",
      non: "détenue mais absente du site",
    }),
    // `null` quand on ne connaît pas la ville : on ne juge pas ce qu'on ignore.
    pBool("seo_local", "Votre ville dans le titre du site", s.villeDansTitre, 15, {
      oui: "présente",
      non: "absente",
    }),
  ];

  // Aucune dégradation liée au site : ces preuves ne viennent pas de la page,
  // sauf les deux dernières — et celles-là valent déjà `null` si la page n'a pas
  // pu être lue, puisque `analyser` renvoie ses valeurs par défaut.
  return agreger(preuves, false);
}

// ---------------------------------------------------------------------------
// Clés d'audit
// ---------------------------------------------------------------------------

/**
 * Les clés du catalogue déclenchées par les mesures — ce qui remplit
 * `entreprises_audit_site.issue_keys`, lu par `AuditWorkspace` pour pré-cocher
 * les cartes de l'audit.
 *
 * UNE SEULE SOURCE DE VÉRITÉ, À DEUX ÉTAGES. Une clé est émise si, et seulement
 * si, la preuve correspondante porte le verdict `probleme` — et la liste de ces
 * correspondances n'est pas tenue ici : elle est déclarée par le catalogue
 * lui-même (`AUDIT_ISSUE_CATALOG[].declencheurs`). Ajouter un constat au
 * catalogue suffit donc à le rendre détectable, sans toucher à ce fichier.
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
export function issueKeysDepuisAxes(axes: Record<AxeId, NoteAxe>, s: SignauxSite): string[] {
  const verdicts = new Map<string, Verdict>();
  for (const axe of Object.values(axes)) {
    for (const p of axe.preuves) verdicts.set(p.cle, p.verdict);
  }

  const declenchees = (garder: (c: (typeof AUDIT_ISSUE_CATALOG)[number]) => boolean): string[] => {
    const keys: string[] = [];
    for (const constat of AUDIT_ISSUE_CATALOG) {
      if (!constat.declencheurs || keys.includes(constat.key) || !garder(constat)) continue;

      // Plusieurs déclencheurs pour un même constat = un « ou » entre eux.
      const declenche = constat.declencheurs.some((d) => {
        // Une preuve non mesurée ne déclenche jamais rien : le doute n'accuse pas.
        const enProbleme = d.preuves.filter((c) => verdicts.get(c) === "probleme").length;
        return d.mode === "une" ? enProbleme > 0 : enProbleme === d.preuves.length;
      });

      if (declenche) keys.push(constat.key);
    }
    return keys;
  };

  // Un site injoignable — ou une page qui se déclare en travaux — ne se juge
  // pas : lui reprocher son téléphone non cliquable serait une affirmation sur
  // une page jamais lue.
  //
  // Mais sa FICHE GOOGLE existe, elle. C'est même tout ce qu'on a à dire aux
  // 760 entreprises sans site, et c'est précisément à elles qu'on a le plus de
  // chances de vendre. Le pilier popularité ne dépend pas de la page : il reste
  // donc audible quand le reste se tait.
  if (!s.joignable || s.pageParking) {
    return ["no_site_or_unreachable", ...declenchees((c) => c.pilier === "popularite")];
  }

  return declenchees(() => true);
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

/** Les axes, sans les clés — pour que la dérivation puisse les relire. */
function calculerAxes(s: SignauxSite, ctx: ContexteEntreprise): Record<AxeId, NoteAxe> {
  return {
    vitesse: axeVitesse(s),
    seo: axeSeo(s),
    mobile: axeMobile(s),
    conversion: axeConversion(s, ctx),
    popularite: axePopularite(s, ctx),
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

  /**
   * LA NOTE GLOBALE EST UN SIGNAL DE TRI, PAS LE VERDICT DU DOCUMENT.
   *
   * Elle moyenne les axes concluants, sur tout le parc, gratuitement — c'est ce
   * qui permet de classer 2 795 entreprises et de décider lesquelles valent un
   * appel. À ce métier-là elle est bonne : il lui suffit d'ordonner.
   *
   * Elle n'est PAS la note montrée au prospect. On a vérifié qu'elle se trompe
   * dans les deux sens — un site à 70/100 qui met 18,6 secondes à s'afficher,
   * parce qu'elle ne chronomètre que la réponse du serveur. La note du document
   * se calcule ailleurs, à partir de la mesure de Google : voir `malus.ts` et
   * `noteDocument`.
   *
   * Les deux coexistent parce qu'elles ne s'adressent pas au même public. Ce qui
   * serait faux, c'est de montrer celle-ci à un artisan.
   */
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

/** Une note Google se lit sur 5, avec une décimale. */
function etoiles(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} / 5`;
}
