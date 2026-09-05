// conditions.ts — ce qu'une fourche teste, et ce qu'elle répond. Pur.
//
// UNE CONDITION EST UNE FOURCHE, EXACTEMENT COMME UNE ATTENTE.
// C'est ce qui permet de ne RIEN changer au format stocké : `branch` garde ses
// deux sorties, `on: 'reply'` devient OUI et `on: 'timeout'` devient NON. Les
// six séquences existantes ne migrent pas d'un octet, les 92 `vars.replies`
// restent valides, et la récursion d'atteignabilité de `branches.ts` marche
// telle quelle sur les deux natures de fourche.
//
// TROIS RÉPONSES, PAS DEUX. C'est le cœur du fichier.
// `oui` · `non` · `non_mesure`. Une condition qu'on ne sait pas évaluer NE
// RÉPOND PAS « non » : elle répond « je ne sais pas », et c'est l'étape qui
// décide alors où l'envoyer (`siInconnu`, défaut `non`). La différence ne
// change pas le chemin pris — elle change ce qu'on ÉCRIT dans
// `vars.conditions`, donc ce qu'on pourra compter après coup : « combien de
// prospects sont partis dans une voie qu'on a devinée ? ».
//
// POURQUOI PAS UN GEL. Le premier réflexe serait de geler l'inscription quand
// on ne sait pas — c'est ce que le moteur fait déjà quand un message promet un
// audit absent. Mais un gel sans réveil est précisément ce qui a laissé 59
// inscriptions dormir des semaines sans qu'aucun écran ne le montre. Une
// condition ne gèle donc jamais : elle tranche, et elle avoue qu'elle a
// tranché sans savoir.
//
// CE MODULE NE VA RIEN CHERCHER. Il reçoit des FAITS et rend un verdict — même
// découpage que `regulator.ts` / `regulator-db.ts`. La collecte vit dans
// `conditions-db.ts` ; ici, ni base ni réseau, donc tout est éprouvable.

/* ── Le vocabulaire ──────────────────────────────────────────────────────── */

/**
 * Les champs testables AUJOURD'HUI, sur les données qu'on a déjà.
 *
 * L'effectif indiqué est celui relevé sur les 905 entreprises attribuées le
 * 19/08/2026 : c'est lui qui dit si une condition sert à quelque chose. Une
 * condition sur un champ renseigné trois fois est une condition qui enverra
 * tout le monde du même côté.
 */
export const CHAMPS_CONDITION = [
  'a_email',              // 478 / 905
  'a_mobile',             // 394 / 905
  'a_fixe',               // 466 / 905
  'a_contact_nominatif',  // 75 / 905 — ce chiffre gouverne le choix des modèles
  'audit_pret',           // 161
  'demo_prete',           // 321
  'cohorte',              // A 282 · B 297
  'presence_web',         // 3 041 constats, TROIS états
  'ca',
  'effectif',
  'rge_expire_sous_90j',
  'issue_dernier_appel',
  'a_rebondi',
  'rdv_pris',
  // ── LE SEUL SIGNAL D'INTENTION QU'ON SAIT VRAIMENT MESURER ───────────────
  //
  // Pas « a ouvert l'e-mail » : Resend ne suit pas les ouvertures par envoi,
  // c'est un réglage de DOMAINE, et on ne l'active pas — pixel d'ouverture et
  // réécriture de liens abîment la réputation qu'on est en train de construire
  // (cf. `CONDITIONS_ECARTEES`). Ce qu'on compte, ce sont les VUES DES LIENS À
  // JETON, côté serveur, sans rien poser chez le destinataire.
  //
  // Densité au 20/08/2026 : 162 rapports publiés, 1 ouvert ; 2 plaquettes
  // générées, 2 ouvertes. C'est peu, et pour une raison qui n'est pas un
  // défaut de mesure : on n'a presque rien envoyé. Ces deux champs valent le
  // jour où la séquence tourne, pas avant.
  'rapport_vu',
  'plaquette_vue',
  // ── LE SEUL LIEN QU'ON ENVOIE VRAIMENT ───────────────────────────────────
  //
  // ⚠️ À PRÉFÉRER À `plaquette_vue` ET `rapport_vu`, QUI NE PEUVENT PAS MARCHER.
  // La plaquette part en PDF JOINT, jamais en lien — c'est une règle de fond,
  // pas un état de fait : « c'est plus pro ». Relevé le 05/09/2026 : sur 806
  // messages sortants, UN SEUL porte une URL de plaquette et AUCUN une URL de
  // rapport. Les deux compteurs à jeton ne peuvent donc être bougés que par
  // NOUS — 897 fiches ont un jeton, 11 portent une vue, et ces 11 sont
  // exactement les fiches qu'un agent a ouvertes pour fabriquer le PDF, la vue
  // tombant 5 à 194 secondes après le geste. Un compteur branché sur soi-même.
  //
  // La démo, elle, part en URL nue dans le message : c'est la seule pièce que
  // le prospect peut ouvrir, et GA4 la mesure par nom d'hôte. C'est donc le
  // seul signal d'intention honnête que ce CRM possède, et celui que la file
  // affiche déjà sous forme de flamme.
  'demo_visitee',
] as const
export type ChampCondition = (typeof CHAMPS_CONDITION)[number]

