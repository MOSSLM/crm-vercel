import type { AuditProblem, AuditSolution } from '@/types';

// =====================================================================
// Catalogue des problèmes / solutions d'audit
// =====================================================================
// Source de vérité unique des 6 « soucis » les plus courants qu'on peut
// trouver sur le site d'un prospect, chacun associé à SA solution.
//
// Sur la page d'audit on coche les problèmes qui s'appliquent à
// l'entreprise (au moins 3). Cocher un problème affiche sa carte sur la
// page « Situation » ET sa solution pairée sur la page « Solution ».
//
// IMPORTANT : les clés (`key`) sont émises par l'analyseur de sites
// (`src/lib/audit-site/score.ts`, `issueKeysDepuisAxes`), qui les écrit dans
// `entreprises_audit_site.issue_keys`. C'est de là que viennent les cases
// pré-cochées de l'éditeur.
//
// Une clé n'est émise que si la PREUVE correspondante porte le verdict
// « probleme ». Une carte affichée ici est donc toujours adossée à une mesure
// qu'on peut montrer au prospect, et ne peut pas contredire la note de son axe.
//
// (L'en-tête renvoyait auparavant vers `edge function enrich/audit.ts`
// (AUDIT_ISSUE_KEYS) : ce fichier n'a jamais existé, et personne n'écrivait
// donc `audit_detected_issues` — que `AuditWorkspace` lit pourtant depuis
// toujours.)
// =====================================================================

/**
 * Les trois piliers de la présence en ligne d'un artisan.
 *
 * Ce découpage n'est pas une grille théorique plaquée sur le produit : il
 * recouvre les trois familles du catalogue d'offres. Le premier se répare avec
 * des prestations ponctuelles, le deuxième avec de la rédaction et du parcours,
 * le troisième — le seul qui ne se lise pas dans le HTML — avec du récurrent.
 */
export type AuditPilier = 'technique' | 'contenu' | 'popularite';

export const PILIERS: Record<AuditPilier, { titre: string; sousTitre: string }> = {
  technique: {
    titre: 'Technique',
    sousTitre: 'Votre site répond vite et Google sait le lire',
  },
  contenu: {
    titre: 'Contenu & conversion',
    sousTitre: 'Ce que votre site dit, à qui, et ce qu’il propose de faire',
  },
  popularite: {
    titre: 'Popularité locale',
    sousTitre: 'Ce que les autres disent de vous, là où on vous cherche',
  },
};

/**
 * Condition de déclenchement d'un constat, exprimée en clés de PREUVES
 * (`Preuve.cle` dans `src/lib/audit-site/score.ts`).
 *
 * C'est le cœur du dispositif : le catalogue déclare lui-même ce qui le
 * déclenche, et `score.ts` se contente de lire ces déclarations. Il n'existe
 * donc aucune seconde liste de règles à tenir alignée — c'est précisément la
 * divergence qui produisait des cartes « votre site est lent » à côté d'une note
 * de rapidité de 88/100.
 */
export interface DeclencheurConstat {
  /** Clés de preuves à consulter. */
  preuves: string[];
  /** `une` : une preuve en problème suffit. `toutes` : il les faut toutes. */
  mode: 'une' | 'toutes';
}

export interface AuditIssueDef {
  key: string;
  pilier: AuditPilier;
  /** Libellé court pour la checklist de l'éditeur */
  label: string;
  problem: { title: string; desc: string };
  solution: { name: string; desc: string; tag: string };
  /**
   * Ce qui déclenche ce constat, en preuves mesurées. Plusieurs entrées = un
   * « ou » entre elles. Absent ⇒ le constat ne se coche qu'à la main.
   */
  declencheurs?: DeclencheurConstat[];
}

