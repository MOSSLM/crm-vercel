/**
 * L'usine à données : qui fait quoi, avec quoi, et ce qu'il ne faut pas refaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le « pourquoi » de chaque bot est déjà écrit — en tête de chaque fichier, et
 * très bien. Ce qui manquait, c'est l'INDEX : rien ne disait qu'un script existe
 * déjà, donc on le réécrivait. Ce registre ne remplace aucune de ces en-têtes ;
 * il dit où elles sont et ce qu'il faut savoir AVANT de les ouvrir.
 *
 * La règle : on ne fabrique pas un nouveau bot sans avoir lu l'entrée
 * correspondante ici. Si rien ne correspond, on ajoute l'entrée en même temps
 * que le bot — pas six mois plus tard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI STRUCTURE TOUT : `ecrit`
 * ─────────────────────────────────────────────────────────────────────────────
 * La discipline centrale de cette base est la séparation entre CHERCHER et
 * ÉCRIRE. `dossier-web.mjs` ramasse et n'écrit rien ; `appliquer-dossiers.mjs`
 * écrit et ne cherche rien. Ce n'est pas de la coquetterie : ça permet de
 * relancer une collecte autant de fois qu'on veut sans conséquence, et de ne
 * décider qu'après relecture. Un bot qui fait les deux est un bot qu'on ne peut
 * pas relancer.
 *
 * Le champ `ecrit` porte cette distinction. Un bot à `ecrit: true` demande un
 * archivage préalable (le trigger `updated_at` détruit sinon la preuve de ce qui
 * était là) — voir la règle d'archivage dans les entrées concernées.
 */

/** L'étape du parcours d'une entreprise, de l'inconnue à la vente. */
export type PhaseBot =
  | "collecte"
  | "presence-web"
  | "fiche-google"
  | "identite-legale"
  | "etat-du-site"
  | "enrichissement"
  | "fabrication"
  | "qualite";

export const PHASES: { cle: PhaseBot; titre: string; resume: string }[] = [
  {
    cle: "collecte",
    titre: "Collecte brute",
    resume:
      "Ramasser des entreprises qui n'existent pas encore chez nous. C'est la seule phase qui fait grossir la base.",
  },
  {
    cle: "presence-web",
    titre: "Présence web",
    resume:
      "Répondre à une seule question : cette entreprise a-t-elle un site à elle ? Trois réponses possibles, jamais deux — présent, absent, inconnu.",
  },
  {
    cle: "fiche-google",
    titre: "Fiche Google",
    resume: "Le place_id, la note, le nombre d'avis. La source la moins chère et la plus fiable du lot.",
  },
  {
    cle: "identite-legale",
    titre: "Identité légale et finances",
    resume: "SIRET, effectif, chiffre d'affaires, qualifications RGE. Un mauvais rapprochement contamine tout le reste.",
  },
  {
    cle: "etat-du-site",
    titre: "État du site existant",
    resume:
      "Sur quoi il tourne, depuis quand il n'a pas bougé, ce qu'il vaut techniquement. C'est ce qui fait l'argumentaire de vente.",
  },
  {
    cle: "enrichissement",
    titre: "Enrichissement de la fiche",
    resume: "Lire le site et en extraire de quoi fabriquer une démo : services, zone, contacts, ton.",
  },
  {
    cle: "fabrication",
    titre: "Fabrication du support de vente",
    resume: "Démo, plaquette, audit PDF, carte de partage. Ce qu'on met sous les yeux du prospect.",
  },
  {
    cle: "qualite",
    titre: "Contrôle et rattrapage",
    resume: "Mesurer ce qui a été produit, débusquer les faux positifs, rejouer un barème sans refaire le réseau.",
  },
];

/** Où le bot tourne — ça décide de qui peut le lancer et de ce qu'il coûte. */
export type ExecutionBot =
  | "script-local"
  | "edge-function"
  | "route-api"
  | "cron"
  | "service-externe"
  | "skill-claude";

export const EXECUTIONS: Record<ExecutionBot, { titre: string; resume: string }> = {
  "script-local": {
    titre: "Script local",
    resume: "Node, sur la machine du propriétaire. Aucun crédit Claude, aucun timeout Vercel, mais il faut être devant.",
  },
  "edge-function": {
    titre: "Edge function",
    resume: "Deno, chez Supabase. Tourne sans nous, mais son code n'est pas dans supabase/functions — voir l'entrée.",
  },
  "route-api": {
    titre: "Route API",
    resume: "Next.js sur Vercel. Soumise au plafond de durée : tout traitement de masse porte un curseur de reprise.",
  },
  cron: {
    titre: "Tâche planifiée",
    resume: "pg_cron côté Supabase appelle une route HTTP. Vercel Cron n'est pas utilisé — le plan ne permet que du quotidien.",
  },
  "service-externe": {
    titre: "Service externe",
    resume: "Hors de ce dépôt. On ne peut ni le lire ni le corriger ici — seulement l'appeler et le maintenir en phase.",
  },
  "skill-claude": {
    titre: "Skill Claude Code",
    resume: "Une procédure que Claude Code suit. Consomme des crédits : à réserver à ce qui demande du jugement.",
  },
};