export const CHAMP_LABEL: Record<ChampCondition, string> = {
  a_email: 'A une adresse e-mail',
  a_mobile: 'A un mobile',
  a_fixe: 'A un fixe',
  a_contact_nominatif: 'A un contact nominatif',
  audit_pret: 'L’audit est prêt',
  demo_prete: 'La démo est publiée',
  cohorte: 'Cohorte',
  presence_web: 'Présence web',
  ca: 'Chiffre d’affaires',
  effectif: 'Effectif (plancher de tranche)',
  rge_expire_sous_90j: 'RGE expire sous 90 jours',
  issue_dernier_appel: 'Issue du dernier appel',
  a_rebondi: 'A rebondi',
  rdv_pris: 'Rendez-vous pris',
  rapport_vu: 'A ouvert son rapport d’audit',
  plaquette_vue: 'A ouvert la plaquette',
  demo_visitee: 'A visité sa démo',
}

export const OPERATEURS_CONDITION = ['vrai', 'faux', 'est', 'nest_pas', 'au_moins', 'au_plus'] as const
export type OperateurCondition = (typeof OPERATEURS_CONDITION)[number]

export const OPERATEUR_LABEL: Record<OperateurCondition, string> = {
  vrai: 'est vrai',
  faux: 'est faux',
  est: 'est',
  nest_pas: 'n’est pas',
  au_moins: 'vaut au moins',
  au_plus: 'vaut au plus',
}

/** La nature d'un champ décide des opérateurs qu'on peut lui appliquer. */
type Nature = 'booleen' | 'liste' | 'nombre'

const NATURE: Record<ChampCondition, Nature> = {
  a_email: 'booleen',
  a_mobile: 'booleen',
  a_fixe: 'booleen',
  a_contact_nominatif: 'booleen',
  audit_pret: 'booleen',
  demo_prete: 'booleen',
  rge_expire_sous_90j: 'booleen',
  a_rebondi: 'booleen',
  rdv_pris: 'booleen',
  rapport_vu: 'booleen',
  plaquette_vue: 'booleen',
  demo_visitee: 'booleen',
  cohorte: 'liste',
  presence_web: 'liste',
  issue_dernier_appel: 'liste',
  ca: 'nombre',
  effectif: 'nombre',
}

const OPERATEURS_PAR_NATURE: Record<Nature, readonly OperateurCondition[]> = {
  booleen: ['vrai', 'faux'],
  liste: ['est', 'nest_pas'],
  nombre: ['au_moins', 'au_plus'],
}

/** Les opérateurs qu'un champ accepte — ce que l'éditeur doit proposer. */
export const operateursDe = (champ: ChampCondition): readonly OperateurCondition[] =>
  OPERATEURS_PAR_NATURE[NATURE[champ]]

