// passe.ts — lisser la base : la file, ses conditions, et le tri-état. Pur.
//
// CE QUE C'EST
// Une PASSE prend une population choisie par filtres, la fait traverser des
// outils, et cherche à ce que chaque prospect ressorte avec une RÉPONSE sur
// chaque sujet — pas forcément une donnée, mais une réponse.
//
// ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ─────────────────────────────────
//
// **« On ne sait pas » et « il n'en a pas » ne sont pas la même chose, et
// « l'outil a échoué » n'est ni l'un ni l'autre.**
//
// Trois états, donc, et jamais deux :
//
//   present  — on a trouvé, et on porte la valeur.
//   absent   — ON A CHERCHÉ ET IL N'Y EN A PAS. C'est un résultat, pas un vide.
//   inconnu  — personne n'a regardé, ou l'outil n'a pas pu conclure.
//
// Ce n'est pas une précaution théorique. Relevé le 20/08/2026 :
// **54 878 fiches portent `rge_rafraichi_le = 2026-08-16 02:17:00.123097+00`**
// — la même estampille à la microseconde près, posée par un remplissage de
// masse qui n'a jamais appelé l'ADEME. La base PRÉTEND avoir vérifié 57 801
// fiches ; elle en a vérifié 2 923 (celles dont l'estampille est étalée). Un
// champ vide aurait été honnête ; une estampille fausse est pire, parce qu'elle
// empêche de repasser.
//
// D'où le corollaire, qui est la seule chose à retenir en écrivant un outil :
// **un outil qui n'a pas pu conclure n'écrit rien de définitif.** Le CAPTCHA de
// Google, une API en panne, un débit dépassé — tout ça produit `inconnu` avec
// son motif, jamais `absent`.
//
// ── CE MODULE NE VA RIEN CHERCHER ─────────────────────────────────────────
// Même découpage que `regulator.ts` / `regulator-db.ts` et
// `conditions.ts` / `conditions-db.ts`. Ici on décide QUOI lancer et QUAND
// s'arrêter ; l'exécution vit ailleurs, et le lancement des outils locaux vit
// même sur une autre machine.

/* ── Les sujets : ce sur quoi on veut une réponse ─────────────────────────── */

/**
 * Les sujets d'une passe.
 *
 * Ils reprennent le vocabulaire de `constats_presence`, qui portait DÉJÀ cinq
 * sujets (`site_web`, `fiche_google`, `avis`, `telephone`, `email`) alors que
 * ses 3 041 lignes ne parlent que du site. La table n'était pas à créer : elle
 * était à utiliser. `identite` et `rge` s'y ajoutent.
 */
export const SUJETS = ['identite', 'fiche_google', 'site_web', 'rge'] as const
export type Sujet = (typeof SUJETS)[number]

export const SUJET_LABEL: Readonly<Record<Sujet, string>> = {
  identite: 'Identité légale (SIRET, dirigeants, effectif, CA)',
  fiche_google: 'Fiche Google',
  site_web: 'Site web',
  rge: 'Qualification RGE',
}

/** Ce qu'on répond, et il y a bien TROIS réponses. */
export const ETATS = ['present', 'absent', 'inconnu'] as const
export type Etat = (typeof ETATS)[number]

/**
 * À quel point on y croit — vocabulaire repris tel quel de `constats_presence`.
 *
 * La confiance ne remplace JAMAIS l'état : un `absent` en confiance `faible`
 * reste un « il n'en a pas », dit avec prudence. C'est `inconnu` qui veut dire
 * « on ne sait pas », et lui seul.
 */
export const CONFIANCES = ['certaine', 'haute', 'moyenne', 'faible'] as const
export type Confiance = (typeof CONFIANCES)[number]

const RANG_CONFIANCE: Readonly<Record<Confiance, number>> = {
  faible: 1,
  moyenne: 2,
  haute: 3,
  certaine: 4,
}

/** Un constat, tel qu'il se range dans `constats_presence`. */
export interface Constat {
  sujet: Sujet
  etat: Etat
  confiance: Confiance
  /** Renseignée SEULEMENT quand `etat === 'present'` — la base l'impose. */
  valeur?: string | null
  /** Qui l'a constaté : `<id de bot>/<détail>`, comme les 3 041 lignes existantes. */
  source: string
  /** De quoi refaire le raisonnement plus tard. */
  preuve?: unknown
}