export type StatutBot =
  /** Utilisé, maintenu, on peut compter dessus. */
  | "actif"
  /** A fait son office une fois (amorçage, rattrapage). Ne pas relancer sans lire. */
  | "ponctuel"
  /** Existe mais son état est incertain — à vérifier avant de s'y fier. */
  | "a-verifier";

export type Bot = {
  id: string;
  nom: string;
  phase: PhaseBot;
  execution: ExecutionBot;
  statut: StatutBot;
  /** Où lire le « pourquoi » en entier. Presque toujours une en-tête de fichier. */
  chemin: string;
  /** Une phrase : ce qu'il fait, pas comment. */
  resume: string;
  entree: string;
  sortie: string;
  /**
   * Écrit-il en base ? La question la plus importante du registre.
   * `false` = relançable sans conséquence. `true` = archiver avant.
   */
  ecrit: boolean;
  /** Les services tiers appelés — donc ce qui casse quand ils changent. */
  externes: string[];
  /** Ce que ça coûte réellement. « gratuit » veut dire gratuit, pas « pas encore facturé ». */
  cout: string;
  /** Comment on le lance, quand ça se lance à la main. */
  commande?: string;
  /** Ce qui le déclenche, quand ça se lance tout seul. */
  declencheur?: string;
  /**
   * Les pièges déjà payés. C'est la partie qui a de la valeur : chaque ligne
   * est une heure perdue par quelqu'un, écrite pour qu'elle ne le soit qu'une
   * fois. On n'y met pas de généralités — seulement du constaté.
   */
  regles: string[];
};