/**
 * Les valeurs d'un champ de type liste.
 *
 * `presence_web` en a TROIS, et c'est notre avantage sur lemlist : « absent
 * confirmé » et « on n'a pas pu savoir » ne s'écrivent pas comme le même NULL.
 * Leur « Has score » aplatit les deux ; nous, non.
 */
export const VALEURS_DE: Partial<Record<ChampCondition, readonly { valeur: string; libelle: string }[]>> = {
  cohorte: [
    { valeur: 'A_site_faible', libelle: 'A · site faible' },
    { valeur: 'B_sans_site', libelle: 'B · sans site' },
  ],
  presence_web: [
    { valeur: 'present', libelle: 'A un site' },
    { valeur: 'absent', libelle: 'Pas de site (confirmé)' },
    { valeur: 'inconnu', libelle: 'On n’a pas pu savoir' },
  ],
  /**
   * ⚠️ CE VOCABULAIRE EST CELUI DE `STEP_OUTCOMES`, ET PAS UN AUTRE.
   *
   * Il portait `answered / no_answer / callback / refused` — quatre valeurs
   * inventées ici, qu'aucune ligne de la base ne contient. La lecture, elle,
   * rendait `prospection_tasks.status` : `pending`, `done`, `skipped`,
   * `snoozed`. Aucune des deux listes ne rencontrait l'autre : la condition
   * répondait « non » à TOUT LE MONDE, et rien à l'écran ne le disait. C'est
   * exactement la faute déjà payée sur « l'audit est-il prêt ? ».
   *
   * Les identifiants ci-dessous sont ceux écrits dans `email_logs.outcome` par
   * la note d'issue — 18 lignes au 20/08/2026, dont 9 « a répondu ». Ce sont
   * les seuls qui existent, donc les seuls qu'on propose.
   */
  issue_dernier_appel: [
    { valeur: 'answered', libelle: 'A répondu' },
    { valeur: 'lukewarm', libelle: 'A répondu, peu intéressé' },
    { valeur: 'no_answer', libelle: 'Pas de réponse' },
    { valeur: 'later', libelle: 'Mis de côté — à rappeler' },
    { valeur: 'not_interested', libelle: 'Pas intéressé' },
    { valeur: 'blocked', libelle: 'Bloqué / mauvais numéro' },
    { valeur: 'other', libelle: 'Autre' },
  ],
}

export interface Condition {
  champ: ChampCondition
  operateur: OperateurCondition
  valeurs?: string[]
  seuil?: number
  /** Où envoyer quand on ne sait pas. Défaut `non`. */
  siInconnu?: 'oui' | 'non'
}

/* ── Les faits ───────────────────────────────────────────────────────────── */

/**
 * Ce qu'on sait d'un prospect au moment de trancher.
 *
 * `undefined` VEUT DIRE « PAS ALLÉ CHERCHER », et c'est différent de `false`.
 * Un booléen à `false` est une absence MESURÉE — on a regardé, il n'y a pas
 * d'adresse. Un booléen absent est une lecture qu'on n'a pas faite. Les deux
 * ne peuvent pas mener à la même trace, sinon on ne saura jamais si une voie a
 * été prise pour une raison ou par défaut.
 *
 * `presenceWeb` pousse la distinction d'un cran : `'inconnu'` est une valeur
 * MESURÉE (un constat existe, il dit qu'on n'a pas pu conclure), tandis que
 * `null` veut dire qu'aucun constat n'a jamais été posé.
 */
export interface FaitsProspect {
  aEmail?: boolean
  aMobile?: boolean
  aFixe?: boolean
  aContactNominatif?: boolean
  auditPret?: boolean
  demoPrete?: boolean
  aRebondi?: boolean
  rdvPris?: boolean
  /** Le lien à jeton du rapport a été ouvert au moins une fois (compté côté serveur). */
  rapportVu?: boolean
  plaquetteVue?: boolean
  /**
   * Le prospect est venu sur SA démo, mesuré par GA4 sur le nom d'hôte.
   *
   * `undefined` quand on n'a pas pu regarder (GA4 non configuré, lecture en
   * échec) — surtout pas `false`, qui dirait « personne n'est venu ».
   */
  demoVisitee?: boolean
  rgeExpireSous90j?: boolean
  cohorte?: string | null
  presenceWeb?: 'present' | 'absent' | 'inconnu' | null
  issueDernierAppel?: string | null
  ca?: number | null
  effectif?: number | null
}