/* ── Les outils : ce qui peut trancher un sujet ───────────────────────────── */

/**
 * Où un outil peut tourner.
 *
 * `serveur` — route API, edge function ou cron. Lançable depuis l'app, tout de
 *   suite, sans que personne ne soit devant.
 * `local` — script Node sur la machine du propriétaire. Playwright, profil
 *   Chrome persistant, CAPTCHA à contourner à l'œil : rien de tout ça ne tient
 *   dans une fonction serverless, et ce n'est pas une limite à repousser.
 *   Ces étapes attendent dans la file jusqu'à ce qu'un exécuteur local les
 *   réclame — c'est-à-dire jusqu'à ce que Matteo ouvre son localhost.
 * `humain` — un jugement. Le registre des bots le dit déjà pour le site :
 *   « chercher et écrire sont deux scripts séparés », et l'écriture EXIGE des
 *   ids relus. On ne contourne pas ça : c'est ce qui rend la base fiable.
 */
export type Lieu = 'serveur' | 'local' | 'humain'

/**
 * Ce qu'un outil exige pour qu'il vaille la peine de l'appeler.
 *
 * `candidat_site` et `candidat_identite` ne sont pas des champs du prospect :
 * c'est le fait qu'un outil AMONT ait proposé quelque chose. Une relecture
 * humaine n'exige aucune colonne — elle exige qu'il y ait quelque chose à
 * relire. Sans ce préalable, elle était proposée d'emblée sur un prospect dont
 * personne n'avait encore rien cherché, et la file envoyait un écran vide.
 *
 * LES DEUX FAMILLES NE SE CONFONDENT PAS, et les fondre était un vrai bug : un
 * prospect à qui l'annuaire a proposé trois SIRET n'a rien à faire relire sur
 * son SITE. Un compteur unique l'y envoyait quand même.
 *
 * `siret_manquant` est le seul préalable NÉGATIF, et il fallait qu'il existe.
 * Sans lui, `recherche-entreprises` — qui cherche une identité par le nom —
 * était proposé sur les 57 801 fiches qui ONT déjà un SIRET, simplement parce
 * qu'elles ont aussi un nom et une ville. Un appel par fiche, pour reproposer
 * ce qui est déjà écrit : la file avait l'air de travailler.
 */
export type Prealable =
  | 'siret'
  | 'siret_manquant'
  | 'place_id'
  | 'nom_et_ville'
  | 'url'
  | 'candidat_site'
  | 'candidat_identite'

export interface Outil {
  /** L'identifiant DU REGISTRE (`src/lib/architecture/bots.ts`). Pas un nouveau nom. */
  id: string
  nom: string
  /**
   * Les sujets qu'il tranche — AU PLURIEL, parce qu'un outil ne répond pas
   * forcément à une seule question. Le dossier web interroge l'API Places ET
   * cherche le site : lui faire porter un seul sujet obligeait à choisir lequel
   * de ses deux verdicts on jette.
   */
  sujets: readonly Sujet[]
  lieu: Lieu
  /** Sans ces éléments, l'appel est perdu — on saute l'étape plutôt que de la brûler. */
  exige: Prealable[]
  /** Écrit-il en base ? La question la plus importante du registre. */
  ecrit: boolean
  /** `true` = chaque appel coûte de l'argent. Décide de l'ordre autant que la logique. */
  facture: boolean
  /** Ce qu'il apporte, en une phrase, pour l'écran. */
  resume: string
}

/**
 * Le catalogue, dérivé du registre des bots.
 *
 * ON N'INVENTE AUCUN OUTIL ICI. Chaque entrée pointe un bot qui existe déjà,
 * avec son `id` du registre — la règle du projet est qu'on ne crée pas un bot
 * sans lire son entrée, et la réciproque vaut : on ne fabrique pas ici un outil
 * qui n'aurait pas d'entrée là-bas.
 */
