// vue-taches.ts — le tableau des tâches : filtrer, trier, compter. Pur.
//
// POURQUOI CE MODULE EXISTE
// Le grief de Matteo est nommé — « page Démarchage trop chargée, trop rigide ;
// la barre de gauche filtre mal » — et il est MESURABLE. Au 19/08/2026 la file
// porte 659 tâches en attente, dont 640 appels, toutes échues, sur 636
// entreprises. Aucun rail vertical ne se lit à cette taille : il faut un
// tableau, des filtres qui se cumulent, et le droit d'enregistrer son tri.
//
// LA SÉMANTIQUE DES PASTILLES, ÉCRITE UNE FOIS POUR TOUTES
// C'est le seul endroit du fichier qui mérite d'être appris par cœur, parce que
// tout filtre qui la contredit rend des lignes que personne ne sait expliquer :
//
//   · DANS une pastille, les valeurs s'additionnent — TOUJOURS un OU.
//     « Canal : Appel, WhatsApp » veut dire appel OU whatsapp. Personne n'a
//     jamais voulu dire « une tâche qui est à la fois un appel et un
//     WhatsApp » : c'est l'ensemble vide, et un filtre qui rend zéro ligne
//     passe pour cassé.
//   · ENTRE les pastilles, c'est le MODE qui tranche — ET par défaut
//     (l'intersection, ce que tout le monde attend), OU sur demande.
//
// UN SEUL INTERRUPTEUR, PAS UN ARBRE. lemlist s'arrête là et c'est le bon
// arrêt : dès qu'on offre des parenthèses, l'écran devient un éditeur de
// requêtes, et un éditeur de requêtes ne se lit pas d'un coup d'œil le matin.
//
// ON FILTRE EN MÉMOIRE, ET C'EST ASSUMÉ. La file entière tient en 933 lignes ;
// la charger d'un coup coûte moins qu'un aller-retour PostgREST par pastille,
// et surtout ça garde TOUTE la logique ici — testable, sans base, sans réseau.
// Le jour où la file dépassera quelques milliers de lignes, c'est la lecture
// qui se paginera : la sémantique ci-dessus, elle, ne bougera pas.
//
// ON STOCKE LES CRITÈRES, JAMAIS LES RÉSULTATS — même invariante que les
// segments (`sql/20260817_segments_entreprises.sql`). Une vue est une QUESTION :
// la tâche qui devient échue ce matin y entre toute seule.

/* ── La ligne ────────────────────────────────────────────────────────────── */

/**
 * Une ligne du tableau, telle que l'API la rend.
 *
 * Tout est APLATI — pas d'objets imbriqués. Un filtre doit pouvoir désigner son
 * champ par un nom, et un tri comparer deux valeurs sans savoir d'où elles
 * viennent : c'est ce qui permet d'ajouter une colonne sans toucher au moteur.
 */
export interface LigneTache {
  id: string
  /** call · whatsapp · linkedin · email */
  canal: string
  /** pending · done · snoozed · skipped */
  statut: string
  titre: string
  echeance: string | null
  faiteLe: string | null
  entrepriseId: number | null
  entreprise: string
  ville: string | null
  /** `entreprises.cohorte_demarchage` — A_site_faible, B_sans_site, ou rien. */
  cohorte: string | null
  agentId: string | null
  agent: string | null
  campagneId: string | null
  campagne: string | null
  etapeId: string | null
  inscriptionId: string | null
  /** `prospection_tasks.routing_reason` — pourquoi cette tâche est tombée ici. */
  motif: string | null
  /** `entreprises.premiere_touche_le` — null = personne ne l'a jamais abordée. */
  premiereTouche: string | null
  /** L'inscription de ce prospect porte au moins une réponse : la discussion est ouverte. */
  aRepondu: boolean
}

/* ── Les champs filtrables ───────────────────────────────────────────────── */

export const CHAMPS = [
  'canal',
  'statut',
  'echeance',
  'agent',
  'campagne',
  'cohorte',
  'entreprise',
  'ville',
  'motif',
  'contact',
  'reponse',
] as const
export type Champ = (typeof CHAMPS)[number]

export const CHAMP_LABEL: Record<Champ, string> = {
  canal: 'Canal',
  statut: 'Statut',
  echeance: 'Échéance',
  agent: 'Agent',
  campagne: 'Campagne',
  cohorte: 'Cohorte',
  entreprise: 'Entreprise',
  ville: 'Ville',
  motif: 'Motif',
  contact: 'Premier contact',
  reponse: 'Réponse',
}