/** Quel fait porte quel champ. Une seule table, pour qu'on ne l'écrive pas deux fois. */
const LECTURE: Record<ChampCondition, keyof FaitsProspect> = {
  a_email: 'aEmail',
  a_mobile: 'aMobile',
  a_fixe: 'aFixe',
  a_contact_nominatif: 'aContactNominatif',
  audit_pret: 'auditPret',
  demo_prete: 'demoPrete',
  rge_expire_sous_90j: 'rgeExpireSous90j',
  a_rebondi: 'aRebondi',
  rdv_pris: 'rdvPris',
  rapport_vu: 'rapportVu',
  plaquette_vue: 'plaquetteVue',
  demo_visitee: 'demoVisitee',
  cohorte: 'cohorte',
  presence_web: 'presenceWeb',
  issue_dernier_appel: 'issueDernierAppel',
  ca: 'ca',
  effectif: 'effectif',
}

/* ── L'effectif : un CODE, pas un nombre ─────────────────────────────────── */

/**
 * `entreprises_donnees_publiques.tranche_effectif_code` porte le code INSEE,
 * pas un effectif. On le ramène au PLANCHER de sa tranche, pour que « au moins
 * 10 salariés » veuille dire quelque chose.
 *
 * ⚠️ `NN` N'EST PAS ZÉRO. Il veut dire « unité non employeuse ou effectif
 * inconnu », et il porte 672 des 2 884 lignes renseignées — près d'un quart.
 * Le traiter comme 0 ferait passer un quart du fichier pour des entreprises
 * sans salarié, et « au plus 2 salariés » les ramasserait toutes. Il rend donc
 * `null`, ce que `evaluerCondition` traduit en `non_mesure`.
 *
 * `00` (31 lignes), lui, est un vrai zéro mesuré : l'entreprise existe et
 * n'emploie personne. Les deux ne se confondent pas.
 */
const PLANCHER_TRANCHE: Readonly<Record<string, number>> = {
  '00': 0, '01': 1, '02': 3, '03': 6,
  '11': 10, '12': 20, '21': 50, '22': 100,
  '31': 200, '32': 250, '41': 500, '42': 1000,
  '51': 2000, '52': 5000, '53': 10000,
}

export function effectifPlancher(code: string | null | undefined): number | null {
  const c = (code ?? '').trim().toUpperCase()
  if (!c || c === 'NN') return null
  return PLANCHER_TRANCHE[c] ?? null
}

/* ── Le verdict ──────────────────────────────────────────────────────────── */

export type Verdict = 'oui' | 'non' | 'non_mesure'

/**
 * La condition, sur ces faits.
 *
 * Rend `non_mesure` dans trois cas, et il vaut de les distinguer à la lecture :
 *   · le fait n'a pas été relevé (`undefined`) ;
 *   · il a été relevé et vaut `null` — aucune donnée pour ce prospect ;
 *   · la condition elle-même est incohérente (opérateur qui ne va pas avec le
 *     champ, seuil manquant, liste de valeurs vide). Une définition à moitié
 *     éditée ne doit pas décider du sort d'un prospect.
 */