export const OUTILS: readonly Outil[] = [
  {
    // AVANT `choix-siret` : ce qui peut se trancher sans humain ne doit jamais
    // arriver dans un écran de décision. Mesuré le 20/08 : sur 210 fiches en
    // attente, 72 ont un SEUL SIREN candidat dont un établissement concorde sur
    // les quatre critères du registre. Les y laisser use l'attention qu'il faut
    // garder pour les 138 autres.
    id: 'identite-evidente',
    nom: 'Identité évidente',
    sujets: ['identite'],
    lieu: 'serveur',
    exige: ['siret_manquant', 'candidat_identite'],
    ecrit: true,
    facture: false,
    resume:
      'Écrit le SIRET quand un seul SIREN est candidat et que les quatre critères du registre concordent. Sinon il passe la main, sans rien écrire.',
  },
  {
    // AVANT `resolution-siret`, ET CE N'EST PAS UN DÉTAIL : des candidats
    // proposés le 08/08 attendent encore une décision, faute d'écran. Chercher
    // avant de trancher, c'est repayer une recherche pour reproposer ce qui
    // attend déjà qu'on tranche.
    id: 'choix-siret',
    nom: 'Choix du SIRET',
    sujets: ['identite'],
    lieu: 'humain',
    exige: ['siret_manquant', 'candidat_identite'],
    ecrit: true,
    facture: false,
    resume:
      'La seule porte qui écrit `entreprises.siret`. Elle montre adresse, code postal, nom et métier de chaque candidat, et le registre est réinterrogé avant l’écriture.',
  },
  {
    // `resolution-siret` ET NON `recherche-entreprises` : ce dernier est le
    // client d'API, et son en-tête est formel — « il n'écrit rien ». Ce qui
    // écrit les propositions, c'est la résolution, qui les note et les range.
    // Même séparation que `dossier-web` / `appliquer-dossiers` : chercher et
    // écrire sont deux bots, et c'est elle qui rend une collecte relançable.
    id: 'resolution-siret',
    nom: 'Résolution du SIRET',
    sujets: ['identite'],
    lieu: 'serveur',
    // `siret_manquant` d'abord : une fiche qui a son SIRET n'a rien à chercher,
    // elle a à être hydratée — et c'est `donnees-publiques` qui le fait.
    exige: ['siret_manquant', 'nom_et_ville'],
    ecrit: true,
    facture: false,
    resume:
      'Propose des candidats d’identité légale, notés et rangés dans `entreprise_siret_candidats`. Il ne choisit jamais.',
  },
  {
    id: 'donnees-publiques',
    nom: 'Hydratation des données publiques',
    sujets: ['identite'],
    lieu: 'serveur',
    exige: ['siret'],
    ecrit: true,
    facture: false,
    resume: 'Remplit SIRET, dirigeants, effectif, CA et catégorie depuis l’annuaire officiel.',
  },
  {
    id: 'ademe-rge',
    nom: 'ADEME — qualifications RGE',
    sujets: ['rge'],
    lieu: 'serveur',
    exige: ['siret'],
    ecrit: false,
    facture: false,
    resume: 'Le registre officiel. Il prime sur ce que le site de l’entreprise affiche.',
  },
  {
    id: 'refresh-google-stats',
    nom: 'Fiche Google — note et avis',
    sujets: ['fiche_google'],
    lieu: 'serveur',
    exige: ['place_id'],
    ecrit: true,
    facture: true,
    resume:
      'Confirme qu’une fiche connue vit toujours, et rafraîchit note et avis. Ni scraping ni LLM.',
  },
  {
    id: 'dossier-web',
    nom: 'Dossier web',
    sujets: ['fiche_google', 'site_web'],
    lieu: 'local',
    exige: ['nom_et_ville'],
    ecrit: false,
    facture: true,
    resume:
      'Interroge l’API Places ET cherche le site : il tranche donc la fiche Google, et propose des candidats pour le site.',
  },
  {
    id: 'verifier-sites',
    nom: 'Vérificateur de sites',
    sujets: ['site_web'],
    lieu: 'local',
    exige: ['url'],
    ecrit: true,
    facture: false,
    resume:
      'Va lire la page : un site à soi parle de soi, un annuaire non. La visite fait foi, pas l’URL détenue.',
  },
  {
    id: 'appliquer-dossiers',
    nom: 'Relecture et écriture',
    sujets: ['site_web'],
    lieu: 'humain',
    exige: ['candidat_site'],
    ecrit: true,
    facture: false,
    resume: 'La seule moitié de la chaîne qui écrit. Le volet site exige des ids relus.',
  },
]

export const outilParId = (id: string): Outil | undefined => OUTILS.find((o) => o.id === id)

/* ── Ce qu'on sait d'un prospect au moment de décider ─────────────────────── */