/**
 * Les opérateurs. Quatre, et chacun ne veut dire qu'une chose.
 *
 * `vide` / `non_vide` ne prennent pas de valeur : ce sont les deux seules
 * questions qu'on pose à une colonne sans avoir à savoir ce qu'elle contient —
 * « lesquelles n'ont pas de campagne », « lesquelles portent un motif ».
 */
export const OPERATEURS = ['est', 'nest_pas', 'contient', 'vide', 'non_vide'] as const
export type Operateur = (typeof OPERATEURS)[number]

export interface Filtre {
  champ: Champ
  operateur: Operateur
  /** Toujours un OU entre elles. Vide pour `vide` / `non_vide`. */
  valeurs: string[]
}

export const COLONNES = [
  'canal',
  'entreprise',
  'titre',
  'echeance',
  'campagne',
  'agent',
  'cohorte',
  'ville',
  'statut',
  'motif',
  'reponse',
] as const
export type Colonne = (typeof COLONNES)[number]

export const COLONNE_LABEL: Record<Colonne, string> = {
  canal: 'Canal',
  entreprise: 'Entreprise',
  titre: 'Tâche',
  echeance: 'Échéance',
  campagne: 'Campagne',
  agent: 'Agent',
  cohorte: 'Cohorte',
  ville: 'Ville',
  statut: 'Statut',
  motif: 'Motif',
  reponse: 'Réponse',
}

/**
 * Les colonnes montrées quand personne n'a rien réglé.
 *
 * Ce sont exactement celles de la maquette — canal, entreprise, tâche,
 * échéance, campagne, statut. On n'ouvre pas un écran sur onze colonnes : le
 * réglage sert à en AJOUTER, pas à réparer un défaut illisible.
 */
export const COLONNES_PAR_DEFAUT: readonly Colonne[] = [
  'canal',
  'entreprise',
  'titre',
  'echeance',
  'campagne',
  'statut',
]

export interface Tri {
  colonne: Colonne
  sens: 'asc' | 'desc'
}

export interface CriteresVue {
  mode: 'et' | 'ou'
  filtres: Filtre[]
  colonnes?: Colonne[]
  tri?: Tri
}

/**
 * Le tri de départ : l'échéance la plus ancienne en tête.
 *
 * Sur une file dont TOUTES les lignes en attente sont échues, c'est la seule
 * lecture honnête — la plus vieille est la plus abîmée, pas la plus récente.
 */
export const TRI_PAR_DEFAUT: Tri = { colonne: 'echeance', sens: 'asc' }

export const CRITERES_VIDES: CriteresVue = { mode: 'et', filtres: [] }

/* ── Les valeurs de l'échéance ───────────────────────────────────────────── */

/**
 * L'échéance ne se filtre pas par date mais par SEAU.
 *
 * Personne ne tape « avant le 2026-08-14 » un mardi matin : on demande « ce qui
 * est en retard », « ce qui tombe aujourd'hui ». Les bornes se recalculent à
 * chaque lecture, ce qui est précisément ce qui rend une vue vivante — une vue
 * enregistrée sur une DATE serait périmée le lendemain.
 */
export const SEAUX_ECHEANCE = ['echue', 'aujourdhui', 'demain', 'semaine', 'plus_tard', 'sans'] as const
export type SeauEcheance = (typeof SEAUX_ECHEANCE)[number]

export const SEAU_LABEL: Record<SeauEcheance, string> = {
  echue: 'Échue',
  aujourdhui: "Aujourd'hui",
  demain: 'Demain',
  semaine: 'Cette semaine',
  plus_tard: 'Plus tard',
  sans: 'Sans échéance',
}

const JOUR_MS = 86_400_000

/** Le début du jour civil, dans le fuseau donné. */
function debutDuJour(quand: Date, fuseau: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(quand)
      .map((x) => [x.type, x.value]),
  )
  const heure = p.hour === '24' ? '00' : p.hour
  const ecoule =
    (Number(heure) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000
  return quand.getTime() - ecoule
}

/**
 * Dans quel seau tombe cette échéance ?
 *
 * `semaine` va de après-demain à J+7 inclus : c'est le même horizon que le
 * calendrier de la file (`HORIZON_JOURS`), pour que les deux écrans ne disent
 * pas deux choses du même jeudi.
 */
export function seauDeLEcheance(
  echeance: string | null,
  maintenant: Date = new Date(),
  fuseau = 'Europe/Paris',
): SeauEcheance {
  if (!echeance) return 'sans'
  const ms = new Date(echeance).getTime()
  if (!Number.isFinite(ms)) return 'sans'

  const debut = debutDuJour(maintenant, fuseau)
  if (ms < debut) return 'echue'
  if (ms < debut + JOUR_MS) return 'aujourdhui'
  if (ms < debut + 2 * JOUR_MS) return 'demain'
  if (ms < debut + 8 * JOUR_MS) return 'semaine'
  return 'plus_tard'
}