export const BOTS: Bot[] = [
  /* ───────────────────────────── Collecte brute ───────────────────────────── */
  {
    id: "gmaps-scraper",
    nom: "Scraper Google Maps",
    phase: "collecte",
    execution: "service-externe",
    statut: "actif",
    chemin: "src/app/api/gmaps/ · src/lib/gmaps/contract.ts · src/lib/aws/gmaps-ip.ts",
    resume:
      "Ramasse des fiches Google Maps par requête et par zone. Le scraper lui-même vit dans un dépôt séparé, déployé sur ECS Fargate.",
    entree: "Une requête métier + une zone géographique",
    sortie: "Des fiches brutes versées dans entreprises_raw",
    ecrit: true,
    externes: ["Google Maps (scraping)", "AWS ECS Fargate"],
    cout: "Le coût de la machine ECS tant qu'elle tourne — d'où la route scale-down.",
    declencheur: "POST /api/gmaps/crawl, à la demande",
    regles: [
      "Le contrat src/lib/gmaps/contract.ts a un JUMEAU dans le dépôt du scraper. Les deux se maintiennent à la main : changer l'un sans l'autre casse silencieusement.",
      "La file d'attente (/api/gmaps/jobs) ne réveille jamais la machine. Consulter l'état ne coûte rien ; c'est voulu.",
      "Penser à /api/gmaps/scale-down après un lot — sinon la machine tourne et facture dans le vide.",
      "entreprises_raw a trois clés de dédoublonnage mais le trigger n'en contrôle qu'une : les deux autres font échouer le lot entier, pas la ligne fautive.",
    ],
  },
  {
    id: "gmaps-suggestions",
    nom: "Où chercher ensuite",
    phase: "collecte",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/gmaps/prospection.ts · src/app/api/gmaps/suggestions/route.ts",
    resume:
      "Propose les prochaines zones à ratisser, en croisant les communes, ce qui a déjà été ramassé et les recherches déjà lancées.",
    entree: "L'historique des crawls et le référentiel des communes",
    sortie: "Une liste ordonnée de zones à couvrir",
    ecrit: false,
    externes: [],
    cout: "Gratuit — calcul en base.",
    regles: [
      "Sert à ne pas relancer deux fois la même zone : le doublon coûte plus cher en nettoyage qu'en collecte.",
    ],
  },
  {
    id: "recherche-entreprises",
    nom: "API Recherche d'entreprises",
    phase: "collecte",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/donnees-publiques/recherche-entreprises.ts",
    resume: "L'annuaire officiel des entreprises françaises : identité légale, effectif, catégorie, dirigeants.",
    entree: "Un nom + une commune, ou un SIRET",
    sortie: "Des candidats d'identité légale, jamais un choix",
    ecrit: false,
    externes: ["API Recherche d'entreprises (annuaire-entreprises.data.gouv.fr)"],
    cout: "Gratuit, sans clé, mais avec un débit limité.",
    regles: [
      "L'adresse prime sur le nom pour rapprocher. Un nom commercial ne ressemble presque jamais à la raison sociale.",
      "Pour écrire un rapprochement sans relecture humaine, il faut adresse + code postal + nom + métier concordants. Trois sur quatre ne suffisent pas.",
    ],
  },
  {
    id: "ademe-rge",
    nom: "ADEME — qualifications RGE",
    phase: "collecte",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/donnees-publiques/ademe-rge.ts",
    resume: "Les entreprises certifiées RGE, avec leur SIRET et le détail de leurs qualifications.",
    entree: "Un SIRET, ou une recherche par zone et métier",
    sortie: "Les qualifications RGE datées",
    ecrit: false,
    externes: ["API ADEME (data.ademe.fr)"],
    cout: "Gratuit.",
    regles: [
      "L'ADEME prime sur ce que dit le site de l'entreprise : un site qui affiche « RGE » sans être au registre ne l'est pas.",
      "C'est la source la plus fiable pour le SIRET, parce qu'elle le porte nativement — contrairement à Google Maps.",
    ],
  },

  /* ───────────────────────────── Présence web ────────────────────────────── */
  {
    id: "dossier-web",
    nom: "Dossier web",
    phase: "presence-web",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/dossier-web.mjs",
    resume:
      "Monte un dossier par entreprise — fiche Google, résultats de recherche, sonde HTTP de chaque candidat — pour qu'un humain tranche en dix secondes.",
    entree: "Une cohorte ou une liste d'ids",
    sortie: ".prospection/dossiers/<id>-<nom>.md, _index.jsonl, _RECAP.md",
    ecrit: false,
    externes: ["Google Places API v1", "Google Search via Playwright", "fetch direct des candidats"],
    cout: "Places API facturée à l'appel. Aucun crédit Claude — c'est du Node pur.",
    commande: "npm run dossiers -- --cohorte B",
    regles: [
      "IL NE DÉCIDE RIEN ET N'ÉCRIT RIEN. C'est ce qui permet de le relancer autant qu'on veut. L'écriture est le travail d'appliquer-dossiers.mjs.",
      "Le constat qui a créé ce script : trois secondes de recherche manuelle battaient tout l'enrichissement automatique. Le script fait la partie mécanique, pas le jugement.",
      "La fiche Google d'abord — quand elle déclare un site, ne pas chercher ailleurs. Mais ce qu'elle déclare est parfois la page d'un réseau, d'un fabricant ou d'un certificateur : ça se relit, ça ne se filtre pas.",
      "La sonde HTTP est indispensable : le titre et la description d'un résultat de moteur sont ceux du CACHE du moteur, pas de la page d'aujourd'hui.",
    ],
  },
  {
    id: "moteur-playwright",
    nom: "Moteur Playwright",
    phase: "presence-web",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/moteur-playwright.mjs",
    resume: "La vraie première page Google, lue dans un vrai navigateur à profil persistant.",
    entree: "Une requête texte (nom + ville)",
    sortie: "Les résultats extraits + le lien « Site Web » du panneau Google Business",
    ecrit: false,
    externes: ["Google Search (navigateur piloté)"],
    cout: "Gratuit, mais lent — le rythme décide si le lot va au bout.",
    declencheur: "Importé par dossier-web.mjs comme moteur par défaut",
    regles: [
      "TOUT CE QUI A DÉJÀ ÉTÉ ESSAYÉ ET QUI NE MARCHE PAS : Google en HTTP simple rend 92 ko de coquille JS et zéro résultat. DuckDuckGo coupe à la 2ᵉ requête. Sa version lite exige un CAPTCHA. Mojeek ne connaît pas les artisans français. Ne pas les retenter.",
      "LE CAPTCHA NE SE RÉSOUT JAMAIS — ni par le script, ni en le demandant à un humain : face à un navigateur piloté, Google le réémet à l'infini. Le script passe la fiche et le dit en clair.",
      "La fenêtre est VISIBLE par défaut, et c'est délibéré : headless se fait attraper, et un CAPTCHA dans un navigateur invisible est un blocage sans issue.",
      "Le profil vit dans .prospection/chrome-profil, pas dans le Chrome de tous les jours — qui serait verrouillé pendant tout le lot.",
      "Le sélecteur des résultats change tous les six mois ; la structure, non. Réparer le sélecteur, pas l'approche.",
    ],
  },
  {
    id: "verifier-sites",
    nom: "Vérificateur de sites",
    phase: "presence-web",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/verifier-sites.mjs",
    resume:
      "Va lire chaque URL détenue et cherche dans le HTML le nom, le téléphone, la ville. Un site à soi parle de soi ; un annuaire, non.",
    entree: "Les entreprises portant déjà une URL",
    sortie: "_VERIFICATION.md + _SUSPECTS.json (et constats_presence avec --constats)",
    ecrit: false,
    externes: ["fetch direct", "résolution DNS"],
    cout: "Gratuit.",
    commande: "node scripts/prospection/verifier-sites.mjs --cohorte B_sans_site",
    regles: [
      "Né d'un constat : « y a beaucoup de faux positifs, des annuaires ». Comparer le nom au domaine donnait 60 faux doutes sur 199 — c'est trop grossier, ne pas y revenir.",
      "ALLER VOIR LA PAGE est la seule preuve. host_est_generique ne connaît que les hébergeurs gratuits et les réseaux sociaux : il ignore les chaînes, les fabricants et les annuaires.",
      "Le nom se juge HORS vocabulaire de métier : « pac », « chauffage », « climatisation » n'identifient personne.",
    ],
  },
  {
    id: "appliquer-dossiers",
    nom: "Application des dossiers",
    phase: "presence-web",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/appliquer-dossiers.mjs",
    resume: "La seule moitié de la chaîne prospection qui écrit en base. Par volets, avec simulation par défaut.",
    entree: ".prospection/dossiers/*.md + _index.jsonl",
    sortie: "entreprises (site_web_canonique, google_place_id, note, avis) · constats_presence",
    ecrit: true,
    externes: ["Supabase REST"],
    cout: "Gratuit.",
    commande: "node scripts/prospection/appliquer-dossiers.mjs --volet google",
    regles: [
      "RIEN N'EST ÉCRIT SANS --ecrire. Par défaut il montre ce qu'il ferait, ligne par ligne, et s'arrête.",
      "L'ÉTAT D'AVANT EST ARCHIVÉ avant la première écriture. Le trigger updated_at détruit sinon la seule preuve de ce qui était là.",
      "Le volet google (place_id, note, avis) tourne seul ; le volet site EXIGE --relu <json> avec les ids relus par un humain.",
      "Écrire google_place_id une fois économise une recherche FACTURÉE à chaque enrichissement ultérieur : enrich-lead-magnet le re-cherche sinon par requête texte.",
      "JAMAIS écrit : qualifie et owner_id (ils appartiennent à l'attribution), ni telephone/nom/adresse (le bot voit souvent le portable du patron là où le CRM a la ligne fixe — c'est un arbitrage humain).",
      "LE PIÈGE DES CHAÎNES : toute URL réclamée par deux entreprises ou plus est ÉCARTÉE. Les écrire toutes fabriquerait des doublons de site là où il faut un tag de réseau.",
    ],
  },
  {
    id: "domaines-classes",
    nom: "Classification des domaines",
    phase: "presence-web",
    execution: "script-local",
    statut: "ponctuel",
    chemin: "scripts/prospection/domaines.mjs · scripts/prospection/semer-domaines.mjs",
    resume:
      "La semence qui distingue un annuaire, un réseau, un fabricant, un hébergeur gratuit et un vrai site d'entreprise.",
    entree: "La constante DOMAINES_CONNUS",
    sortie: "La table domaines_classes",
    ecrit: true,
    externes: ["Supabase REST"],
    cout: "Gratuit.",
    regles: [
      "Script d'amorçage : il a fait son office. Ne pas le relancer sans vérifier ce qu'il écraserait.",
      "La table s'enrichit à l'usage — c'est elle qui doit grandir, pas la constante dans le code.",
    ],
  },

  /* ───────────────────────────── Fiche Google ─────────────────────────────── */
  {
    id: "refresh-google-stats",
    nom: "Rafraîchissement note et avis",
    phase: "fiche-google",
    execution: "edge-function",
    statut: "actif",
    chemin: 'edge function enrich/index.ts (action "refresh_google_stats") · edge function enrich/google.ts',
    resume: "Remet à jour la note et le nombre d'avis d'une fiche, sans scraping ni LLM.",
    entree: "Des project_ids portant un place_id",
    sortie: "note_moyenne, nombre_avis",
    ecrit: true,
    externes: ["Google Places API v1"],
    cout: "Un appel Places par fiche. De loin l'action la moins chère de l'edge function.",
    regles: [
      "C'est le bon outil quand on veut juste des chiffres frais : il ne relance NI le scraping NI le LLM.",
      "Un place_id à l'ancien format (« ftid ») n'est plus exploitable : la fonction retombe alors sur une recherche par nom, qui est facturée.",
    ],
  },

  /* ──────────────────────── Identité légale et finances ───────────────────── */
  {
    id: "donnees-publiques",
    nom: "Hydratation des données publiques",
    phase: "identite-legale",
    execution: "cron",
    statut: "actif",
    chemin: "src/lib/donnees-publiques/ · src/app/api/donnees-publiques/ · sql/20260808_donnees_publiques_cron.sql",
    resume: "Complète en continu l'identité légale et les qualifications RGE des fiches, par petits lots.",
    entree: "Les fiches incomplètes, les plus anciennes d'abord",
    sortie: "entreprises_donnees_publiques (SIRET, effectif, CA, catégorie, RGE)",
    ecrit: true,
    externes: ["API Recherche d'entreprises", "API ADEME"],
    cout: "Gratuit, mais le débit des API impose les petits lots.",
    declencheur: "pg_cron « donnees-publiques-tick », toutes les heures à la minute 7 — 40 fiches par passage",
    regles: [
      "Les vrais chiffres vivent dans entreprises_donnees_publiques. Les colonnes ca_estime_band et nb_employes_band d'entreprises sont de la prose libre, presque toujours nulles : ne pas les lire.",
      "La résolution SIRET PROPOSE des candidats, elle ne CHOISIT jamais (POST) ; un humain valide (PATCH). Un mauvais rapprochement contamine ensuite le RGE et les finances.",
      "À CORRIGER : le secret pg_cron est en clair dans sql/20260808_donnees_publiques_cron.sql. Les migrations cron suivantes utilisent un placeholder — celle-ci est restée en arrière.",
    ],
  },

  /* ──────────────────────── État du site existant ─────────────────────────── */
  {
    id: "audit-site",
    nom: "Analyse technique du site",
    phase: "etat-du-site",
    execution: "cron",
    statut: "actif",
    chemin: "src/lib/audit-site/collect.ts → analyze.ts → score.ts → service.ts",
    resume:
      "Va chercher la page, la chronomètre, en tire des faits comptés (mobile, SSL, poids, dates), puis les note.",
    entree: "Une entreprise portant une URL",
    sortie: "entreprises_audit_site",
    ecrit: true,
    externes: ["fetch direct", "Wayback Machine (CDX)"],
    cout: "Gratuit.",
    declencheur: "pg_cron « audit-site-tick », toutes les heures à la minute 23 · ou POST /api/audit-site/[id]",
    regles: [
      "Un site injoignable, un 403 anti-robot ou un certificat expiré ne sont PAS des pannes : ce sont des RÉSULTATS. Le prospect dont le site répond 500 depuis trois mois est justement celui qu'on veut appeler — une exception le ferait disparaître de la file.",
      "Le chronométrage mesure TTFB et corps complet. Ce ne sont PAS des Core Web Vitals : ni rendu, ni exécution JS. C'est écrit tel quel dans le rapport, ne pas le vendre autrement.",
      "Trois feuilles de style lues au maximum : au-delà on paie de l'attente pour un verdict déjà acquis. La file porte 2 000 sites.",
      "Aucun défaut ne s'écrit sans sa mesure — c'est la mesure qui vend, pas l'adjectif.",
    ],
  },
  {
    id: "techno",
    nom: "Détection de technologie",
    phase: "etat-du-site",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/audit-site/techno.ts",
    resume: "Reconnaît le CMS, sa version, le thème et le constructeur de pages, à partir du HTML déjà collecté.",
    entree: "Le HTML que collect.ts a déjà en main",
    sortie: "cms, cmsVersion, theme, constructeur, generateurBrut",
    ecrit: false,
    externes: [],
    cout: "Gratuit — AUCUN appel réseau. Rien de plus que ce qui est déjà payé pour l'audit.",
    regles: [
      "WordPress se détecte par TROIS preuves indépendantes (chemins /wp-content/, version en ?ver= sur un fichier du cœur, slug du thème) parce que Yoast SEO retire la balise generator PAR DÉFAUT. Ne pas se fier au seul <meta generator>.",
      "Pour les autres plateformes, le repli est le CDN propre à chacune : static.parastorage.com pour Wix, cdn.shopify.com pour Shopify, irp.cdn-website.com pour Duda.",
      "Ce module ne juge pas, il compte. Le jugement est dans score.ts.",
    ],
  },
  {
    id: "anciennete-wayback",
    nom: "Ancienneté du site",
    phase: "etat-du-site",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/audit-site/collect.ts (sonderWayback, interrogerCdx) · analyze.ts (arbitrage)",
    resume:
      "Depuis quand le site est en ligne, et depuis quand il n'a pas bougé — l'argument le plus parlant en rendez-vous.",
    entree: "Une URL",
    sortie: "en_ligne_depuis, derniere_modif_site, sourceDerniereModif",
    ecrit: true,
    externes: ["Wayback Machine (web.archive.org/cdx)"],
    cout: "Gratuit. Deux appels CDX par site.",
    regles: [
      "collapse=digest est essentiel : sans lui on compte les re-captures identiques comme des modifications, et tout site paraît vivant.",
      "limit=1 donne la première capture connue, limit=-1 la dernière. Ce sont deux appels distincts, pas un.",
      "Trois sources de date coexistent (en-tête HTML, en-tête d'une ressource, Wayback) et analyze.ts arbitre. Le champ sourceDerniereModif dit laquelle a gagné — le citer quand on avance la date.",
    ],
  },
  {
    id: "pagespeed",
    nom: "PageSpeed Insights",
    phase: "etat-du-site",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/audit-site/pagespeed.ts · src/app/api/audit-site/[entrepriseId]/pagespeed/route.ts",
    resume: "La mesure Google officielle — celle qu'on peut montrer au prospect parce qu'elle ne vient pas de nous.",
    entree: "Une URL",
    sortie: "Les scores et métriques PSI stockés",
    ecrit: true,
    externes: ["Google PageSpeed Insights"],
    cout: "Gratuit mais LENT (~40 s) et sous quota.",
    regles: [
      "JAMAIS EN MASSE. Uniquement sur une entreprise qu'on va effectivement démarcher : le quota est la ressource rare, pas le temps.",
      "L'ordre compte : l'analyse du site d'abord (elle détermine l'URL réelle après redirection), PSI ensuite sur cette URL-là.",
    ],
  },
  {
    id: "netlinking",
    nom: "Netlinking",
    phase: "etat-du-site",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/audit-site/netlinking.ts · src/app/api/audit-site/[entrepriseId]/netlinking/route.ts",
    resume: "La notoriété du domaine vue de l'extérieur.",
    entree: "Un domaine",
    sortie: "Le score de notoriété stocké",
    ecrit: true,
    externes: ["Open PageRank (OPEN_PAGERANK_API_KEY)"],
    cout: "Gratuit sous quota de clé.",
    regles: ["Se mesure après l'analyse, sur l'URL réelle post-redirection — comme PSI."],
  },

  /* ──────────────────────────── Enrichissement ────────────────────────────── */
  {
    id: "enrich-lead-magnet",
    nom: "enrich-lead-magnet",
    phase: "enrichissement",
    execution: "edge-function",
    statut: "actif",
    chemin: "edge function enrich/ (index.ts, scraper.ts, google.ts, llm.ts, db.ts)",
    resume:
      "Lit le site d'une entreprise et en extrait, en un seul appel LLM, tout ce qu'il faut pour fabriquer une démo.",
    entree: "Des project_ids de lead_magnet_projects",
    sortie: "La fiche remplie + statut framer + opportunites.lead_magnet",
    ecrit: true,
    externes: ["Jina Reader", "Google Places API v1", "OpenAI ou DeepSeek"],
    cout: "Un appel LLM par projet — le poste le plus cher de toute la chaîne. Coût unitaire dans enrichment_llm_settings.",
    declencheur: "Trigger DB via pg_net quand pret_pour_lm passe à true · ou appel manuel",
    regles: [
      "SON CODE N'EST PAS DANS supabase/functions/ — ce dossier n'existe pas dans le dépôt. La source est edge function enrich/, recopiée puis déployée via npx supabase functions deploy. Ne pas chercher ailleurs.",
      "ELLE PART DE site_web_canonique || canonical_url. Sans URL, elle n'a rien à lire et échoue en home_unreachable_or_empty — c'est pourquoi la présence web se règle AVANT d'enrichir.",
      "La clé service_role n'est pas accessible depuis cette machine : passer par /api/marketing-pipeline/reenrich depuis le navigateur, avec overwrite:false.",
      "La variante d'URL qui a RÉPONDU devient l'origine du reste du scraping. Sans ça, les pages secondaires — celles qui portent l'email et le SIRET — étaient demandées à un hôte injoignable et revenaient vides.",
      "Les pages secondaires sont DÉCOUVERTES dans les liens de la home, pas devinées : sept chemins fixes manquaient tout site nommant sa page /nous-joindre.",
      "Menu et pied de page sont retirés : répétés à l'identique, ils occupaient une large part des 30 000 caractères du prompt.",
      "Écritures NON DESTRUCTIVES : un champ déjà rempli n'est pas écrasé, les services_tags fusionnent, et les avis actifs sont plafonnés à quatre.",
    ],
  },
  {
    id: "reenrich",
    nom: "Réenrichissement de masse",
    phase: "enrichissement",
    execution: "route-api",
    statut: "actif",
    chemin: "src/app/api/marketing-pipeline/reenrich/route.ts · _enrich-reset.ts",
    resume: "L'orchestrateur de masse de l'edge function : sélectionne un périmètre, remet à zéro, enrichit, republie.",
    entree: "Un périmètre (ids, enriched, failed, ou tout)",
    sortie: "Les projets réenrichis + les sites republiés",
    ecrit: true,
    externes: ["edge function enrich-lead-magnet"],
    cout: "Le coût LLM multiplié par le nombre de projets. Chiffrer AVANT de lancer.",
    commande: "POST /api/marketing-pipeline/reenrich depuis le navigateur (session admin)",
    regles: [
      "C'est le chemin praticable quand la clé service_role est hors de portée — il porte la session admin.",
      "Par paquets de 3, avec un curseur next_after_id : le budget est de 200 s sous un maxDuration de 300. Un lot long se reprend, il ne se relance pas depuis le début.",
      "REPUBLIER EFFACE LE CSS DU SITE : shared_assets.css est régénéré depuis le gabarit. Tout correctif CSS doit être cuit dans l'asset, sinon la republication l'annule.",
    ],
  },
  {
    id: "enrichir-lot",
    nom: "Enrichissement d'un lot neuf",
    phase: "enrichissement",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/enrichir-lot.mjs",
    resume: "Appelle l'edge function par paquets de 3 pour des projets JAMAIS enrichis. Pas de reset, pas de republication.",
    entree: "Une cohorte ou une liste de project_ids",
    sortie: "Les projets enrichis",
    ecrit: true,
    externes: ["edge function enrich-lead-magnet"],
    cout: "Coût LLM par projet.",
    regles: [
      "À N'UTILISER QUE SUR DES PROJETS NEUFS : il ne remet rien à zéro. Sur un projet déjà traité, passer par reenrich.",
      "Exige la clé service_role — donc inutilisable depuis cette machine en l'état.",
    ],
  },

  /* ──────────────────────────── Fabrication ───────────────────────────────── */
  {
    id: "audit-passe",
    nom: "Passe d'audit complète",
    phase: "fabrication",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/audit/passe.ts · scripts/audit/run.sh",
    resume: "Rejoue en ligne de commande la chaîne analyse → PageSpeed → netlinking, avec le code exact de la production.",
    entree: "Un ou plusieurs entrepriseId",
    sortie: "Les mesures d'audit en base",
    ecrit: true,
    externes: ["PageSpeed Insights", "Open PageRank"],
    cout: "Le quota PSI.",
    commande: "bash scripts/audit/run.sh scripts/audit/passe.ts <entrepriseId>",
    regles: [
      "L'ORDRE EST IMPOSÉ : analyse d'abord (elle établit l'URL réelle après redirection), PSI et netlinking ensuite sur cette URL.",
      "Ces scripts appellent les MÊMES fonctions que les routes API, via un wrapper ts-node. C'est délibéré : deux implémentations divergeraient.",
    ],
  },
  {
    id: "audit-pdf",
    nom: "PDF de l'audit",
    phase: "fabrication",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/audit/pdf.ts",
    resume: "Rend le document d'audit en A4 avec Puppeteer et le dépose dans le bucket audits-pdf.",
    entree: "Un audit préparé",
    sortie: "audits.pdf_url",
    ecrit: true,
    externes: ["Puppeteer (Chromium local)"],
    cout: "Gratuit, mais local.",
    regles: [
      "LOCAL ET SEULEMENT LOCAL. Chromium ne tient pas dans une fonction Vercel (limite 50 Mo) : @sparticuz/chromium coûterait le poids et les démarrages à froid, pour un usage qui accompagne de toute façon une préparation locale.",
      "Un audit ne se valide que s'il est préparé : le bouton de validation en lot ne lit jamais le contenu.",
    ],
  },
  {
    id: "render-provider",
    nom: "Captures de pages",
    phase: "fabrication",
    execution: "service-externe",
    statut: "actif",
    chemin: "src/lib/site-builder/render-provider.ts · src/lib/audit-site/shot.ts",
    resume: "Rend une page « comme un vrai navigateur » pour les captures et l'import visuel, via un service HTTP tiers.",
    entree: "Une URL + un viewport",
    sortie: "Une image ou un PDF stocké",
    ecrit: true,
    externes: ["ScreenshotOne par défaut (RENDER_PROVIDER, RENDER_API_KEY)"],
    cout: "Facturé au rendu.",
    regles: [
      "NI PLAYWRIGHT NI PUPPETEER ICI, et ce n'est pas un oubli : Chromium ne tourne ni dans une fonction Vercel (50 Mo) ni dans une Edge Function Deno. Le rendu est délégué, point.",
      "Le provider est derrière une variable : on peut en changer sans toucher aux appelants.",
    ],
  },
  {
    id: "og-cards",
    nom: "Cartes de partage",
    phase: "fabrication",
    execution: "cron",
    statut: "actif",
    chemin: "src/lib/og/preparer-cartes-manquantes.ts · src/app/api/og/demo/[siteId]/route.ts",
    resume: "Fabrique à l'avance les vignettes de partage des sites démo, pour que les envois n'attendent pas.",
    entree: "Les sites démo sans carte",
    sortie: "Les cartes OG stockées",
    ecrit: true,
    externes: [],
    cout: "Gratuit.",
    declencheur: "pg_cron « og-cards-tick », toutes les heures à la minute 41",
    regles: [
      "À L'AVANCE, c'est tout l'intérêt : une carte fabriquée au moment de l'envoi fait attendre l'envoi.",
    ],
  },
  {
    id: "regenerate-site",
    nom: "Régénération de site démo",
    phase: "fabrication",
    execution: "route-api",
    statut: "actif",
    chemin: "src/app/api/marketing-pipeline/regenerate-site/route.ts · src/lib/site-builder/",
    resume: "Refabrique un site démo à partir des données déjà enrichies.",
    entree: "Un projet enrichi",
    sortie: "Le site démo régénéré",
    ecrit: true,
    externes: [],
    cout: "Gratuit.",
    regles: [
      "REPUBLIER EFFACE LE CSS : shared_assets.css est régénéré depuis le gabarit. Cuire tout correctif dans l'asset.",
      "Les images d'un artisan sont à lui seul : jamais versées dans le fonds commun. entreprise_id est un mur, pas un tri.",
    ],
  },

  /* ──────────────────────── Contrôle et rattrapage ────────────────────────── */
  {
    id: "preparer-audit",
    nom: "Skill « préparer un audit »",
    phase: "qualite",
    execution: "skill-claude",
    statut: "actif",
    chemin: ".claude/skills/preparer-audit/SKILL.md · docs/audit-preparation-claude-code.md",
    resume: "La procédure que Claude Code suit pour préparer un audit : quatre appels HTTP, dans un ordre imposé.",
    entree: "Un entrepriseId",
    sortie: "Un audit rédigé et soumis",
    ecrit: true,
    externes: ["les routes /api/audit-site/ et /api/audit/"],
    cout: "Crédits Claude + quota PSI.",
    declencheur: "Se déclenche sur « préparer un audit », « auditer une entreprise »",
    regles: [
      "C'est LA SEULE skill packagée du dépôt. Il n'y en a aucune pour enrichir en masse, qualifier un lead ou générer une démo — ces tâches passent par les routes directement.",
      "Une note d'audit par opportunité, avec un plan imposé, et aucun défaut sans sa mesure.",
    ],
  },
  {
    id: "audit-rescorer",
    nom: "Rejeu du barème",
    phase: "qualite",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/audit/rescorer.ts",
    resume: "Rejoue le barème de notation sur les signaux DÉJÀ stockés, sans une seule requête réseau.",
    entree: "Les signaux en base",
    sortie: "L'effet avant/après d'un changement de barème",
    ecrit: false,
    externes: [],
    cout: "Gratuit et instantané.",
    commande: "npm run audit:rescorer",
    regles: [
      "C'est le bon outil pour juger un changement de barème : recollecter 2 000 sites pour tester une pondération serait absurde.",
    ],
  },
  {
    id: "preview-budget",
    nom: "Budget de performance",
    phase: "qualite",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/perf/preview-budget.mjs",
    resume: "Mesure TTFB, temps de rendu complet et poids d'une page démo publiée, avec seuils d'alerte.",
    entree: "L'URL d'une démo publiée",
    sortie: "Les mesures et les dépassements",
    ecrit: false,
    externes: [],
    cout: "Gratuit, zéro dépendance.",
    regles: [
      "Mêmes grandeurs que collect.ts, délibérément : on compare ce qu'on produit à ce qu'on reproche aux prospects.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Lectures                                                            */
/* ------------------------------------------------------------------ */

export function botsParPhase(phase: PhaseBot): Bot[] {
  return BOTS.filter((b) => b.phase === phase);
}

export function getBot(id: string): Bot | undefined {
  return BOTS.find((b) => b.id === id);
}

/** Ceux qui écrivent en base — ceux devant lesquels on archive d'abord. */
export function botsQuiEcrivent(): Bot[] {
  return BOTS.filter((b) => b.ecrit);
}

/**
 * Les sources citées dans le schéma « Sources et fusion » qui n'ont encore
 * aucun bot. On les liste pour que le manque soit visible plutôt que supposé.
 */
export const SOURCES_SANS_BOT: { nom: string; note: string }[] = [
  {
    nom: "ProÉco",
    note:
      "Apparaît dans le schéma des sources et dans les libellés de l'explorateur (reseau_proeco), mais aucun script, route ou fonction du dépôt ne l'interroge. Les fiches portant cette source viennent d'un versement antérieur, pas d'un bot maintenu.",
  },
];