export interface FaitsDuProspect {
  entrepriseId: number
  nom: string | null
  ville: string | null
  /**
   * Le code postal pèse 25 points sur 100 dans le rapprochement au registre, et
   * il sert d'abord de FILTRE de recherche : sans lui, « Toiture Martin »
   * ramène des homonymes nationaux qui noient le bon résultat. 1 479 des 2 648
   * fiches sans SIRET en portent un.
   */
  codePostal: string | null
  /**
   * La voie. AJOUTÉE LE 03/09/2026 parce qu'elle cherche mieux que le nom :
   * l'enseigne d'un panneau (« AR CLIM ») n'est presque jamais la raison
   * sociale (« ADRIEN RODRIGUEZ »), alors que l'atelier est bien à l'adresse
   * où Google l'a photographié. Voir le chemin 4 de `chercherCandidats`.
   */
  adresse: string | null
  /**
   * Le texte des avis Google, quand la fiche en porte. Sert au rapprochement
   * d'identité : c'est là qu'un client nomme l'artisan que le registre
   * n'immatricule que sous son état civil.
   */
  avis: string[] | null
  siret: string | null
  placeId: string | null
  url: string | null
  /**
   * Des candidats de SITE, montés par le dossier web sans rien décider — c'est
   * exactement ce que la relecture attend, et rien d'autre ne le remplace.
   */
  candidats?: number
  /**
   * Des candidats d'IDENTITÉ en attente de décision, lus dans
   * `entreprise_siret_candidats`. Table qui existait déjà, avec son score et sa
   * validation : la file n'en fabrique pas une seconde.
   */
  candidatsIdentite?: number
  /** Le dernier constat retenu par sujet. Absent = personne n'a jamais regardé. */
  constats: Partial<Record<Sujet, { etat: Etat; confiance: Confiance }>>
}

/** Le préalable est-il satisfait ? */
export function prealableTenu(faits: FaitsDuProspect, p: Prealable): boolean {
  const rempli = (v: string | null | undefined) => Boolean(v && v.trim())
  if (p === 'siret') return rempli(faits.siret)
  if (p === 'place_id') return rempli(faits.placeId)
  if (p === 'siret_manquant') return !rempli(faits.siret)
  if (p === 'url') return rempli(faits.url)
  if (p === 'candidat_site') return (faits.candidats ?? 0) > 0
  if (p === 'candidat_identite') return (faits.candidatsIdentite ?? 0) > 0
  // Le nom seul ne suffit pas : « Toiture Martin » sans commune ramène la France
  // entière, et le registre le dit — l'adresse prime sur le nom pour rapprocher.
  return rempli(faits.nom) && rempli(faits.ville)
}

/* ── Le plan de la passe ──────────────────────────────────────────────────── */

export interface PlanPasse {
  /** Les sujets qu'on veut trancher, dans l'ordre où on les attaque. */
  sujets: readonly Sujet[]
  /**
   * La confiance minimale pour considérer un sujet réglé.
   *
   * Défaut `moyenne` : au-dessous, on repasse. Monter à `certaine` fait
   * repasser tout ce qui a été deviné — c'est le réglage d'une passe de
   * consolidation, pas d'une première passe.
   */
  exigence: Confiance
  /** Autorise-t-on les outils qui coûtent de l'argent ? */
  facture: boolean
  /** Autorise-t-on les étapes qui attendent une machine locale ? */
  local: boolean
}

export const PLAN_DEFAUT: PlanPasse = {
  // L'ORDRE N'EST PAS ARBITRAIRE, et il vient de ce qui a déjà été appris :
  //   1. l'identité donne le SIRET, dont le RGE a besoin ;
  //   2. le RGE est gratuit et instantané une fois le SIRET connu ;
  //   3. la fiche Google DÉCLARE souvent le site — la consulter avant de
  //      chercher évite une recherche entière ;
  //   4. le site en dernier, parce que c'est le seul sujet qui finit par un
  //      jugement humain, et qu'on ne fait pas relire ce qu'on aurait pu
  //      trancher tout seul.
  sujets: ['identite', 'rge', 'fiche_google', 'site_web'],
  exigence: 'moyenne',
  facture: true,
  local: true,
}

/* ── Nommer une passe qu'on n'a pas nommée ────────────────────────────────── */

/**
 * Le fuseau dans lequel un nom de passe se lit.
 *
 * Sur Vercel le serveur tourne en UTC : sans fuseau explicite, une passe lancée
 * à 14 h 32 depuis Annecy s'appellerait « 12 h 32 ». Ce n'est pas un détail de
 * confort — le nom est la SEULE chose qui distingue deux passes lancées le même
 * après-midi, et un horaire faux les rend impossibles à retrouver.
 */