/* ── La lecture d'un champ ───────────────────────────────────────────────── */

/** Sans accent et sans casse — pour que « Écully » se trouve en tapant « ecully ». */
export function aplatir(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export interface ContexteLecture {
  maintenant?: Date
  fuseau?: string
}

/**
 * La valeur d'un champ sur une ligne, ramenée à du texte comparable.
 *
 * `null` veut dire ABSENT, et c'est ce que `vide` interroge. Une chaîne vide
 * compte comme absente : `routing_reason` et `ville` arrivent tantôt à `null`,
 * tantôt à `''`, selon le chemin qui les a écrites — les distinguer à l'écran
 * n'aurait aucun sens pour qui filtre.
 */
export function valeurDuChamp(
  ligne: LigneTache,
  champ: Champ,
  ctx: ContexteLecture = {},
): string | null {
  const net = (v: string | null | undefined) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  switch (champ) {
    case 'canal':
      return net(ligne.canal)
    case 'statut':
      return net(ligne.statut)
    case 'echeance':
      return seauDeLEcheance(ligne.echeance, ctx.maintenant ?? new Date(), ctx.fuseau ?? 'Europe/Paris')
    case 'agent':
      return ligne.agentId ?? null
    case 'campagne':
      return ligne.campagneId ?? null
    case 'cohorte':
      return net(ligne.cohorte)
    case 'entreprise':
      return net(ligne.entreprise)
    case 'ville':
      return net(ligne.ville)
    case 'motif':
      return net(ligne.motif)
    // Un PREMIER CONTACT est une entreprise que personne n'a jamais abordée.
    // La frontière est en base (`premiere_touche_le`), jamais devinée — c'est
    // la même que celle des deux files du poste de travail.
    case 'contact':
      return ligne.premiereTouche ? 'suivi' : 'premier'
    case 'reponse':
      return ligne.aRepondu ? 'oui' : 'non'
  }
}

/* ── Le filtre ───────────────────────────────────────────────────────────── */

/**
 * Cette ligne satisfait-elle CE filtre ?
 *
 * Un filtre `est` ou `contient` SANS valeur ne filtre rien et rend `true` : une
 * pastille qu'on vient d'ajouter et qu'on n'a pas encore remplie ne doit pas
 * vider le tableau sous les doigts de celui qui la remplit.
 */
export function ligneSatisfait(
  ligne: LigneTache,
  filtre: Filtre,
  ctx: ContexteLecture = {},
): boolean {
  const valeur = valeurDuChamp(ligne, filtre.champ, ctx)

  if (filtre.operateur === 'vide') return valeur === null
  if (filtre.operateur === 'non_vide') return valeur !== null

  const valeurs = filtre.valeurs.filter((v) => v.trim() !== '')
  if (valeurs.length === 0) return true

  if (filtre.operateur === 'contient') {
    if (valeur === null) return false
    const cible = aplatir(valeur)
    return valeurs.some((v) => cible.includes(aplatir(v)))
  }

  // `est` / `nest_pas` — égalité stricte sur la valeur brute : les identifiants
  // (agent, campagne) et les vocabulaires fermés (canal, statut) ne se
  // comparent pas sans casse, ils se comparent tout court.
  const dedans = valeur !== null && valeurs.includes(valeur)
  return filtre.operateur === 'est' ? dedans : !dedans
}

/**
 * Cette ligne passe-t-elle TOUS les filtres, selon le mode ?
 *
 * Aucun filtre : tout passe. C'est vrai dans les deux modes, et ça vaut d'être
 * dit — un OU sans terme est vide en logique, mais un tableau sans pastille qui
 * n'afficherait rien serait absurde.
 */
export function ligneRetenue(
  ligne: LigneTache,
  criteres: CriteresVue,
  ctx: ContexteLecture = {},
): boolean {
  const filtres = criteres.filtres ?? []
  if (filtres.length === 0) return true
  return criteres.mode === 'ou'
    ? filtres.some((f) => ligneSatisfait(ligne, f, ctx))
    : filtres.every((f) => ligneSatisfait(ligne, f, ctx))
}

/* ── Le tri ──────────────────────────────────────────────────────────────── */

/**
 * La clé de tri d'une colonne. L'échéance se trie sur le TEMPS, pas sur son
 * seau : dans « échue », le 14 août passe avant le 19.
 *
 * Une échéance absente part en fin de liste dans les deux sens — elle n'est ni
 * la plus ancienne ni la plus récente, elle n'est nulle part, et la remonter en
 * tête d'un tri décroissant ferait passer du vide pour de l'urgent.
 */
function cleDeTri(ligne: LigneTache, colonne: Colonne): { n?: number; t: string } {
  if (colonne === 'echeance') {
    const ms = ligne.echeance ? new Date(ligne.echeance).getTime() : NaN
    return { n: Number.isFinite(ms) ? ms : undefined, t: '' }
  }
  const brut =
    colonne === 'titre'
      ? ligne.titre
      : colonne === 'campagne'
        ? (ligne.campagne ?? '')
        : colonne === 'agent'
          ? (ligne.agent ?? '')
          : colonne === 'reponse'
            ? (ligne.aRepondu ? 'oui' : 'non')
            : (valeurDuChamp(ligne, colonne as Champ) ?? '')
  return { t: aplatir(brut) }
}

export function trierLignes(lignes: readonly LigneTache[], tri: Tri = TRI_PAR_DEFAUT): LigneTache[] {
  const signe = tri.sens === 'desc' ? -1 : 1
  return [...lignes].sort((a, b) => {
    const ca = cleDeTri(a, tri.colonne)
    const cb = cleDeTri(b, tri.colonne)
    if (ca.n !== undefined || cb.n !== undefined) {
      if (ca.n === undefined && cb.n === undefined) return 0
      if (ca.n === undefined) return 1
      if (cb.n === undefined) return -1
      return (ca.n - cb.n) * signe
    }
    return ca.t.localeCompare(cb.t, 'fr') * signe
  })
}

/** Filtrer puis trier — ce que l'écran demande, en un appel. */
export function filtrerTaches(
  lignes: readonly LigneTache[],
  criteres: CriteresVue = CRITERES_VIDES,
  ctx: ContexteLecture = {},
): LigneTache[] {
  return trierLignes(
    lignes.filter((l) => ligneRetenue(l, criteres, ctx)),
    criteres.tri ?? TRI_PAR_DEFAUT,
  )
}

/* ── Ce que les pastilles proposent ──────────────────────────────────────── */

export interface ValeurProposee {
  valeur: string
  libelle: string
  /** Combien de lignes la portent, dans la file ENTIÈRE. */
  n: number
}

const LIBELLE_FIXE: Record<string, string> = {
  call: 'Appel',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  email: 'E-mail',
  pending: 'En attente',
  done: 'Faite',
  snoozed: 'Mise de côté',
  skipped: 'Ignorée',
  A_site_faible: 'A · site faible',
  B_sans_site: 'B · sans site',
  premier: 'Premier contact',
  suivi: 'Déjà touchée',
  oui: 'A répondu',
  non: 'Sans réponse',
}

/**
 * Les valeurs qu'un champ peut prendre dans cette file, avec leur effectif.
 *
 * COMPTÉES SUR LA FILE ENTIÈRE, jamais sur le résultat courant. Une pastille
 * dont les comptes rétrécissent à mesure qu'on filtre ne dit plus « il y a 640
 * appels » mais « il reste 640 appels parmi ce que tu regardes déjà » — et on
 * ne peut plus s'en servir pour choisir le filtre suivant.
 *
 * L'échéance est le seul champ dont les valeurs sont ÉNUMÉRÉES plutôt que
 * relevées : un seau vide doit rester proposable, sinon « Demain » disparaît
 * les jours où rien n'est prévu — précisément les jours où on veut le vérifier.
 */
export function valeursProposees(
  lignes: readonly LigneTache[],
  champ: Champ,
  ctx: ContexteLecture = {},
): ValeurProposee[] {
  const compte = new Map<string, number>()
  const libelles = new Map<string, string>()

  if (champ === 'echeance') for (const s of SEAUX_ECHEANCE) compte.set(s, 0)

  for (const ligne of lignes) {
    const v = valeurDuChamp(ligne, champ, ctx)
    if (v === null) continue
    compte.set(v, (compte.get(v) ?? 0) + 1)
    if (champ === 'agent' && ligne.agent) libelles.set(v, ligne.agent)
    if (champ === 'campagne' && ligne.campagne) libelles.set(v, ligne.campagne)
  }

  const sortie = [...compte.entries()].map(([valeur, n]) => ({
    valeur,
    libelle:
      libelles.get(valeur) ??
      (champ === 'echeance' ? SEAU_LABEL[valeur as SeauEcheance] : undefined) ??
      LIBELLE_FIXE[valeur] ??
      valeur,
    n,
  }))

  // L'échéance garde son ordre chronologique — trier ses seaux par effectif
  // mettrait « plus tard » avant « aujourd'hui ».
  if (champ === 'echeance') {
    return sortie.sort(
      (a, b) =>
        SEAUX_ECHEANCE.indexOf(a.valeur as SeauEcheance) -
        SEAUX_ECHEANCE.indexOf(b.valeur as SeauEcheance),
    )
  }
  return sortie.sort((a, b) => b.n - a.n || a.libelle.localeCompare(b.libelle, 'fr'))
}

/** Le libellé d'une valeur, pour l'afficher dans une cellule ou une pastille. */
export const libelleValeur = (valeur: string): string => LIBELLE_FIXE[valeur] ?? valeur

/* ── Ce qu'une vue enregistrée doit valoir ───────────────────────────────── */

/**
 * Des critères venus de la base ou du navigateur, ramenés à quelque chose
 * d'exécutable — ou `null` si rien n'en sort.
 *
 * POURQUOI VALIDER PLUTÔT QUE FAIRE CONFIANCE : `criteres` est un jsonb libre.
 * Un champ inventé ferait rendre `undefined` à `valeurDuChamp`, et le tableau
 * se viderait sans que personne puisse dire pourquoi. Un filtre illisible est
 * ÉCARTÉ, pas rejeté en bloc — perdre une pastille sur quatre vaut mieux que
 * perdre la vue entière.
 */
export function normaliserCriteres(brut: unknown): CriteresVue | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
  const source = brut as Record<string, unknown>

  const mode = source.mode === 'ou' ? 'ou' : 'et'

  const filtres: Filtre[] = []
  if (Array.isArray(source.filtres)) {
    for (const f of source.filtres) {
      if (!f || typeof f !== 'object') continue
      const o = f as Record<string, unknown>
      const champ = o.champ as Champ
      const operateur = o.operateur as Operateur
      if (!CHAMPS.includes(champ) || !OPERATEURS.includes(operateur)) continue
      const valeurs = Array.isArray(o.valeurs)
        ? o.valeurs.filter((v): v is string => typeof v === 'string')
        : []
      filtres.push({ champ, operateur, valeurs })
    }
  }

  const colonnes = Array.isArray(source.colonnes)
    ? (source.colonnes.filter((c): c is Colonne => COLONNES.includes(c as Colonne)) as Colonne[])
    : undefined

  let tri: Tri | undefined
  if (source.tri && typeof source.tri === 'object') {
    const t = source.tri as Record<string, unknown>
    if (COLONNES.includes(t.colonne as Colonne)) {
      tri = { colonne: t.colonne as Colonne, sens: t.sens === 'desc' ? 'desc' : 'asc' }
    }
  }

  return {
    mode,
    filtres,
    // Une liste de colonnes VIDE retombe sur le défaut : un tableau sans
    // colonne n'est pas un réglage, c'est un écran blanc.
    ...(colonnes && colonnes.length > 0 ? { colonnes } : {}),
    ...(tri ? { tri } : {}),
  }
}