export function evaluerCondition(c: Condition, f: FaitsProspect): Verdict {
  if (!CHAMPS_CONDITION.includes(c.champ)) return 'non_mesure'
  if (!operateursDe(c.champ).includes(c.operateur)) return 'non_mesure'

  const valeur = f[LECTURE[c.champ]]
  if (valeur === undefined || valeur === null) return 'non_mesure'

  switch (c.operateur) {
    case 'vrai':
      return valeur === true ? 'oui' : 'non'
    case 'faux':
      return valeur === false ? 'oui' : 'non'
    case 'est':
    case 'nest_pas': {
      const attendues = (c.valeurs ?? []).filter((v) => v.trim() !== '')
      if (attendues.length === 0) return 'non_mesure'
      // Plusieurs valeurs dans une condition, c'est un OU — la même règle que
      // les pastilles du tableau des tâches, et pour la même raison : personne
      // n'a jamais voulu dire « à la fois cohorte A et cohorte B ».
      const dedans = attendues.includes(String(valeur))
      const vrai = c.operateur === 'est' ? dedans : !dedans
      return vrai ? 'oui' : 'non'
    }
    case 'au_moins':
    case 'au_plus': {
      if (typeof c.seuil !== 'number' || !Number.isFinite(c.seuil)) return 'non_mesure'
      const n = Number(valeur)
      // `Number(null)` vaut ZÉRO, pas NaN — le piège est déjà documenté
      // ailleurs dans le CRM. Le `null` est écarté plus haut, mais une chaîne
      // vide passerait ici : on la refuse explicitement.
      if (!Number.isFinite(n) || valeur === '') return 'non_mesure'
      return (c.operateur === 'au_moins' ? n >= c.seuil : n <= c.seuil) ? 'oui' : 'non'
    }
  }
}

/**
 * L'issue effectivement prise, verdict compris.
 *
 * C'est ici que `siInconnu` s'applique — et NULLE PART AILLEURS, pour qu'on ne
 * puisse pas se retrouver avec deux endroits qui devinent différemment.
 */
export function issueDeLaCondition(c: Condition, f: FaitsProspect): { verdict: Verdict; oui: boolean } {
  const verdict = evaluerCondition(c, f)
  if (verdict === 'non_mesure') return { verdict, oui: (c.siInconnu ?? 'non') === 'oui' }
  return { verdict, oui: verdict === 'oui' }
}

/**
 * Cette condition est-elle écrivable telle quelle ?
 *
 * Sert à l'éditeur AVANT d'enregistrer : une condition incohérente déployée
 * enverrait tout le monde dans la voie « inconnu » sans que personne le voie —
 * exactement le défaut qu'on corrige. Rend la phrase à afficher, ou `null`.
 */
export function raisonDeRefus(c: Partial<Condition>): string | null {
  if (!c.champ || !CHAMPS_CONDITION.includes(c.champ)) return 'Choisir ce qu’on teste.'
  if (!c.operateur || !operateursDe(c.champ).includes(c.operateur)) {
    return `« ${CHAMP_LABEL[c.champ]} » ne se teste pas avec cet opérateur.`
  }
  if ((c.operateur === 'est' || c.operateur === 'nest_pas') && !(c.valeurs ?? []).some((v) => v.trim())) {
    return 'Choisir au moins une valeur.'
  }
  if ((c.operateur === 'au_moins' || c.operateur === 'au_plus') && typeof c.seuil !== 'number') {
    return 'Indiquer un seuil.'
  }
  return null
}

/** La condition en français — ce qu'on écrit sur le nœud de la fourche. */
export function libelleCondition(c: Partial<Condition>): string {
  if (!c.champ || !CHAMPS_CONDITION.includes(c.champ)) return 'Condition à écrire'
  const champ = CHAMP_LABEL[c.champ]
  if (c.operateur === 'vrai') return champ
  if (c.operateur === 'faux') return `${champ} — non`
  if (c.operateur === 'au_moins') return `${champ} ≥ ${c.seuil ?? '…'}`
  if (c.operateur === 'au_plus') return `${champ} ≤ ${c.seuil ?? '…'}`
  const noms = (c.valeurs ?? []).map(
    (v) => VALEURS_DE[c.champ!]?.find((x) => x.valeur === v)?.libelle ?? v,
  )
  const liste = noms.length > 0 ? noms.join(' ou ') : '…'
  return c.operateur === 'nest_pas' ? `${champ} : ni ${liste}` : `${champ} : ${liste}`
}

/* ── Ce qu'on NE propose pas, et pourquoi ────────────────────────────────── */

/**
 * Les conditions de lemlist qu'on écarte — DITES À L'ÉCRAN, pas cachées.
 *
 * Un éditeur qui propose treize conditions dont quatre ne marchent pas est pire
 * qu'un éditeur qui en propose neuf et explique les quatre autres.
 */