const FUSEAU = 'Europe/Paris'

/**
 * Le nom d'une passe née d'une sélection à l'écran, plutôt que de filtres.
 *
 * Une passe créée depuis les cases cochées du pipeline marketing n'a pas de
 * critères à afficher — sa population est une liste d'identifiants, pas une
 * requête. Il lui faut donc un nom qui dise les trois choses qu'on cherchera
 * plus tard : **d'où elle vient, combien elle porte, et quand on l'a lancée**.
 *
 * Volontairement sans compteur ni suffixe d'unicité : `lissage_passes.nom` n'est
 * pas unique en base, et deux passes de la même minute se départagent déjà par
 * leur effectif et leur date de création dans la liste.
 */
export function nomDeSelection(
  effectif: number,
  quand: Date,
  depuis = 'Sélection',
): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(quand)
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? '??'
  return `${depuis} — ${effectif} fiche${effectif > 1 ? 's' : ''}, ${p('day')}/${p('month')} à ${p('hour')} h ${p('minute')}`
}

/* ── Ce qu'un sujet coûte, et où il tourne ────────────────────────────────── */

/**
 * La nature d'un sujet, COMPTE TENU DU PLAN.
 *
 * C'est l'écran de création qui en a besoin : « ce qu'on veut trancher » liste
 * des SUJETS, alors que ce qui coûte de l'argent ou réclame le poste local, ce
 * sont les OUTILS. Un sujet n'a donc pas une nature propre — il a celle des
 * outils qui restent praticables une fois les deux interrupteurs réglés.
 *
 * ET LES DEUX NE S'EXCLUENT PAS : un même sujet peut avoir un chemin serveur
 * gratuit ET un chemin local facturé. Ce sont des routes alternatives, pas un
 * choix. `fiche_google` est l'exemple : `refresh-google-stats` (serveur,
 * facturé) ou `dossier-web` (local, facturé).
 *
 * `impraticable` est le cas qu'il FAUT montrer avant de lancer : en décochant
 * les outils facturés, `fiche_google` perd ses deux seuls outils. La passe
 * partirait quand même et s'arrêterait en `sans_prise` sur toute la population
 * — du travail pour rien, découvert après coup.
 */
export interface NatureSujet {
  sujet: Sujet
  /** Un des outils praticables coûte de l'argent à l'appel. */
  facture: boolean
  /** Un des outils praticables attend que le poste local soit ouvert. */
  local: boolean
  /** Un des outils praticables attend une relecture humaine. */
  humain: boolean
  /** Un des outils praticables tourne côté serveur, sans rien coûter. */
  gratuitEnLigne: boolean
  /** AUCUN outil ne peut prendre ce sujet avec ce plan. */
  impraticable: boolean
}

export function natureDuSujet(sujet: Sujet, plan: PlanPasse = PLAN_DEFAUT): NatureSujet {
  const retenus = OUTILS.filter(
    (o) =>
      o.sujets.includes(sujet) &&
      (!o.facture || plan.facture) &&
      (o.lieu !== 'local' || plan.local),
  )
  return {
    sujet,
    facture: retenus.some((o) => o.facture),
    local: retenus.some((o) => o.lieu === 'local'),
    humain: retenus.some((o) => o.lieu === 'humain'),
    gratuitEnLigne: retenus.some((o) => o.lieu === 'serveur' && !o.facture),
    impraticable: retenus.length === 0,
  }
}

/**
 * Ce sujet est-il réglé pour ce prospect ?
 *
 * `inconnu` n'est JAMAIS réglé, quelle que soit sa confiance — c'est toute la
 * raison d'être du troisième état. Un `inconnu` en confiance `certaine`
 * voudrait dire « je suis sûr de ne pas savoir », ce qui est une information,
 * mais pas une réponse.
 */
export function sujetRegle(faits: FaitsDuProspect, sujet: Sujet, exigence: Confiance): boolean {
  const c = faits.constats[sujet]
  if (!c || c.etat === 'inconnu') return false
  return RANG_CONFIANCE[c.confiance] >= RANG_CONFIANCE[exigence]
}

