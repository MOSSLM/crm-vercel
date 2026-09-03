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
    ecrit: true,
    externes: ["fetch direct", "résolution DNS"],
    cout: "Gratuit.",
    commande: "node scripts/prospection/verifier-sites.mjs --cohorte B_sans_site",
    regles: [
      "N'écrit QUE sous `--constats` : sans le drapeau il visite et ne produit qu'un rapport. Avec, il pose ses constats de présence — c'est la visite qui fait foi, pas l'URL détenue.",
      "`--ids 12,34` cible un lot précis ; sans lui, il prend une cohorte entière.",
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

  {
    id: "resolution-siret",
    nom: "Résolution du SIRET — proposer",
    phase: "identite-legale",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/lib/donnees-publiques/resolution.ts · src/lib/donnees-publiques/score.ts · POST /api/donnees-publiques/resolution",
    resume:
      "Cherche l'identité légale d'une fiche par son nom et son adresse, note chaque candidat sur cinq composantes, et les range sans jamais en choisir un.",
    entree:
      "Une fiche sans SIRET : nom, ADRESSE, commune, code postal, le TEXTE de ses avis Google — et le SIREN d'une note s'il y en a un",
    sortie: "entreprise_siret_candidats, au statut « propose »",
    // Il écrit, mais des PROPOSITIONS. Relançable sans conséquence : l'upsert
    // porte sur (entreprise_id, siret), et les candidats déjà tranchés sont
    // explicitement épargnés — une décision humaine ne se fait pas effacer par
    // un passage automatique.
    ecrit: true,
    externes: ["API Recherche d'entreprises (recherche-entreprises.api.gouv.fr)"],
    cout: "Gratuit, sans clé. Séquentiel et non parallèle : marteler l'API depuis une IP unique est le meilleur moyen de faire apparaître un quota.",
    regles: [
      "Il n'écrit JAMAIS entreprises.siret. La seule porte est choix-siret, et elle réinterroge le registre avant d'écrire.",
      "Le nom de la fiche vient de Google Maps : c'est un titre COMMERCIAL, pas une raison sociale. « CLIMIZ » rend 0 résultat — elle est immatriculée TOP CLIMATISATION. D'où les variantes de recherche, qui ne sont pas une politesse mais la condition pour trouver quoi que ce soit.",
      "Le code postal filtre AVANT d'élargir : sans lui, un nom courant ramène des homonymes nationaux qui noient le bon résultat.",
      "IL CHERCHE AUSSI PAR L'ADRESSE, et toujours — pas seulement quand le nom échoue (03/09/2026). « CÉRÉLEC » avait trois candidats au-dessus du seuil, aucun n'était le bon, et son siège est au même numéro de la même rue. La requête part du NUMÉRO et s'arrête avant la commune : « 30 RUE DE CRACOVIE » trouve, « ZAE CAP NORD 30 RUE DE CRACOVIE » et « 30 RUE DE CRACOVIE SAINT-APOLLINAIRE » rendent zéro — l'annuaire fait du ET implicite, et le registre déclare souvent une autre commune que la fiche.",
      "UNE ADRESSE PARTAGÉE N'IDENTIFIE PERSONNE. Au-delà de trois entreprises distinctes au même numéro (locaux OUVERTS seulement), l'adresse est retirée du barème : c'est une domiciliation. Compter les fermés faisait passer pour un centre d'affaires le cas le plus banal du parc — l'artisan, sa holding et son EI cessée à la même adresse.",
      "LES AVIS NOMMENT L'ARTISAN QUE LE REGISTRE N'IMMATRICULE QUE SOUS SON ÉTAT CIVIL. « AR CLIM » est ADRIEN RODRIGUEZ : les initiales valent 0,8 (le seuil du critère, jamais plus — deux lettres se partagent), un avis qui NOMME la personne les porte à 1. Le TEXTE des avis seulement : leur auteur est le client.",
    ],
  },
  {
    id: "identite-evidente",
    nom: "Résolution du SIRET — trancher sans relecture",
    phase: "identite-legale",
    execution: "route-api",
    statut: "actif",
    chemin: "src/lib/lissage/choix-siret.ts (identiteEvidente, identiteProbable) · src/lib/lissage/outils-serveur.ts",
    resume:
      "Écrit le SIRET tout seul quand un seul SIREN est candidat et que les quatre critères du registre concordent. Sinon il passe la main à l'écran, sans rien écrire.",
    entree: "Les candidats au statut « propose » d'une fiche sans SIRET",
    sortie: "entreprises.siret, avec siret_source = 'resolution_auto' et decide_par = null",
    ecrit: true,
    externes: ["API Recherche d'entreprises (vérification avant écriture)"],
    cout: "Gratuit — un appel au registre par écriture.",
    regles: [
      "DEUX gardes, et il faut les deux : un SEUL SIREN candidat, ET les quatre critères concordants. Trois sur quatre ne suffisent pas — c'est la règle du registre, pas une préférence.",
      "Plusieurs SIREN = il passe la main. C'est le piège « KM Dépannage » : deux SIREN à la même adresse et au même patronyme, l'un chauffagiste et l'autre taxi. Plusieurs ÉTABLISSEMENTS d'un même SIREN, en revanche, ne posent pas la question : seule l'adresse change.",
      "`decide_par` reste NULL, et c'est délibéré : y mettre un uuid d'utilisateur ferait croire dans six mois qu'un humain a regardé la fiche.",
      "Il ne remplace pas la vérification au registre — validerCandidat réinterroge l'annuaire avant d'écrire, quelle que soit la voie.",
      "Mesuré le 20/08/2026 : 72 fiches sur 210 en attente remplissent les deux conditions. Les 138 autres continuent d'aller à l'écran.",
    ],
  },
  {
    id: "choix-siret",
    nom: "Résolution du SIRET — trancher",
    phase: "identite-legale",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/components/prospection/ChoixSiret.tsx · src/app/api/lissage/identite/route.ts · PATCH /api/donnees-publiques/resolution",
    resume:
      "L'écran qui tranche : chaque candidat sur ses quatre critères, et le SIRET retenu écrit sur la fiche après vérification au registre.",
    entree: "Les candidats au statut « propose », groupés par fiche",
    sortie: "entreprises.siret / siren / siret_source / siret_confirme_le / siret_confirme_par",
    ecrit: true,
    externes: ["API Recherche d'entreprises (vérification avant écriture)"],
    cout: "Gratuit — un appel au registre par validation.",
    regles: [
      "C'est LA SEULE PORTE qui écrit entreprises.siret, et elle exige un decide_par : on veut pouvoir dire qui a tranché, des mois plus tard, devant une fiche qui s'avère fausse.",
      "Le SIRET est vérifié au registre même quand il vient d'ailleurs (pied de page d'un site, saisie). La clé de Luhn valide une forme, pas une existence.",
      "Les quatre critères du rapprochement — adresse, code postal, nom, métier — s'affichent un par un. Un score composite ne se conteste pas ; « nom oui, code postal non » se conteste tout seul.",
      "Même quand les quatre concordent, on ne valide pas tout seul : la fiche 57 « KM Dépannage » a deux SIREN à la même adresse et au même patronyme, l'un chauffagiste et l'autre taxi.",
      "Une entreprise cessée reste proposable — c'est peut-être la bonne, et la découvrir morte est un renseignement. L'alerte se montre, elle ne se fond pas dans le score.",
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
    declencheur:
      "Un fetch explicite, depuis quatre routes seulement — AUCUN trigger DB, contrairement à ce que cette ligne annonçait",
    regles: [
      "SON CODE N'EST PAS DANS supabase/functions/ — ce dossier n'existe pas dans le dépôt. La source est edge function enrich/, recopiée puis déployée via npx supabase functions deploy. Ne pas chercher ailleurs.",
      "AUCUN TRIGGER NE L'APPELLE, et cette entrée a prétendu le contraire jusqu'au 30/08/2026. lead_magnet_projects porte huit triggers (defaults, favicon, snapshot des tags, contenu, updated_at, sync email, sync logo, sync statut) et un seul passe par pg_net : trg_leadmagnet_favicon, qui appelle generate-leadmagnet-favicon. C'est de là que venait la confusion — il y a bien un appel HTTP au départ de cette table, il ne va simplement pas ici. Le contrôle tient en une requête : select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.lead_magnet_projects'::regclass and not tgisinternal.",
      "QUATRE ROUTES L'APPELLENT, et rien d'autre : marketing-pipeline/reenrich, lead-magnet/enrich, settings/ville-seo/recompute, settings/google-stats. Toutes par fetch ${SUPABASE_URL}/functions/v1/enrich-lead-magnet.",
      "⚠️ « PRÉPARER L'ENRICHISSEMENT » NE LANCE RIEN. enrich-prepare pose pret_pour_lm = true et remet le projet en draft, c'est tout — elle rend le projet enrichissable et laisse l'appelant tirer. Croire qu'elle enrichit fait attendre un résultat qui ne viendra jamais, et chercher la panne dans l'edge function.",
      "ELLE PART DE site_web_canonique || canonical_url. Sans URL, elle n'a rien à lire et échoue en home_unreachable_or_empty — c'est pourquoi la présence web se règle AVANT d'enrichir.",
      "La clé service_role n'est pas accessible depuis cette machine : passer par /api/marketing-pipeline/reenrich depuis le navigateur, avec overwrite:false.",
      "La variante d'URL qui a RÉPONDU devient l'origine du reste du scraping. Sans ça, les pages secondaires — celles qui portent l'email et le SIRET — étaient demandées à un hôte injoignable et revenaient vides.",
      "Les pages secondaires sont DÉCOUVERTES dans les liens de la home, pas devinées : sept chemins fixes manquaient tout site nommant sa page /nous-joindre.",
      "Menu et pied de page sont retirés : répétés à l'identique, ils occupaient une large part des 30 000 caractères du prompt.",
      "Écritures NON DESTRUCTIVES : un champ déjà rempli n'est pas écrasé, les services_tags fusionnent, et les avis actifs sont plafonnés à quatre.",
    ],
  },
  {
    id: "attribuer-lot",
    nom: "Attribution d'un lot à un agent",
    phase: "fabrication",
    execution: "script-local",
    statut: "ponctuel",
    chemin: "scripts/prospection/attribuer-lot.ts",
    resume:
      "Le bouton « Attribuer le lot à un agent » par la porte de service : même population, mêmes fonctions, sans navigateur.",
    entree: "Un lot (identifiant ou nom) et un agent",
    sortie: "entreprises.owner_id, l'affaire reprise, la fiche qualifiée, l'inscription en séquence",
    ecrit: true,
    externes: ["Supabase REST"],
    cout: "Gratuit. Quelques requêtes par fiche, quatre de front.",
    commande:
      "./scripts/audit/run.sh scripts/prospection/attribuer-lot.ts --lot \"Semaine 36 — Bilal\" --agent <uuid> [--dry-run]",
    declencheur: "À la main. Le geste normal est le bouton de la fiche du lot.",
    regles: [
      "IL EXISTE PARCE QU'UN BOUTON NON DÉPLOYÉ N'EXISTE PAS. Écrit le 30/08/2026 : la répartition de la semaine 36 était figée, le bouton codé, et 315 fiches restaient chez une seule personne faute de déploiement. Il redevient inutile dès que la branche est en production.",
      "IL NE DUPLIQUE RIEN : il appelle `entreprisesDuLotAAttribuer` puis `assignProspectsToAgent`, exactement ce que fait POST /api/admin/assign, boucle de 200 comprise. Si la règle d'attribution change, elle change pour les deux.",
      "JAMAIS un `update entreprises set owner_id`. La fonction pose le propriétaire, REPREND l'affaire existante au lieu d'en ouvrir une seconde, qualifie, et met en séquence. Un update brut fabriquerait une fiche attribuée sans inscription — invisible sur tous les écrans, et rien ne le signalerait.",
      "REJOUABLE SANS DOMMAGE : la population est filtrée sur `owner_id` différent de l'agent visé, donc un second passage ne réécrit rien et rend zéro.",
      "UNE FICHE SANS AUCUN CANAL N'EST PAS INSCRITE, et ce n'est pas une panne : `mettreEnSequence` rend `injoignable` et ne crée rien. Elle est attribuée, qualifiée, et ne produira aucune tâche tant qu'elle n'a pas de numéro. 5 des 315 du 30/08 étaient dans ce cas.",
      "--dry-run compte et montre la part de mobiles sans rien écrire. À jouer d'abord.",
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
    id: "plaquettes-jetons",
    nom: "Jetons de plaquette",
    phase: "fabrication",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/lib/audit/plaquette.ts (assurerJetonsPlaquette) · src/app/api/agent/marketing-pipeline/plaquette/route.ts · src/app/api/atelier/plaquettes/route.ts",
    resume:
      "Pose un jeton de plaquette par entreprise, et le lien qui va avec. Le document est le même pour tous — c'est l'URL qui change, pour qu'une ouverture s'attribue à quelqu'un.",
    entree: "Une sélection d'entreprises (route agent) ou un lot (route atelier)",
    sortie: "entreprises_rapport_public.plaquette_token, et l'URL /plaquette/{jeton}",
    ecrit: true,
    externes: [],
    cout: "Nul. Un aller-retour SQL, quelle que soit la taille de la sélection.",
    commande:
      "Pipeline marketing → « Plaquette » (agent) · Atelier → un lot → « Préparer les plaquettes » (admin)",
    regles: [
      "IDEMPOTENTE PAR CONSTRUCTION : `on conflict` + `coalesce` gardent le jeton existant. C'est ce qui fait que les liens déjà partis par WhatsApp continuent d'ouvrir — ne jamais « régénérer » un jeton pour rafraîchir une plaquette, le contenu se relit tout seul.",
      "CONSÉQUENCE À NE PAS RATER : puisque relancer sur une entreprise déjà pourvue ne fait rien, une sélection prise « dans l'ordre » retomberait sur les mêmes à chaque appel. La route atelier demande donc `entreprises_sans_plaquette(lot)` — les manquantes, pas les premières. Sans ça, le deuxième clic ne prépare RIEN et le lot n'avance jamais au-delà de ses 300 premières fiches.",
      "DEUX ROUTES, ET CE N'EST PAS UN DOUBLON : celle de l'agent est `role: \'freelance\'`, et `requireRole` teste l'ÉGALITÉ du rôle — un admin y reçoit 403 malgré le principe « un admin a toutes les capacités », parce que le contrôle de rôle passe avant celui de capacité. La route atelier est la porte admin ; le TRAVAIL, lui, reste `assurerJetonsPlaquette`, appelée par les deux.",
      "Ça prépare le LIEN, pas le PDF. Le PDF est `plaquette-pdf`, local et seulement local. Pour un envoi WhatsApp le lien vaut mieux : il relit les prix du jour, le fichier est une photo qui se périme.",
      "Plafond de 300 par appel dans les deux routes. Au-delà c'est une vague, et une vague se prépare avec de quoi la relire.",
    ],
  },
  {
    id: "plaquette-pdf",
    nom: "PDF des plaquettes",
    phase: "fabrication",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/prospection/plaquettes-pdf.ts",
    resume:
      "Fabrique en lot le PDF A4 de la plaquette de chaque prospect en file, et le dépose dans le bucket plaquettes-pdf.",
    entree: "Les tâches dont le payload porte plaquette_url (étape marquée attachPlaquette)",
    sortie: "payload.plaquette_pdf + plaquette_pdf_nom sur la tâche",
    ecrit: true,
    externes: ["Puppeteer (Chromium local)"],
    cout: "Gratuit, mais local — compter quelques secondes par plaquette.",
    regles: [
      "LOCAL ET SEULEMENT LOCAL, comme le PDF d'audit : Chromium ne tient pas dans une fonction Vercel.",
      "ON NAVIGUE VERS LA PAGE RÉELLE (/plaquette/{jeton}?a4), on ne reconstruit pas le HTML. Le rendu A4 lit les offres du jour, la capture de la démo et le prix DE CE PROSPECT : un second rendu divergerait au premier changement de tarif.",
      "?a4 SANS ?imprimer : la version imprimable ouvre une boîte de dialogue dont Chromium sans tête n'a que faire, et le ?a4 seul ne compte pas d'ouverture — la passe ne fabrique donc pas de fausses lectures au nom des prospects.",
      "LE FORMAT MOBILE EXISTE AUSSI (huit pages de téléphone, enregistrées depuis le CRM par ?imprimer), mais cette passe ne le fabrique pas — et si elle le fabriquait un jour, jamais en naviguant vers /plaquette/{jeton} nu : le mobile sans paramètre est le SEUL rendu que la page compte comme une ouverture du prospect.",
      "UN PDF EST UNE PHOTO. La plaquette en ligne relit les prix à chaque ouverture ; le fichier, non. Le nom porte sa date : on refabrique avant chaque vague, on ne réutilise pas les fichiers du mois dernier.",
      "Une plaquette en échec n'arrête pas la vague : elle est nommée en fin de passe, et relancer le script reprend celles qui manquent.",
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
    id: "finir-demos",
    nom: "Finir les démos de la file",
    phase: "fabrication",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/lissage/finir-demos.ts",
    resume:
      "Reprend les démos de la file de démarchage là où le clonage les laisse : tire leurs photos, fabrique leur vignette, et ne les marque prêtes que si la vignette a pu sortir.",
    entree:
      "La file de « Ma journée » des deux agents — le filtre EXACT de GET /api/agent/tasks (owner_id, pending|snoozed, call|whatsapp|linkedin, enrollment_id non nul)",
    sortie:
      "entreprise_tirages_photos · sites.og_image_url / og_shot_url · sites.build_stage = 'pret'",
    ecrit: true,
    externes: ["thum.io (captures, via renderViewportShot)"],
    cout: "Deux captures par démo. Gratuit sans clé de rendu, ~13 s par carte à concurrence 4.",
    commande:
      "TS_NODE_BASEURL=. npx ts-node -r ./scripts/_shim-server-only.js -r tsconfig-paths/register -O '{\"module\":\"commonjs\",\"moduleResolution\":\"node\",\"jsx\":\"react-jsx\",\"isolatedModules\":false,\"baseUrl\":\".\"}' scripts/lissage/finir-demos.ts --ecrire",
    regles: [
      "IL EXISTE PARCE QUE `cloneTemplateSite` REND UN SITE EN `a_faire`, et que `choisirSiteMontrable` refuse exactement cet état. Les 110 démos fabriquées le 03/09/2026 étaient invisibles pour tout ce qui envoie un lien : le travail était fait et ne servait à rien.",
      "LA VIGNETTE EST LE GARDE-FOU DE LA VALIDATION, et c'est le seul contrôle de rendu du dépôt : `ensureDemoScreenshot` refuse une capture quasi vide (`imageQuasiVide`), donc une carte qui sort prouve que la page s'est affichée. Aucun site ne passe à `pret` sans sa carte ; un échec de capture le laisse en chantier et se compte.",
      "SANS TIRAGE, LA BANDE SE RE-RÉSOUT À CHAQUE RENDU et retombe sur la même photo. Mesuré le 03/09/2026 : la démo d'ENEOLE (3 métiers) rendait 3 photos distinctes dans une bande de 6, deux affichées deux fois ; après tirage, 6 distinctes, zéro doublon. Ce n'est pas un réglage fin.",
      "LE TIRAGE NE PÉRIME AUCUNE VIGNETTE : `AUTO_IMAGE_ZONES` ne contient que `realisations`, et la capture est cadrée `position: \"top\"` sur le premier écran. On ne recapture donc PAS les démos déjà vignettées — c'eût été 102 captures pour un pixel inchangé.",
      "LA POPULATION EST RECOPIÉE DE LA ROUTE, pas réinventée. En particulier ce n'est pas `assignee_id` : la file se cadre sur le PROPRIÉTAIRE de la fiche, et les deux diffèrent (271 fiches par assignee contre 265 par owner au 03/09).",
      "⚠️ `revalidateTag` ÉCHOUE DEPUIS UN SCRIPT (« static generation store missing ») : la fraîcheur ne tient qu'au `revalidate` de 30 s de `SITE_CACHE_REVALIDATE_SECONDS`. Conséquence payée : une capture prise dans la minute qui suit une écriture photographie la page D'AVANT. Attendre 30 s, ou vérifier la page avant de capturer.",
      "⚠️ THUM.IO MET SES CAPTURES EN CACHE PAR URL. `buildDemoCard(force)` recapture bien et reçoit l'image d'avant : le nom du fichier étant un hash du contenu, l'URL de la carte ne bouge pas et on croit que rien n'a marché. Pour une vraie recapture, passer une URL différente à `ensureDemoScreenshot` (un paramètre que la page ignore), puis vider `og_image_url` et rappeler `buildDemoCard` SANS `force` — il réutilise alors la capture fraîche au lieu d'en redemander une cachée.",
      "`--etape 1|2|3` et `--limite N` servent à reprendre une passe coupée : les trois étapes sont idempotentes, et l'étape 3 relit l'état en base plutôt que la lecture du début.",
    ],
  },
  {
    id: "siret-mentions-legales",
    nom: "SIRET dans les mentions légales",
    phase: "identite-legale",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/lissage/siret-mentions-legales.ts",
    resume:
      "Dernier recours quand l'annuaire ne rend rien sur le nom ni sur l'adresse : lire le SIREN ou le SIRET que la loi oblige à publier sur le site du prospect.",
    entree: "Les fiches du portefeuille sans SIRET qui portent une URL de site",
    sortie: "entreprises.siret (via validerCandidat, source 'recherche_web')",
    ecrit: true,
    externes: ["Les sites des prospects (lecture HTML)", "Annuaire des entreprises (vérification)"],
    cout: "Gratuit. Au plus quatre pages lues par fiche, aucun script exécuté.",
    commande:
      "TS_NODE_BASEURL=. npx ts-node -r ./scripts/_shim-server-only.js -r tsconfig-paths/register -O '{\"module\":\"commonjs\",\"moduleResolution\":\"node\",\"jsx\":\"react-jsx\",\"isolatedModules\":false,\"baseUrl\":\".\"}' scripts/lissage/siret-mentions-legales.ts --ecrire",
    regles: [
      "LE CHEMIN DES MENTIONS NE SE DEVINE PAS. Cinq chemins probables (`/mentions-legales`, `/mentions`, `/legal`…) ont rendu ZÉRO sur les 49 fiches du 03/09/2026 : COLDEX les met en `/home/mentionslegales/`, e-Novelec en `/cms/2-mentions-legales-e-novelec`. On lit l'accueil et on SUIT ses liens ; les chemins devinés ne restent qu'au cas où l'accueil soit illisible.",
      "UN SIREN VAUT AUTANT QU'UN SIRET et il est plus courant (« RCS SAINT-MALO 425 110 376 ») : `chercherCandidats` sait le déplier. Mais neuf chiffres ressemblent aussi à un téléphone — deux gardes obligatoires, l'ancre « SIREN »/« RCS » ET la clé de Luhn.",
      "⚠️ CE QUI EST LU N'EST PAS VÉRIFIÉ. C'est `validerCandidat` qui tranche en réinterrogeant l'annuaire. Et SES AVERTISSEMENTS SE LISENT : sur trois écritures du 03/09, une était fausse — SIREN glané sur une page devinée, registre à Perpignan quand la fiche est à Toulouse, entreprise cessée depuis avril. Retirée à la main. Un mauvais rapprochement contamine ensuite le RGE et les finances.",
      "⚠️ UN SIRET VENU DU WEB NE LAISSE AUCUNE LIGNE DE CANDIDAT : `validerCandidat` met à jour `entreprise_siret_candidats` et le numéro n'y figure pas, donc les écrans de relecture ne le montrent pas. La seule trace est `entreprises.siret_source = 'recherche_web'` + `siret_confirme_le`.",
      "CE QU'IL RÉVÈLE EN PASSANT : 29 des 49 sites étaient injoignables (17 domaines qui ne résolvent plus, 2 certificats expirés, 6 pages 404/403). Ces fiches portent un `site_web_canonique` et passent pour « avec site » par la COLONNE — un constat explicite l'emporterait. C'est `verifier-sites` qui doit trancher, pas ce script.",
      "⚠️ NE PAS SONDER SANS BORNER LA CONCURRENCE. Une première mesure des logos, lancée à 118 requêtes simultanées, a rendu `UND_ERR_CONNECT_TIMEOUT` jusque sur des URLs Supabase qui marchent : le verdict était un artefact de la sonde. Six à la fois, et une seconde tentative avant de conclure.",
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

  {
    id: "plan-redirections",
    nom: "Plan de redirection depuis l'ancien site",
    phase: "fabrication",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/app/api/site-builder/sites/[siteId]/redirections/plan/route.ts · src/lib/site-builder/plan-redirections.ts",
    resume:
      "Lit le sitemap de l'ancien site du client et propose, URL par URL, vers quelle page du nouveau site rediriger.",
    entree: "Le domaine de l'ancien site + le plan de pages du nouveau",
    sortie: "Des propositions notées et une liste d'orphelins — rien n'est écrit",
    ecrit: false,
    externes: ["Le site du client (lecture HTTP)"],
    cout: "Gratuit. Quelques requêtes HTTP, plafonnées à 6 sitemaps et 1500 URLs.",
    commande: "Éditeur du design → « Mise en ligne » → « Proposer depuis l'ancien site »",
    regles: [
      "À LANCER AVANT LA BASCULE DU DNS. Une fois le domaine pointé chez nous, son sitemap.xml est le NÔTRE : le plan se bâtirait sur les URLs du nouveau site. La route refuse un domaine déjà rattaché, mais elle ne peut rien contre un DNS basculé sans rattachement.",
      "Il propose, il n'écrit pas. L'enregistrement est un second geste (PUT /redirections), après relecture — un rapprochement par mots se trompe, et une redirection fausse est pire qu'une redirection absente.",
      "Sans sitemap, le repli lit les liens de l'accueil : la couverture est partielle par construction. Les pages qu'aucun lien ne pointe plus n'existent que dans la Search Console du client.",
      "Le score n'est pas une garantie : au-dessous de 0,5, relire une par une.",
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
    id: "rechauffeur",
    nom: "Réchauffeur d'adresses",
    phase: "qualite",
    execution: "cron",
    statut: "a-verifier",
    chemin:
      "src/lib/rechauffeur/ · src/app/api/rechauffeur/tick/route.ts · src/app/api/prospection/rechauffeur/expediteurs/route.ts · sql/20260902_rechauffeur_cron.sql · docs/lemlist/08-rechauffeur.md",
    resume:
      "Envoie chaque jour du courrier ordinaire depuis l'adresse de prospection vers des boîtes témoins, lit ces boîtes en IMAP pour savoir où il a atterri, le sort du spam et fait répondre les témoins.",
    entree: "Les expéditeurs en chauffe et le maillage de témoins",
    sortie: "Un taux de placement mesuré, et la capacité de prospection du jour",
    ecrit: true,
    externes: ["Resend", "les serveurs IMAP/SMTP des témoins"],
    cout: "Un envoi Resend par message de chauffe. Zéro crédit Claude : le texte est recombiné, pas rédigé par un modèle.",
    declencheur:
      "pg_cron « rechauffeur-tick », toutes les dix minutes (sql/20260902_rechauffeur_cron.sql) — plus le bouton « Lancer un tick maintenant » de l'écran, ouvert à l'admin",
    regles: [
      "IL PART PAR RESEND, JAMAIS D'UNE BOÎTE. Chauffer les boîtes @samadigitalstudio.com chez LWS n'apporte RIEN à contact@samadigitalstudio.fr qui part par SES : ni le domaine signant, ni l'IP ne coïncident. Ce sont deux réputations distinctes.",
      "Il n'écrit pas dans email_logs. Le disjoncteur de rebonds y compte son dénominateur sur channel = 'email' : quarante messages de chauffe par jour y noieraient un vrai rebond de prospection.",
      "Sa route et son cron sont à lui : maxDuration 300 contre 60 pour le tick des séquences, et toutes les dix minutes contre chaque minute.",
      "DEUX TRANSPORTS, JAMAIS CONFONDUS. Nous → témoin part par Resend (même d=, même pool que la prospection : c'est la seule façon dont la chauffe lui profite). Témoin → nous part du SMTP PROPRE du témoin — une réponse expédiée par le vrai Gmail est un vrai message Gmail-vers-nous, et la simuler depuis chez nous la viderait de son sens.",
      "Un placement ne se réécrit jamais : sauver un message du spam le ferait basculer en « boîte » au tick suivant, et le taux de placement mesurerait notre propre sauvetage au lieu du verdict du filtre.",
      "On ne lit que ce qui porte l'en-tête X-Sama-Ref. Un témoin est une vraie boîte avec du vrai courrier : rien d'autre n'est jamais ouvert, déplacé ni marqué.",
      "TROIS INTERRUPTEURS, ET AUCUN NE SIGNALE SON ABSENCE. Le cron doit être posé, l'expéditeur doit être « chauffe », et il doit porter une demarre_le : sans les trois, le réchauffeur rend zéro partout — exactement ce qu'afficherait une panne. Mesuré le 02/09/2026, quatorze jours après la migration : aucun cron, un seul expéditeur en pause et sans date, rechauffe_journal vide. Quatre témoins branchés pour rien.",
      "L'expéditeur se déclare et se démarre depuis l'écran (/api/prospection/rechauffeur/expediteurs). Il l'a longtemps fallu en SQL — donc personne ne l'a fait.",
      "⚠️ UNE LIGNE D'EXPÉDITEUR SUFFIT À FERMER LA VANNE DE LA PROSPECTION. plafondProspectionDuJour rend null — « je ne plafonne rien » — quand il n'y a AUCUN expéditeur, et 0 dès qu'il y en a un qui n'est pas en chauffe. Déclarer une adresse sans la démarrer est donc STRICTEMENT PIRE que ne pas en déclarer, dès lors que regulator_settings.plafond_rechauffeur est armé : min(daily_cap, 0) = 0. Le 01/09/2026 à 16 h 34, un même enregistrement a dépausé le régulateur ET confié le plafond à une chauffe jamais démarrée : la vanne s'est rouverte et refermée dans le même geste, 200 inscriptions ont tenu sur hold_reason = 'daily_cap' un jour et demi. Un bandeau rouge le dit désormais sur l'écran du régulateur, avec de quoi reprendre le plafond.",
      "NE PAS ARMER LE PLAFOND AVANT QUE LA COURBE AIT RATTRAPÉ LE VOLUME RÉEL. palierDuJour n'ouvre du froid qu'à partir du 8e jour (2/j), puis 13 à J15, 34 à J28, la cible ensuite. Armé sur un domaine qui envoyait déjà, il ne protège rien qu'un plafond fixe ne protège — il coupe. Il devient un vrai garde-fou quand un placement est mesuré ET que froid rejoint le volume envoyé.",
      "Reprendre après une pause GARDE demarre_le : la courbe mesure l'ancienneté de la boîte aux yeux des filtres, pas notre assiduité. La repousser ferait redescendre un domaine chauffé depuis trois semaines au palier du premier jour, et mentir capacite() qui autorise la prospection sur ce nombre.",
      "Statut « à vérifier » jusqu'au premier tick réel : le code est complet et typé, mais aucune session IMAP n'a encore été ouverte contre un vrai fournisseur.",
    ],
  },
  {
    id: "reception-entrants",
    nom: "Réception des réponses",
    phase: "qualite",
    execution: "route-api",
    statut: "a-verifier",
    chemin:
      "src/lib/email/reception.ts · src/lib/email/reception-db.ts · src/app/api/email/entrant/route.ts · docs/lemlist/15-reception.md",
    resume:
      "La porte par laquelle une réponse de prospect rentre : elle range le message dans le fil, et fait repartir la séquence quand — et seulement quand — c'est une vraie réponse appariée avec certitude.",
    entree: "Un message normalisé posté par un facteur (webhook de routage ou relève IMAP), signé en HMAC",
    sortie: "Une ligne email_logs direction='entrant', et l'appel à declarerReponse quand il est légitime",
    ecrit: true,
    externes: ["le transport reste à choisir : routage d'e-mail vers webhook, ou relève IMAP"],
    cout: "Gratuit. Zéro crédit Claude : rien n'est rédigé ni classé par un modèle, tout se lit dans les en-têtes.",
    regles: [
      "UNE ABSENCE N'EST PAS UNE RÉPONSE. declarerReponse débloque une attente ET réancre la suite : un « je suis en congés » traité comme une réponse enverrait à un répondeur l'étape écrite pour quelqu'un qui vient de parler. Trois natures — réponse, automatique, rebond — et une seule débloque.",
      "IL FAUT UN HUMAIN ET UN APPARIEMENT EXACT. Le sous-adressage (contact+<inscription>@, éprouvé chez LWS le 19/08) ou le In-Reply-To débloquent ; l'adresse de l'expéditeur seule RANGE le message mais n'avance aucune séquence — deux inscriptions peuvent viser la même adresse.",
      "L'idempotence est une INSERTION, pas une lecture : l'index unique sur email_logs.message_id tranche, et c'est le conflit 23505 qui dit « déjà vu ». Deux livraisons simultanées passeraient toutes deux un contrôle préalable, et la séquence avancerait d'une étape de trop.",
      "Un message sans Message-ID entre quand même — perdre une réponse serait pire qu'en avoir deux — mais le bilan le dit (protege: false).",
      "⚠️ NE JAMAIS poser sales_pipeline_state.replied ici. Le raisonnement est en tête de reply.ts : hasInterest() s'en sert pour éteindre les cellules WhatsApp et Appel, ce qui couperait les étapes que la séquence veut enchaîner.",
      "Statut « à vérifier » tant qu'aucun facteur n'est branché : le code est complet, testé et appliqué en base, mais aucun message réel n'est encore entré par cette porte.",
    ],
  },
  {
    id: "veilles-signaux",
    nom: "Passe de veille (signaux)",
    phase: "qualite",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/lib/prospection/signaux.ts · src/lib/prospection/signaux-db.ts · src/app/api/prospection/veilles/[id]/passe/route.ts · sql/20260820_veilles.sql",
    resume:
      "Balaie un périmètre à la recherche d'un déclencheur (RGE qui expire, site injoignable, rapport ouvert) et ne rend que ce qu'on n'avait jamais vu. Elle MONTRE : aucune inscription, aucun envoi, aucune tâche.",
    entree: "Une veille en base : un déclencheur du catalogue + un périmètre (les attribuées, ou tout le parc)",
    sortie: "Des lignes veille_constats — la première fois que cette entreprise a satisfait ce déclencheur",
    ecrit: true,
    externes: [],
    cout: "Gratuit. Zéro crédit Claude et aucune API tierce : tout se lit dans les tables du CRM.",
    regles: [
      "UNE VEILLE N'AGIT JAMAIS. Un déclencheur pose une ligne sur un écran, rien d'autre. Un signal qui inscrirait ou enverrait referait la faute des 59 gelées — un mécanisme qui avance sans que personne le voie — en pire, puisqu'il partirait.",
      "LA PREMIÈRE PASSE EST UNE REPRISE, PAS UNE VEILLE : elle ramasse l'arriéré. 220 sites injoignables ne sont pas tombés cette nuit, et la colonne `reprise` existe pour que l'écran le dise.",
      "NOS SOURCES SONT DES ÉTATS, PAS DES ÉVÉNEMENTS. « Son RGE expire dans 90 jours » est vrai tous les jours jusqu'à l'échéance : c'est la mémoire (veille_constats, unique par veille+entreprise) qui le convertit en événement, et l'idempotence est une INSERTION, pas une lecture préalable.",
      "ON LIT LE DÉCLENCHEUR D'ABORD, LE PÉRIMÈTRE ENSUITE : le déclencheur est le sélectif (98 RGE, 220 injoignables) quand le périmètre pèse 908 ou 60 456 fiches.",
      "⚠️ « La note d'audit qui chute » N'EST PAS MESURABLE : entreprises_audit_site a une seule ligne par entreprise (clé primaire entreprise_id), chaque analyse écrase la précédente. « Le site qui vient de tomber » non plus : les 159 transitions présent→absent de constats_presence sont toutes survenues le même jour, à zéro heure d'intervalle, entre dossier-web et verifier-sites — deux bots qui se contredisent, pas 53 sites tombés. Les deux sont déclarés dans HORS_PORTEE avec leur mesure.",
      "Pas de cron pour l'instant, et c'est délibéré : une passe est sans risque (elle n'écrit que ses constats), mais la cadence dépend de la matière — le RGE bouge au trimestre, le rapport ouvert à l'heure.",
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
  /* ────────────────────────── Lissage de la base ──────────────────────────── */
  {
    id: "lissage-file",
    nom: "Lissage — la file et ses conditions",
    phase: "enrichissement",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/lib/lissage/passe.ts · passe-db.ts · moteur.ts · outils-serveur.ts · src/app/api/lissage/ · sql/20260820_lissage.sql",
    resume:
      "Fait traverser les outils à une population choisie par filtres, jusqu'à ce que chaque sujet ait une RÉPONSE — présent, absent, ou inconnu assumé.",
    entree:
      "Des critères de l'explorateur (`chercher_entreprises`) et un plan : sujets, confiance exigée — ou une liste d'entreprises cochées dans le pipeline marketing",
    sortie: "constats_presence, et une file lisible dans Prospection → Lissage",
    ecrit: true,
    externes: [],
    cout: "Le coût des outils qu'elle appelle, et rien de plus : elle-même ne fait aucun appel externe.",
    commande: "POST /api/lissage/tick — ou le bouton « Avancer la file »",
    declencheur:
      "Le bouton de l'écran, et le cron `lissage-tick` (toutes les 15 min, GET /api/lissage/tick) posé le 03/09/2026 — sql/20260903_identite_elargie_et_cron_lissage.sql",
    regles: [
      "Elle ne relance JAMAIS un outil déjà tenté sur le même prospect dans la même passe. Sans ça, un outil qui rend « inconnu » — un CAPTCHA, une API muette — tournerait en rond en ayant l'air de travailler.",
      "Le RGE se lit dans `est_rge_indicatif`, jamais dans `rge_rafraichi_le` : 54 878 fiches portent la même estampille à la microseconde, posée sans jamais appeler l'ADEME.",
      "Un constat explicite l'emporte sur une colonne. Mesuré le 20/08 : 67 fiches ont une URL en colonne ET un constat « absent » — NXDOMAIN, ou le site de quelqu'un d'autre. Le constat avait raison à chaque fois.",
      "Elle ne se substitue pas au poste local : une étape Playwright est posée puis relâchée, et attend `scripts/lissage/runner.mjs`.",
      "DEUX PORTES ÉCRIVENT LE SIRET SANS ŒIL, et elles ne se relisent pas pareil. `identiteEvidente` : un seul SIREN + les QUATRE critères, source `resolution_auto`. `identiteProbable` (03/09/2026) : trois critères sur un seul SIREN, ou nom + adresse seuls, ou un écart de score net entre SIREN — source `resolution_elargie`, confiance `moyenne`. Elle REFUSE l'écart serré à critères égaux (le piège « KM Dépannage » : deux SIREN, même adresse, même patronyme, l'un chauffagiste l'autre taxi) et tout candidat cessé.",
      "IL FAUT CE QUI DISTINGUE, PAS CE QUI SITUE (03/09/2026). Code postal + commune + métier est satisfait par TOUS les artisans du même métier de la même ville : trois écritures fausses en une passe — le Planning familial sur « Climatisation Paris 2 », l'Agence locale de l'énergie sur « GTR LOC », SURCOF sur « Axima Equans ». Il faut désormais le NOM, ou la VOIE avec son numéro. Et la voie ne remplace le nom que pour une ENTREPRISE INDIVIDUELLE : une société porte une raison sociale, si elle ne concorde pas c'est qu'on regarde le voisin de palier.",
      "`etat_administratif` VAUT `C` SUR UNE UNITÉ LÉGALE ET `F` SUR UN ÉTABLISSEMENT. Ne refuser que `C` faisait écrire l'adresse d'un local vidé — fiche 628 « JP Climatisation », dont l'établissement fermé du 5 bis impasse Victor Hugo gagnait contre l'ouvert du numéro 8.",
      "LES PROPOSITIONS D'UNE FICHE SONT CELLES DE LA DERNIÈRE RECHERCHE. `enregistrerCandidats` purge les `propose` qu'elle ne vient pas de réécrire : sans ça elles s'empilent avec le score du barème de l'époque, et la porte automatique les rejuge. Une décision HUMAINE (`valide`/`rejete`) n'est jamais touchée.",
      "LE REGISTRE TRANCHE EN DERNIER, toujours : `validerCandidat` le réinterroge avant d'écrire. Sur les 59 fiches tranchées le 03/09 il a rendu HUIT « entreprise cessée » que la ligne candidate disait actives — elle avait été notée avant la cessation. Sans lui, huit démos seraient parties à des sociétés mortes.",
      "Deux portes d'entrée, et une seule file : des filtres (écran Lissage) ou des cases cochées (bouton « Lisser » du pipeline marketing). Une passe née d'une sélection porte `criteres.origine` et NE SE REJOUE PAS — sa population est une liste figée, pas une requête.",
      "TROISIÈME PORTE depuis le 26/08 : un LOT (`lotId`, écran Atelier). C'est la seule des trois qui soit pleinement rejouable — la composition d'un lot est écrite ligne par ligne, là où des filtres désignent une population qui a pu bouger. Aucun identifiant ne circule : la route lit `lots_entreprises` elle-même, ce qui rend le geste possible en 4G quelle que soit la taille du lot.",
      "LE COÛT DE CRÉATION ÉTAIT UN INDEX ABSENT, pas une limite de nature. `populationDesCriteres` pagine par 200 (plafond de la RPC), donc une passe de 2 000 faisait DIX appels — et chacun refaisait le balayage complet des 60 726 fiches : ~1,7 s pièce, une vingtaine de secondes en tout. `entreprises_sans_site_idx` (26/08) ramène chaque appel à ~350 ms. Si le prédicat de `chercher_entreprises` change de forme, vérifier au EXPLAIN que l'index est encore reconnu — il décroche en silence.",
    ],
  },
  {
    id: "chiffres-cles-registre",
    nom: "Chiffres clés déduits du registre",
    phase: "enrichissement",
    execution: "route-api",
    statut: "actif",
    chemin:
      "src/lib/enrichment/chiffres-cles.ts · src/app/api/marketing-pipeline/chiffres-cles/route.ts",
    resume:
      "Recale les années d'expérience, les installations et les clients sur la DATE DE CRÉATION au registre — sans un seul appel externe ni crédit d'IA.",
    entree: "entreprises_donnees_publiques.date_creation, entreprises.nombre_avis",
    sortie:
      "lead_magnet_projects.stat_years_experience / stat_installations_completed / stat_satisfied_clients",
    ecrit: true,
    externes: [],
    cout: "Nul. Aucun appel sortant : c'est une soustraction et deux multiplications.",
    commande: "POST /api/marketing-pipeline/chiffres-cles — bouton « Chiffres clés » du pipeline",
    declencheur: "La barre de sélection du pipeline marketing. Aucun cron : c'est un geste.",
    regles: [
      "Mesuré le 20/08/2026 : 564 dossiers sur 882 sans années d'expérience, dont 352 ont DÉJÀ leur date de création en base. L'enrichissement la faisait pourtant deviner par un LLM à partir du texte du site.",
      "Barème de Matteo (09/08/2026) : installations = max(années × 40, avis × 4) à la dizaine ; clients = installations × 0,75. Le terme sur les avis évite le chiffre absurde chez une entreprise jeune mais très évaluée.",
      "Il remplit les cases vides ET remonte celles qui sont sous le barème — les deux sont le même défaut vu à deux moments. 146 dossiers portaient des installations tirées des seuls avis Google (« 40 ans d\u2019expérience, 14 chantiers »), et remplir l\u2019ancienneté sans toucher au reste FABRIQUAIT la contradiction.",
      "Le sens est unique : il monte, il ne baisse jamais. Un chiffre au-dessus du barème peut être une revendication vraie du site. Vérifié sur le lot du 20/08 : 341 années remplies, 32 montées, 132 installations montées, **zéro baissée**.",
      "Il ne touche JAMAIS aux colonnes `stat_*_official` : elles portent ce que le client a confirmé, et une estimation les écraserait sans qu\u2019on le voie au rendu.",
      "⚠️ LE BARÈME SE CALCULE SUR LE REGISTRE, JAMAIS SUR L\u2019ANNÉE AFFICHÉE. 131 dossiers affichent plus d\u2019ancienneté que le registre et 7 le dépassent de vingt ans — « Ocean Clim Plomberie » annonce 100 ans pour une entreprise immatriculée en 2024. Partir de l\u2019année affichée aurait donné 4 000 chantiers : un chiffre faux rendu quarante fois plus faux. `ancienneteDouteuse` les compte et l\u2019écran les signale, sans les corriger — trancher « revendication » contre « chiffre cassé » demande un œil.",
      "Lecture par tranches de 200 identifiants. Un `in` de 877 UUID fait une URL de trente kilo-octets et PostgREST répond « Bad Request » sans dire pourquoi — trouvé en produisant une 500, pas en relisant le code.",
      "Sans date de création il ne rend RIEN. Un défaut inventé mettrait un chiffre faux sur un site vendu — ces fiches relèvent de `lissage-file`, qui va chercher le SIRET puis la date.",
      "« 0 », « - » et « — » comptent comme vides : c'est la définition de `filledStat`, celle du rendu. En diverger laisserait des lignes rouges que le barème pouvait combler.",
    ],
  },
  {
    id: "lissage-runner",
    nom: "Lissage — l'exécuteur local",
    phase: "enrichissement",
    execution: "script-local",
    statut: "actif",
    chemin: "scripts/lissage/runner.mjs",
    resume:
      "Réclame les étapes de la file qui exigent cette machine, lance le script, et rend des constats.",
    entree: "GET /api/lissage/local — les lignes en attente, avec les faits nécessaires",
    sortie: "POST /api/lissage/local — des constats, et les candidats dans le dossier de la ligne",
    ecrit: true,
    externes: [],
    cout: "Celui des scripts appelés (`dossier-web` est facturé par l'API Places).",
    commande: "node scripts/lissage/runner.mjs --taille 20 --boucle",
    regles: [
      "Il n'écrit JAMAIS une URL de site : le dossier web propose, un humain écrit. Les candidats vont dans le dossier de la ligne.",
      "Il ne réclame pas les étapes `humain` — elles attendent un écran, pas un script.",
      "Le verdict d'absence de site vient de `scripts/prospection/verdict-site.mjs`, la MÊME fonction qu'`appliquer-dossiers`. Deux définitions de « sans site » divergeraient.",
      "`npm run dev` doit tourner : il parle à la route locale, pas directement à la base.",
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