export const CONDITIONS_ECARTEES: readonly { nom: string; pourquoi: string }[] = [
  {
    nom: 'A ouvert / a cliqué',
    // CORRECTION AU PLAN, et elle vient du dépôt lui-même. Le plan rangeait ces
    // deux-là en « couche 2b : un préalable, puis évaluables ». Le préalable a
    // été livré (en-têtes et `message_id` sur les envois) et ça ne suffit
    // toujours pas : Resend n'expose aucune option de suivi par envoi, c'est un
    // réglage de DOMAINE — et on ne l'active pas, parce que le pixel
    // d'ouverture et la réécriture de liens abîment la réputation qu'on est en
    // train de construire (cf. `trackOpens`, @deprecated dans `types.ts`).
    // `email_events` porte UNE ligne. Ce qui se mesure vraiment chez nous, ce
    // sont les vues des liens à jeton, comptées côté serveur.
    pourquoi:
      'Resend ne suit pas les ouvertures par envoi, et le suivi par domaine abîme la réputation — on ne l’active pas. Ce qui se mesure : les vues des liens à jeton.',
  },
  {
    nom: 'Désabonné',
    pourquoi:
      'Aucun mécanisme de désabonnement n’existe — ni en-tête List-Unsubscribe, ni route à jeton. C’est un chantier à part, pas une condition.',
  },
  {
    nom: 'A un compte WhatsApp',
    pourquoi:
      'Indétectable avant d’écrire. C’est la sortie « hors canal » qui le dit, après coup.',
  },
  {
    nom: 'Invitation LinkedIn acceptée · message lu',
    pourquoi: 'Aucune intégration LinkedIn, et aucune de nos 905 fiches n’a d’URL LinkedIn.',
  },
  {
    nom: 'Has score',
    pourquoi:
      'Aucun score n’existe. L’inventer créerait un chiffre que personne ne saurait expliquer — la présence web à trois états dit mieux la même chose.',
  },
]

/* ── L'AIGUILLAGE : plus de deux voies ───────────────────────────────────── */

/**
 * UNE QUESTION NE SUFFISAIT PAS.
 *
 * Une fourche à deux voies oblige à poser la même question en cascade
 * d'étapes : « a-t-il un mobile ? » puis, dans la voie « non », « a-t-il une
 * adresse ? » puis, dans la voie « non » de celle-là, « a-t-il un fixe ? ».
 * Trois fourches imbriquées pour un seul aiguillage — et l'éditeur ne dessine
 * qu'un niveau de fourche, donc les deux derniers étages devenaient invisibles.
 *
 * C'est exactement le routage dont le fichier a besoin : 394 mobiles, 478
 * adresses, 466 fixes, 75 contacts nominatifs. Une seule séquence peut porter
 * tout le portefeuille si elle sait aiguiller au premier pas ; sans ça il en
 * faut quatre, et quatre séquences veulent dire quatre endroits où corriger un
 * message.
 *
 * LE PREMIER CAS VRAI GAGNE. L'ordre est donc porteur de sens : mettre le cas
 * large avant le cas étroit rend le second inatteignable. `raisonDeRefusAiguillage`
 * attrape la forme grossière de cette faute (deux cas identiques) ; le reste se
 * lit dans l'ordre affiché, ce qui est le point de l'éditeur.
 *
 * ⚠️ « ON NE SAIT PAS » NE RETIENT PAS LE PROSPECT, IL LE LAISSE PASSER.
 * Sur une fourche à deux voies, `siInconnu` dit où envoyer celui dont la donnée
 * manque. Dans une cascade, ça n'a pas de sens : un cas qu'on ne sait pas
 * trancher ne peut pas prétendre attraper le prospect — il passe au cas
 * suivant, et à défaut il tombe dans « sinon ». D'où la seule règle à retenir
 * en écrivant la voie « sinon » : **elle s'adresse aussi à ceux dont on ne
 * savait rien**, pas seulement à ceux qu'aucun cas ne décrit. Les cas non
 * mesurés sont notés pour qu'on puisse les compter après coup.
 */