/** Les colonnes à montrer, réglage ou défaut. */
export const colonnesDeLaVue = (criteres: CriteresVue | null): readonly Colonne[] =>
  criteres?.colonnes && criteres.colonnes.length > 0 ? criteres.colonnes : COLONNES_PAR_DEFAUT

/**
 * La phrase qui dit ce que le filtre courant retient, en français.
 *
 * « Ce qui bloque se dit en français, à l'endroit où ça bloque » : un tableau
 * qui rend zéro ligne doit pouvoir expliquer pourquoi sans qu'on relise les
 * pastilles une par une.
 */
export function resumerCriteres(criteres: CriteresVue): string {
  const filtres = (criteres.filtres ?? []).filter(
    (f) => f.operateur === 'vide' || f.operateur === 'non_vide' || f.valeurs.length > 0,
  )
  if (filtres.length === 0) return 'Toute la file'

  const morceaux = filtres.map((f) => {
    const champ = CHAMP_LABEL[f.champ]
    if (f.operateur === 'vide') return `${champ} : rien`
    if (f.operateur === 'non_vide') return `${champ} : renseigné`
    const liste = f.valeurs
      .map((v) => (f.champ === 'echeance' ? SEAU_LABEL[v as SeauEcheance] ?? v : libelleValeur(v)))
      .join(' ou ')
    if (f.operateur === 'nest_pas') return `${champ} : ni ${liste}`
    if (f.operateur === 'contient') return `${champ} contient « ${liste} »`
    return `${champ} : ${liste}`
  })

  return morceaux.join(criteres.mode === 'ou' ? ' OU ' : ' ET ')
}