/** Les sujets qu'il reste à trancher, dans l'ordre du plan. */
export function resteATrancher(faits: FaitsDuProspect, plan: PlanPasse = PLAN_DEFAUT): Sujet[] {
  return plan.sujets.filter((s) => !sujetRegle(faits, s, plan.exigence))
}

export interface EtapeProposee {
  outil: Outil
  sujet: Sujet
}

/** Pourquoi un prospect n'a plus d'étape possible — jamais un silence. */
export type MotifArret =
  /** Tous les sujets du plan sont réglés. C'est la sortie qu'on vise. */
  | 'complet'
  /** Il reste des sujets, mais aucun outil ne peut les prendre en l'état. */
  | 'sans_prise'

export interface Arret {
  motif: MotifArret
  /** Ce qui n'a pas pu être tranché, pour que l'écran le dise. */
  restants: Sujet[]
  /** Ce qui manquerait pour reprendre — vide quand c'est complet. */
  manques: Prealable[]
}

/**
 * L'étape suivante pour ce prospect, ou la raison qu'il n'y en ait plus.
 *
 * ON NE RELANCE PAS UN OUTIL SUR UN SUJET DÉJÀ RÉGLÉ, et c'est ce qui rend une
 * passe relançable sans conséquence : la repasser sur les mêmes mille fiches ne
 * refait que ce qui manquait. Sur des outils facturés à l'appel, la différence
 * n'est pas théorique.
 *
 * `dejaTentes` porte les outils déjà lancés SUR CE PROSPECT dans cette passe.
 * Sans ça, un outil qui rend `inconnu` — un CAPTCHA, une API muette — serait
 * relancé indéfiniment sur la même fiche, et la file tournerait en rond en
 * ayant l'air de travailler.
 */
export function prochaineEtape(
  faits: FaitsDuProspect,
  plan: PlanPasse = PLAN_DEFAUT,
  dejaTentes: readonly string[] = [],
): EtapeProposee | Arret {
  const restants = resteATrancher(faits, plan)
  if (restants.length === 0) return { motif: 'complet', restants: [], manques: [] }

  const manques = new Set<Prealable>()
  for (const sujet of restants) {
    for (const outil of OUTILS) {
      if (!outil.sujets.includes(sujet)) continue
      if (dejaTentes.includes(outil.id)) continue
      if (outil.facture && !plan.facture) continue
      if (outil.lieu === 'local' && !plan.local) continue
      const absents = outil.exige.filter((p) => !prealableTenu(faits, p))
      if (absents.length === 0) return { outil, sujet }
      for (const a of absents) manques.add(a)
    }
  }
  // Il reste du travail, mais rien ne peut le prendre. On le DIT — un prospect
  // qui sort d'une passe sans être complet et sans motif est exactement le
  // genre de ligne qui dort trois semaines sans que personne le voie.
  return { motif: 'sans_prise', restants, manques: [...manques] }
}

export const estArret = (e: EtapeProposee | Arret): e is Arret => 'motif' in e

/* ── Ce qu'une passe donne à lire ─────────────────────────────────────────── */

export interface Couverture {
  sujet: Sujet
  label: string
  present: number
  absent: number
  inconnu: number
  /** Ni constat, ni tentative : personne n'a jamais regardé. */
  jamais_regarde: number
}

/**
 * La couverture d'une population, sujet par sujet.
 *
 * QUATRE COLONNES ET NON TROIS. `inconnu` (on a regardé sans conclure) et
 * `jamais_regarde` (personne n'a regardé) sont deux travaux différents : le
 * premier demande un autre outil, le second demande juste de lancer une passe.
 * Les fondre donnerait un chiffre sur lequel on ne saurait pas quoi faire.
 *
 * La somme des quatre colonnes égale le nombre de prospects, par construction —
 * même règle que l'entonnoir de la prospection.
 */
export function couverture(
  prospects: readonly FaitsDuProspect[],
  sujets: readonly Sujet[] = SUJETS,
): Couverture[] {
  return sujets.map((sujet) => {
    const c: Couverture = {
      sujet,
      label: SUJET_LABEL[sujet],
      present: 0,
      absent: 0,
      inconnu: 0,
      jamais_regarde: 0,
    }
    for (const p of prospects) {
      const constat = p.constats[sujet]
      if (!constat) c.jamais_regarde += 1
      else if (constat.etat === 'present') c.present += 1
      else if (constat.etat === 'absent') c.absent += 1
      else c.inconnu += 1
    }
    return c
  })
}
