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
 * 2. **La SPA baisse la confiance, pas la note.** Un site rendu côté client
 *    renvoie un HTML quasi vide ; le lire au premier degré donnerait 10/100 à des
 *    sites très corrects. Les axes qui dépendent du contenu passent en confiance
 *    faible, et la page publique ne les affiche pas.
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
    pSeuil("ttfb", "Temps de réponse du serveur", s.ttfbMs, SEUILS.ttfbMs, 25, ms),
    pSeuil("chargement", "Temps pour afficher la page", s.chargementMs, SEUILS.chargementMs, 30, ms),
    pSeuil("poids", "Poids de la page", s.poidsOctets, SEUILS.poidsOctets, 15, ko),
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
      10,
      compte,
    ),
    pSeuil(
      "images_lazy",
      "Images chargées inutilement au démarrage",
      s.joignable && s.nbImages > 0 ? s.nbImagesSansLazy : null,
      3,
      5,
      compte,
    ),
  ];
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
  // Le SEO se lit dans le HTML : une coquille de SPA rend cet axe non concluant.
  return agreger(preuves, !s.joignable || s.ressembleSpa);
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
    pBool("tel", "Numéro cliquable depuis un mobile", s.joignable ? s.telCliquable : null, 25, {
      oui: "oui",
      non: "non",
    }),
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
  return agreger(preuves, !s.joignable || s.ressembleSpa);
}

// ---------------------------------------------------------------------------
// Clés d'audit
// ---------------------------------------------------------------------------

/**
 * Les clés du catalogue déclenchées par les mesures — ce qui remplit enfin
 * `audit_detected_issues`, lu depuis toujours par `AuditWorkspace` et écrit par
 * personne.
 *
 * Chaque clé exige une mesure POSITIVE. Un site injoignable ne déclenche que
 * `no_site_or_unreachable` : lui reprocher en plus son téléphone non cliquable
 * serait une affirmation sur une page qu'on n'a jamais lue.
 */
export function issueKeysDepuisSignaux(s: SignauxSite, ctx: ContexteEntreprise): string[] {
  const keys: string[] = [];

  if (!s.joignable) return ["no_site_or_unreachable"];

  const lent =
    (s.chargementMs != null && s.chargementMs > SEUILS.chargementMs) ||
    (s.ttfbMs != null && s.ttfbMs > SEUILS.ttfbMs) ||
    (s.poidsOctets != null && s.poidsOctets > SEUILS.poidsOctets);
  if (lent) keys.push("slow_site");

  if (!s.viewport || s.nbLargeursFixes > 2) keys.push("outdated_or_not_mobile");

  // Un téléphone qui n'apparaît nulle part n'est pas « non cliquable » : c'est
  // un autre problème, et l'affirmer serait faux.
  if (s.telephoneEnTexte && !s.telCliquable) keys.push("phone_not_clickable");

  if (!s.formulaire && !s.mailto) keys.push("form_not_accessible");

  if (s.nbCta < SEUILS.ctaMin) keys.push("weak_cta");

  // Voir `SignauxSite.widgetAvis` : sans ce garde-fou, on annonce des avis
  // manquants qui sont en réalité chargés par un script.
  if ((ctx.nombreAvis ?? 0) > 0 && !s.avisDansLaPage && !s.widgetAvis) {
    keys.push("no_reviews_on_site");
  }

  return keys;
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

export function scorer(s: SignauxSite, ctx: ContexteEntreprise = {}): ResultatScore {
  const axes: Record<AxeId, NoteAxe> = {
    vitesse: axeVitesse(s),
    seo: axeSeo(s),
    mobile: axeMobile(s),
    conversion: axeConversion(s, ctx),
  };

  const alertes: string[] = [];
  if (!s.joignable) alertes.push("Site injoignable — aucune note n'est publiable.");
  if (s.bloque) alertes.push("Le site oppose une protection anti-robot : analyse partielle.");
  if (s.ressembleSpa) {
    alertes.push(
      "Page rendue côté JavaScript : les axes SEO et conversion sont en confiance faible " +
        "et ne seront pas publiés sur le rapport.",
    );
  }
  if (s.widgetAvis) {
    alertes.push(`Widget d'avis détecté (${s.widgetAvis}) — « avis absents » n'est pas émis.`);
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
    issueKeys: issueKeysDepuisSignaux(s, ctx),
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