export const AUDIT_ISSUE_CATALOG: AuditIssueDef[] = [
  {
    key: 'no_reviews_on_site',
    pilier: 'popularite',
    label: 'Avis clients absents du site',
    problem: {
      title: 'Vos avis clients ne sont pas mis en avant',
      desc: "Vous avez d'excellents retours sur Google, mais ils n'apparaissent pas sur votre site. C'est pourtant l'un des éléments les plus rassurants pour un visiteur qui hésite.",
    },
    solution: {
      name: 'Témoignages clients intégrés',
      desc: "Vos meilleurs avis Google affichés directement sur le site, au bon endroit, pour rassurer et convaincre au moment décisif.",
      tag: 'Confiance',
    },
    declencheurs: [{ preuves: ['avis'], mode: 'une' }],
  },
  {
    key: 'slow_site',
    pilier: 'technique',
    label: 'Site lent à charger',
    problem: {
      title: 'Site lent au chargement',
      desc: "Au-delà de 3 secondes d'attente, plus de la moitié des visiteurs quittent la page. Un site lent fait fuir des clients avant même qu'ils voient votre offre.",
    },
    solution: {
      name: 'Performance et rapidité',
      desc: "Un site optimisé qui s'affiche en moins de 2 secondes, sur mobile comme sur ordinateur. Plus de visiteurs gardés, donc plus de contacts.",
      tag: 'Performance',
    },
    declencheurs: [{ preuves: ['ttfb', 'poids'], mode: 'une' }],
  },
  {
    key: 'phone_not_clickable',
    pilier: 'contenu',
    label: 'Téléphone non cliquable',
    problem: {
      title: 'Téléphone non cliquable',
      desc: "Sur mobile, votre numéro ne se compose pas en un clic. Chaque manipulation en plus fait perdre des appels entrants pourtant à portée de main.",
    },
    solution: {
      name: 'Appel en un clic',
      desc: "Numéro cliquable et bouton d'appel toujours visible : le visiteur vous joint instantanément depuis son téléphone.",
      tag: 'Conversion',
    },
    declencheurs: [{ preuves: ['tel'], mode: 'une' }],
  },
  {
    key: 'form_not_accessible',
    pilier: 'contenu',
    label: 'Formulaire absent / trop bas / trop long',
    problem: {
      title: "Formulaire difficile d'accès",
      desc: "Votre formulaire de contact est absent, placé trop bas dans la page ou trop long. Résultat : le visiteur intéressé repart sans laisser ses coordonnées.",
    },
    solution: {
      name: 'Formulaire de devis express',
      desc: "Un formulaire court et bien placé, visible dès le premier écran, pour capter la demande au moment où l'envie est là.",
      tag: 'Conversion',
    },
    declencheurs: [{ preuves: ['formulaire'], mode: 'une' }],
  },
  {
    key: 'weak_cta',
    pilier: 'contenu',
    label: "Pas assez d'appels à l'action",
    problem: {
      title: "Trop peu d'appels à l'action",
      desc: "Sans boutons clairs (« Demander un devis », « Être rappelé »), le visiteur ne sait pas quoi faire ensuite — et finit souvent par ne rien faire.",
    },
    solution: {
      name: 'Parcours de conversion clair',
      desc: "Des appels à l'action visibles et répétés aux bons endroits, qui guident naturellement le visiteur vers la prise de contact.",
      tag: 'Conversion',
    },
    declencheurs: [{ preuves: ['cta'], mode: 'une' }],
  },
  {
    // Le cas le plus fréquent et le plus vendable du parc — et il n'était
    // représentable par aucune carte. Émis quand l'entreprise n'a pas d'URL,
    // ou quand son site ne répond plus (DNS mort, 4xx/5xx persistant).
    key: 'no_site_or_unreachable',
    pilier: 'technique',
    label: 'Pas de site / site injoignable',
    problem: {
      title: "Votre site est introuvable en ligne",
      desc: "Nous n'avons pas réussi à ouvrir votre site : il n'existe pas, ou il ne répond plus. Pendant ce temps, les clients qui cherchent votre nom sur Google ne trouvent que vos concurrents.",
    },
    solution: {
      name: 'Une présence en ligne, enfin',
      desc: "Un site complet, en ligne sous 7 jours, qui apparaît quand on cherche votre métier dans votre ville — et qui vous appartient à vie.",
      tag: 'Visibilité',
    },
  },
  {
    key: 'outdated_or_not_mobile',
    pilier: 'technique',
    label: 'Site vieillissant / mal adapté au mobile',
    problem: {
      title: 'Site vieillissant ou mal adapté au mobile',
      desc: "Un design daté ou qui s'affiche mal sur téléphone renvoie une image peu professionnelle — alors que 7 visiteurs sur 10 arrivent depuis un mobile.",
    },
    solution: {
      name: 'Design premium, mobile-first',
      desc: "Un site moderne, pensé d'abord pour le mobile, qui inspire confiance dès les 3 premières secondes.",
      tag: 'Design',
    },
    // Sans `viewport` le site n'est pas adaptatif, point. Sinon il faut DEUX
    // symptômes concordants : un site en flexbox n'a parfois aucune media query
    // et s'adapte parfaitement, et une largeur figée isolée ne fait pas un site
    // des années 2000.
    declencheurs: [
      { preuves: ['viewport'], mode: 'une' },
      { preuves: ['largeurs_fixes', 'media_queries'], mode: 'toutes' },
    ],
  },
  // ── Pilier technique ────────────────────────────────────────────────────
  {
    key: 'heavy_page',
    pilier: 'technique',
    label: 'Page trop lourde',
    problem: {
      title: 'Une page trop lourde à télécharger',
      desc: "Vos images et vos scripts font peser la page bien au-delà de ce qu'un téléphone en 4G télécharge confortablement. Sur un chantier ou dans la rue, la page met plusieurs secondes à venir.",
    },
    solution: {
      name: 'Images et code allégés',
      desc: "Images recompressées au format moderne, chargement différé de ce qui n'est pas visible tout de suite. Même contenu, une fraction du poids.",
      tag: 'Performance',
    },
    declencheurs: [{ preuves: ['poids'], mode: 'une' }],
  },
  {
    key: 'no_https',
    pilier: 'technique',
    label: 'Connexion non sécurisée',
    problem: {
      title: 'Votre site est signalé « non sécurisé »',
      desc: "Sans certificat, le navigateur affiche un avertissement avant même votre page d'accueil. C'est le premier mot que lit un client sur vous, et Google déclasse ces sites.",
    },
    solution: {
      name: 'Certificat et connexion sécurisée',
      desc: "Le cadenas dans la barre d'adresse, inclus et renouvelé automatiquement. Plus aucun avertissement entre vous et vos clients.",
      tag: 'Confiance',
    },
    declencheurs: [{ preuves: ['https'], mode: 'une' }],
  },
  {
    key: 'blocked_from_google',
    pilier: 'technique',
    label: 'Site bloqué pour Google',
    problem: {
      title: 'Votre site demande à Google de ne pas l’afficher',
      desc: "Une consigne dans le code de la page interdit aux moteurs de recherche de la référencer. Tant qu'elle est là, aucun travail de visibilité ne peut produire le moindre effet.",
    },
    solution: {
      name: 'Remise en visibilité',
      desc: "La consigne est levée, le site est déclaré aux moteurs et son indexation vérifiée. Vos pages redeviennent trouvables.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['noindex'], mode: 'une' }],
  },
  {
    key: 'no_sitemap',
    pilier: 'technique',
    label: 'Pas de plan de site',
    problem: {
      title: 'Google explore votre site à l’aveugle',
      desc: "Ni plan du site, ni fichier d'instructions pour les moteurs. Vos pages finissent par être trouvées, mais plus lentement et moins complètement que celles de vos concurrents.",
    },
    solution: {
      name: 'Plan du site et Search Console',
      desc: "Plan du site généré automatiquement, déclaré à Google, et console de suivi configurée pour voir ce qui est indexé.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['sitemap', 'robots_txt'], mode: 'toutes' }],
  },
  {
    key: 'blocking_scripts',
    pilier: 'technique',
    label: 'Scripts qui retardent l’affichage',
    problem: {
      title: 'Des scripts retardent l’affichage de la page',
      desc: "Plusieurs scripts doivent être téléchargés et exécutés avant que le moindre texte apparaisse. Le visiteur regarde une page blanche pendant ce temps.",
    },
    solution: {
      name: 'Chargement réordonné',
      desc: "Le contenu s'affiche d'abord, les scripts accessoires ensuite. La page paraît instantanée même quand tout n'est pas encore chargé.",
      tag: 'Performance',
    },
    declencheurs: [{ preuves: ['scripts_bloquants'], mode: 'une' }],
  },
  {
    key: 'no_compression',
    pilier: 'technique',
    label: 'Compression ou cache absents',
    problem: {
      title: 'Votre serveur renvoie tout, à chaque visite',
      desc: "Ni compression, ni mémoire du navigateur : chaque page est retéléchargée en entier, même par un visiteur qui revient. C'est du temps d'attente offert à personne.",
    },
    solution: {
      name: 'Hébergement optimisé',
      desc: "Compression et mise en cache activées, contenu servi depuis un réseau proche de vos visiteurs. Réglage inclus dans l'hébergement.",
      tag: 'Performance',
    },
    declencheurs: [{ preuves: ['compression', 'cache'], mode: 'toutes' }],
  },
  {
    key: 'zoom_blocked',
    pilier: 'technique',
    label: 'Zoom bloqué sur mobile',
    problem: {
      title: 'Impossible de zoomer sur votre site',
      desc: "Le site empêche d'agrandir le texte au doigt. Pour un client qui a besoin de lunettes — et ils sont nombreux dans votre clientèle — la page devient tout simplement illisible.",
    },
    solution: {
      name: 'Lecture confortable sur mobile',
      desc: "Zoom autorisé et tailles de texte pensées pour être lues à bout de bras, sans avoir à plisser les yeux.",
      tag: 'Accessibilité',
    },
    declencheurs: [{ preuves: ['zoom'], mode: 'une' }],
  },
  {
    key: 'tiny_fonts',
    pilier: 'technique',
    label: 'Textes trop petits',
    problem: {
      title: 'Des textes trop petits pour un téléphone',
      desc: "Plusieurs textes sont figés à une taille pensée pour un écran d'ordinateur. Sur mobile, ils se lisent à la loupe — quand ils se lisent.",
    },
    solution: {
      name: 'Typographie mobile-first',
      desc: "Des tailles de texte qui s'adaptent à l'écran, lisibles d'emblée sur un téléphone tenu à distance normale.",
      tag: 'Design',
    },
    declencheurs: [{ preuves: ['polices'], mode: 'une' }],
  },

  // ── Pilier contenu & conversion ─────────────────────────────────────────
  {
    key: 'weak_title',
    pilier: 'contenu',
    label: 'Titre de page absent ou mal formulé',
    problem: {
      title: 'Le titre affiché par Google ne vend rien',
      desc: "C'est la première ligne que voit un client dans les résultats de recherche, et souvent la seule qu'il lit. Le vôtre est absent, trop court ou ne dit ni votre métier ni votre ville.",
    },
    solution: {
      name: 'Titres pensés pour la recherche locale',
      desc: "Un titre par page, qui nomme votre métier et votre secteur — la formulation exacte que tapent vos clients.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['title'], mode: 'une' }],
  },
  {
    key: 'no_meta_description',
    pilier: 'contenu',
    label: 'Description Google absente',
    problem: {
      title: 'Google invente le résumé de votre site',
      desc: "Faute de description, le moteur découpe lui-même un bout de texte sous votre titre. Vous laissez à un robot le soin de rédiger votre argument d'accroche.",
    },
    solution: {
      name: 'Accroches rédigées',
      desc: "Une description écrite pour chaque page, qui donne envie de cliquer plutôt que de passer au concurrent suivant.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['description'], mode: 'une' }],
  },
  {
    key: 'no_h1',
    pilier: 'contenu',
    label: 'Titre principal absent ou multiple',
    problem: {
      title: 'Votre page n’annonce pas ce qu’elle est',
      desc: "Le titre principal est absent, ou il y en a plusieurs. Ni le visiteur ni Google ne savent en une seconde de quoi parle la page.",
    },
    solution: {
      name: 'Structure de page claire',
      desc: "Un titre principal par page et une hiérarchie de sous-titres qui suit la lecture. Plus lisible pour vos clients, plus clair pour Google.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['h1'], mode: 'une' }],
  },
  {
    key: 'images_no_alt',
    pilier: 'contenu',
    label: 'Images sans description',
    problem: {
      title: 'Vos réalisations sont invisibles pour Google',
      desc: "Vos photos de chantier n'ont aucune description textuelle. Elles n'apparaissent donc jamais dans la recherche d'images — là où beaucoup de clients cherchent un exemple avant d'appeler.",
    },
    solution: {
      name: 'Photos décrites et indexées',
      desc: "Chaque réalisation décrite en une ligne : vos photos deviennent trouvables, et le site reste lisible pour les malvoyants.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['images_alt'], mode: 'une' }],
  },
  {
    key: 'no_structured_data',
    pilier: 'contenu',
    label: 'Fiche entreprise non structurée',
    problem: {
      title: 'Google ne sait pas que vous êtes une entreprise locale',
      desc: "Rien dans votre page ne déclare votre métier, votre adresse et vos horaires dans le format que les moteurs lisent. Vous perdez les affichages enrichis que vos concurrents obtiennent.",
    },
    solution: {
      name: 'Données structurées',
      desc: "Métier, adresse, horaires et zone d'intervention déclarés dans le format attendu par Google — la base des affichages enrichis.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['jsonld'], mode: 'une' }],
  },
  {
    key: 'incomplete_nap',
    pilier: 'contenu',
    label: 'Coordonnées incomplètes',
    problem: {
      title: 'Vos coordonnées ne sont pas toutes sur la page',
      desc: "Nom, adresse et téléphone doivent figurer noir sur blanc, à l'identique de votre fiche Google. C'est le premier signal du référencement local, et l'un des plus simples à corriger.",
    },
    solution: {
      name: 'Coordonnées harmonisées',
      desc: "Vos coordonnées affichées partout de la même façon, alignées sur votre fiche Google et sur votre inscription officielle.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['nap'], mode: 'une' }],
  },
  {
    key: 'no_legal_pages',
    pilier: 'contenu',
    label: 'Mentions légales absentes',
    problem: {
      title: 'Vos mentions légales sont introuvables',
      desc: "Elles sont obligatoires pour un site professionnel. Leur absence expose l'entreprise, et un client attentif y voit un manque de sérieux avant même de vous appeler.",
    },
    solution: {
      name: 'Pages légales rédigées',
      desc: "Mentions légales, politique de confidentialité et conditions, rédigées à partir de vos informations d'entreprise.",
      tag: 'Confiance',
    },
    declencheurs: [{ preuves: ['mentions'], mode: 'une' }],
  },
  {
    key: 'no_cookie_banner',
    pilier: 'contenu',
    label: 'Information cookies absente',
    problem: {
      title: 'Aucune information sur les cookies',
      desc: "Dès qu'un site mesure son audience, il doit en informer ses visiteurs. Rien n'est prévu sur le vôtre.",
    },
    solution: {
      name: 'Conformité RGPD',
      desc: "Bandeau de consentement et mesure d'audience configurés dans les règles, sans gêner la lecture.",
      tag: 'Confiance',
    },
    declencheurs: [{ preuves: ['cookies'], mode: 'une' }],
  },
  {
    key: 'no_social_links',
    pilier: 'contenu',
    label: 'Réseaux sociaux non reliés',
    problem: {
      title: 'Votre site ignore vos réseaux sociaux',
      desc: "Aucun lien vers vos pages. Vos chantiers publiés ailleurs ne profitent pas au site, et le site ne renvoie personne vers vos publications.",
    },
    solution: {
      name: 'Présence reliée',
      desc: "Vos réseaux reliés au site dans les deux sens, pour que chaque publication travaille aussi pour votre référencement.",
      tag: 'Visibilité',
    },
    declencheurs: [{ preuves: ['reseaux'], mode: 'une' }],
  },
];

/** Sélection par défaut quand aucune détection automatique n'est disponible. */
export const DEFAULT_SELECTED_ISSUE_KEYS = [
  'no_reviews_on_site',
  'weak_cta',
  'form_not_accessible',
  'outdated_or_not_mobile',
];

/** Nombre minimum de problèmes à cocher par audit. */
export const MIN_AUDIT_ISSUES = 3;

/**
 * Nombre de cartes retenues par défaut.
 *
 * Trois, et pas quatre, pour deux raisons qui pointent dans le même sens. Un
 * audit qui aligne six griefs se lit comme un réquisitoire et dilue son propos.
 * Et la grille de la page 2 fait exactement trois colonnes : trois cartes
 * remplissent une rangée nette, quatre ou cinq laissent des trous.
 *
 * Ce qui n'est pas retenu n'est pas perdu pour autant — il est annoncé par la
 * ligne « et X autres améliorations possibles », qui est un décompte de mesures
 * et non une formule.
 */
export const CARTES_RETENUES = 3;

/** Plafond dur : deux rangées pleines. Au-delà, la page 2 déborde de l'A4. */
export const MAX_AUDIT_ISSUES = 6;

const ISSUE_BY_KEY = new Map(AUDIT_ISSUE_CATALOG.map((i) => [i.key, i]));

export function getIssueDef(key: string): AuditIssueDef | undefined {
  return ISSUE_BY_KEY.get(key);
}

// ── Rétro-liaison des cartes « legacy » (sans `key`) ──────────────────
// Les audits créés avant que les cartes portent une `key` ont stocké leurs
// problèmes/solutions par titre uniquement. On reconstruit la clé catalogue à
// partir du titre du problème (ou de son libellé) et du nom de la solution.
const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

const KEY_BY_PROBLEM_TITLE = new Map<string, string>();
const KEY_BY_SOLUTION_NAME = new Map<string, string>();
for (const i of AUDIT_ISSUE_CATALOG) {
  KEY_BY_PROBLEM_TITLE.set(norm(i.problem.title), i.key);
  KEY_BY_PROBLEM_TITLE.set(norm(i.label), i.key); // repli : ancien libellé checklist
  KEY_BY_SOLUTION_NAME.set(norm(i.solution.name), i.key);
}

/** Clé catalogue d'un problème d'après son titre (ou son libellé), sinon undefined. */
export function issueKeyForProblemTitle(title: string | null | undefined): string | undefined {
  return KEY_BY_PROBLEM_TITLE.get(norm(title));
}

/** Clé catalogue d'une solution d'après son nom, sinon undefined. */
export function issueKeyForSolutionName(name: string | null | undefined): string | undefined {
  return KEY_BY_SOLUTION_NAME.get(norm(name));
}

/**
 * Rétro-remplit la `key` des cartes « problème » qui n'en ont pas (audits
 * anciens). Sans clé, la checklist ne peut pas savoir qu'une carte est déjà
 * présente → cases décochées → re-cocher duplique la carte. Ne mute pas
 * l'entrée ; renvoie un nouveau tableau.
 */
export function backfillProblemKeys(problems: readonly AuditProblem[]): AuditProblem[] {
  return problems.map((p) => {
    if (p.key) return p;
    const key = issueKeyForProblemTitle(p.title);
    return key ? { ...p, key } : p;
  });
}

/** Idem pour les cartes « solution » (match sur le nom). */
export function backfillSolutionKeys(solutions: readonly AuditSolution[]): AuditSolution[] {
  return solutions.map((s) => {
    if (s.key) return s;
    const key = issueKeyForSolutionName(s.name);
    return key ? { ...s, key } : s;
  });
}

/** Garde uniquement les clés connues, dans l'ordre du catalogue, sans doublon. */
export function normalizeIssueKeys(keys: readonly string[] | null | undefined): string[] {
  if (!keys || keys.length === 0) return [];
  const wanted = new Set(keys);
  return AUDIT_ISSUE_CATALOG.filter((i) => wanted.has(i.key)).map((i) => i.key);
}

/** Construit les cartes « problème » à partir d'une liste de clés (ordre catalogue). */
export function problemsFromKeys(keys: readonly string[]): AuditProblem[] {
  return normalizeIssueKeys(keys).map((key) => {
    const def = getIssueDef(key)!;
    return { key, title: def.problem.title, desc: def.problem.desc };
  });
}

/** Construit les « solutions » pairées à partir d'une liste de clés (num séquentiel). */
export function solutionsFromKeys(keys: readonly string[]): AuditSolution[] {
  return normalizeIssueKeys(keys).map((key, idx) => {
    const def = getIssueDef(key)!;
    return { key, num: String(idx + 1), name: def.solution.name, desc: def.solution.desc, tag: def.solution.tag };
  });
}

/** Renumérote les solutions séquentiellement (après ajout / retrait). */
export function renumberSolutions(solutions: AuditSolution[]): AuditSolution[] {
  return solutions.map((s, idx) => ({ ...s, num: String(idx + 1) }));
}

/**
 * Garantit au moins `MIN_AUDIT_ISSUES` clés : part des clés fournies (ordre
 * conservé) puis complète avec la sélection par défaut si besoin.
 */
export function ensureMinIssueKeys(keys: readonly string[]): string[] {
  const out = normalizeIssueKeys(keys);
  if (out.length >= MIN_AUDIT_ISSUES) return out;
  for (const fallback of DEFAULT_SELECTED_ISSUE_KEYS) {
    if (out.length >= MIN_AUDIT_ISSUES) break;
    if (!out.includes(fallback)) out.push(fallback);
  }
  return normalizeIssueKeys(out);
}