/** La voie de repli d'un aiguillage — toujours présente, toujours la dernière. */
export const SORTIE_SINON = 'sinon'

/** Un cas d'aiguillage : une condition, et la sortie qu'elle ouvre. */
export interface CasAiguillage extends Condition {
  /** Clé de la sortie. Stable : c'est elle que les étapes de la voie portent. */
  cle: string
  /** Ce qu'on écrit sur la voie. Vide → la condition en français. */
  libelle?: string
}

export interface IssueAiguillage {
  /** La clé du cas retenu, ou `sinon`. */
  sortie: string
  /**
   * Les cas qu'on n'a pas su trancher avant d'arriver là. Trace seulement :
   * la voie ne s'en déduit pas. Sans eux, personne ne pourrait dire si « sinon »
   * a ramassé des prospects parce qu'aucun cas ne les décrit, ou parce que la
   * base était muette sur eux.
   */
  nonMesures: string[]
}

/** Le cas en français — ce qu'on écrit sur la voie quand l'auteur n'a rien mis. */
export const libelleCas = (c: Partial<CasAiguillage>): string =>
  c.libelle?.trim() || libelleCondition(c)

/**
 * La sortie que cet aiguillage donne à ce prospect.
 *
 * Un cas incohérent (opérateur qui ne va pas avec le champ, seuil manquant) est
 * traité comme non mesuré plutôt que comme faux : il n'attrape personne, et il
 * le dit. Une définition à moitié éditée ne doit pas décider du sort d'un
 * prospect — c'est la même règle que `evaluerCondition`.
 */
export function evaluerAiguillage(
  cas: readonly CasAiguillage[],
  f: FaitsProspect,
): IssueAiguillage {
  const nonMesures: string[] = []
  for (const c of cas) {
    if (raisonDeRefus(c)) {
      nonMesures.push(c.cle)
      continue
    }
    const verdict = evaluerCondition(c, f)
    if (verdict === 'oui') return { sortie: c.cle, nonMesures }
    if (verdict === 'non_mesure') nonMesures.push(c.cle)
  }
  return { sortie: SORTIE_SINON, nonMesures }
}

/**
 * Cet aiguillage est-il écrivable tel quel ?
 *
 * Rend la phrase à afficher, ou `null`. Trois refus, dans l'ordre où ils se
 * découvrent en écrivant : pas de cas du tout, deux cas qui portent la même
 * clé (les voies se confondraient), un cas qui ne tranchera jamais.
 *
 * Et un quatrième, qui n'est pas une faute de forme mais un piège : deux cas
 * qui testent EXACTEMENT la même chose. Le second est inatteignable, et rien
 * ne le dirait — la voie resterait dessinée, vide de tout prospect.
 */
export function raisonDeRefusAiguillage(cas: readonly Partial<CasAiguillage>[]): string | null {
  if (cas.length === 0) return 'Un aiguillage a besoin d’au moins un cas.'
  const vues = new Set<string>()
  const signatures = new Map<string, string>()
  for (const c of cas) {
    const cle = (c.cle ?? '').trim()
    if (!cle) return 'Un cas sans clé ne peut porter aucune voie.'
    if (cle === SORTIE_SINON) return '« sinon » est la voie de repli — un cas ne peut pas s’appeler comme elle.'
    if (vues.has(cle)) return `Deux cas portent la clé « ${cle} » : leurs voies se confondraient.`
    vues.add(cle)
    const refus = raisonDeRefus(c)
    if (refus) return `Cas « ${libelleCas(c)} » : ${refus.charAt(0).toLowerCase()}${refus.slice(1)}`
    const signature = JSON.stringify([c.champ, c.operateur, [...(c.valeurs ?? [])].sort(), c.seuil])
    const premier = signatures.get(signature)
    if (premier) {
      return `« ${libelleCas(c)} » ne sera jamais atteint : « ${premier} » teste déjà exactement la même chose, et le premier cas vrai gagne.`
    }
    signatures.set(signature, libelleCas(c))
  }
  return null
}
