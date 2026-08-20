// campagne.ts — qui entre dans une campagne, qui n'y entre pas, et pourquoi.
//
// Module PUR : aucune base, aucun réseau, tout se teste sans mock. Même
// découpage que `regulator.ts` / `regulator-db.ts` et `branches.ts` — la
// décision ici, l'accès aux données à côté.
//
// CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS
// Il répond à « ce prospect part-il, et sinon pourquoi ». Il ne dit RIEN de
// l'avancement du prospect : les seize statuts de lead de lemlist se dérivent
// ailleurs, de l'inscription et des événements. Une campagne qui stockerait
// l'avancement le verrait diverger au premier UPDATE manqué.
//
// POURQUOI UN MOTIF EST OBLIGATOIRE
// « 297 leads, 41 écartés » ne dit rien : on ne sait ni quoi corriger, ni si
// c'est grave. « 41 écartés dont 22 sans canal » désigne le geste suivant —
// enrichir. Le motif n'est pas de la documentation, c'est ce qui rend la revue
// avant lancement utilisable.

import { correspondAuPublic, type Canal, type PublicVise } from '@/lib/prospects/canal'

/** D'où vient un lead dans la liste. Une trace, jamais une dépendance. */
export type OrigineLead = 'segment' | 'lot' | 'explorateur' | 'manuel' | 'reprise'

/** Où en est la LISTE pour ce lead — pas où en est le prospect. */
export type StatutListe = 'a_lancer' | 'inscrit' | 'ecarte' | 'termine'

/** Pourquoi ce lead ne partira pas. Miroir exact du `check` SQL. */
export type MotifEcart =
  | 'sans_canal'
  | 'public_non_atteint'
  | 'desabonne'
  | 'deja_inscrit'
  | 'a_deja_reagi'
  | 'sans_affaire'
  | 'archive'
  | 'manuel'

export const MOTIFS_ECART: readonly MotifEcart[] = [
  'sans_canal',
  'public_non_atteint',
  'desabonne',
  'deja_inscrit',
  'a_deja_reagi',
  'sans_affaire',
  'archive',
  'manuel',
] as const

/**
 * Le libellé lu par l'opérateur, et le geste qu'il appelle.
 *
 * Chaque motif dit ce qu'il y a à FAIRE, pas seulement ce qui manque : un
 * écran qui affiche « sans canal » sans dire « enrichir » laisse le lead
 * dormir.
 */
export const MOTIF_ECART_LABEL: Readonly<Record<MotifEcart, string>> = {
  sans_canal: 'aucun moyen de le joindre — enrichir avant',
  public_non_atteint: 'pas le canal que cette campagne exige — une autre lui ira',
  desabonne: 'désabonné ou blacklisté — ne repart jamais',
  deja_inscrit: 'déjà dans une autre campagne — finir celle-là d’abord',
  a_deja_reagi: 'a déjà réagi — au commercial, pas à une séquence',
  sans_affaire: 'aucune affaire ouverte — invisible des tableaux tant qu’il n’en a pas',
  archive: 'fiche archivée',
  manuel: 'écarté à la revue',
}

export const motifEcartLabel = (motif: MotifEcart | null | undefined): string =>
  motif ? (MOTIF_ECART_LABEL[motif] ?? '') : ''

/**
 * Un écart qui se corrige, ou un écart définitif ?
 *
 * Même distinction que `sortieARedemarcher` pour les sorties de séquence, et
 * pour la même raison : la revue avant lancement doit séparer « il manque
 * quelque chose, va le chercher » de « celui-là, c'est non ». Mélanger les deux
 * fait relancer des gens qui ont dit non, ou abandonner des fiches qu'un
 * enrichissement aurait sauvées.
 */
export function ecartRattrapable(motif: MotifEcart | null | undefined): boolean {
  return (
    motif === 'sans_canal' ||
    motif === 'public_non_atteint' ||
    motif === 'deja_inscrit' ||
    motif === 'sans_affaire'
  )
}

/** Ce qu'on sait d'un prospect au moment de décider s'il part. */
export interface FaitsDuLead {
  /** Ce par quoi il est joignable — via `collecterCanaux`, entreprise ET contacts. */
  canaux: Set<Canal>
  /** Adresse dans les suppressions, ou numéro blacklisté. */
  desabonne?: boolean
  /** Une inscription `active` ou `paused` sur une AUTRE séquence. */
  inscriptionVivanteAilleurs?: boolean
  /** A répondu, pris rendez-vous, dit non, ou été mis en nurture. */
  aDejaReagi?: boolean
  /** Une opportunité non archivée existe. */
  aUneAffaire?: boolean
  /** Fiche archivée depuis l'ajout à la liste. */
  archive?: boolean
  /** Écarté à la main pendant la revue. */
  ecarteALaMain?: boolean
}

/**
 * Pourquoi ce lead ne part pas — ou `null` s'il part.
 *
 * L'ORDRE EST LA RÈGLE, et il va du définitif au réparable. Un prospect
 * archivé qui n'a pas de canal doit lire « archivé », pas « enrichir » : le
 * second enverrait quelqu'un travailler sur une fiche rangée. À l'inverse,
 * entre deux motifs réparables, on annonce celui qui bloque en premier —
 * inutile de dire « pas d'affaire » à qui n'a aucun numéro.
 */
export function motifEcart(faits: FaitsDuLead, cible: PublicVise): MotifEcart | null {
  if (faits.ecarteALaMain) return 'manuel'
  if (faits.archive) return 'archive'
  if (faits.aDejaReagi) return 'a_deja_reagi'
  if (faits.desabonne) return 'desabonne'
  if (faits.inscriptionVivanteAilleurs) return 'deja_inscrit'
  if (faits.canaux.size === 0) return 'sans_canal'
  if (!correspondAuPublic(faits.canaux, cible)) return 'public_non_atteint'
  // En dernier, parce que c'est le seul qui ne concerne pas le prospect mais
  // notre propre tenue de dossier : sans affaire, aucun tableau ne le montrera,
  // et un lead qu'on ne voit pas est un lead perdu même s'il reçoit tout.
  if (faits.aUneAffaire === false) return 'sans_affaire'
  return null
}

/** Ce lead part-il ? Le pendant lisible de `motifEcart`. */
export const leadEligible = (faits: FaitsDuLead, cible: PublicVise): boolean =>
  motifEcart(faits, cible) === null

/** Le statut de liste qui découle de la décision. */
export function statutInitial(faits: FaitsDuLead, cible: PublicVise): {
  statut: StatutListe
  motif: MotifEcart | null
} {
  const motif = motifEcart(faits, cible)
  return motif ? { statut: 'ecarte', motif } : { statut: 'a_lancer', motif: null }
}

/** Le décompte d'une revue avant lancement : combien partent, et pourquoi les autres non. */
export interface RevueCampagne {
  total: number
  aLancer: number
  ecartes: number
  /** Par motif, dans l'ordre de `MOTIFS_ECART`, motifs à zéro omis. */
  parMotif: { motif: MotifEcart; n: number; label: string; rattrapable: boolean }[]
}

/**
 * Ce que l'onglet Lancement affiche avant qu'on clique.
 *
 * Rien ne part sans avoir été vu : c'est le garde-fou que le CRM connaît déjà
 * ailleurs (« un audit ne se valide que s'il est préparé »). Le décompte par
 * motif est ce qui transforme une revue en liste de gestes.
 */
export function revue(
  leads: readonly { faits: FaitsDuLead }[],
  cible: PublicVise,
): RevueCampagne {
  const compte = new Map<MotifEcart, number>()
  let aLancer = 0

  for (const lead of leads) {
    const motif = motifEcart(lead.faits, cible)
    if (!motif) aLancer += 1
    else compte.set(motif, (compte.get(motif) ?? 0) + 1)
  }

  const parMotif = MOTIFS_ECART.filter((m) => (compte.get(m) ?? 0) > 0).map((motif) => ({
    motif,
    n: compte.get(motif) ?? 0,
    label: MOTIF_ECART_LABEL[motif],
    rattrapable: ecartRattrapable(motif),
  }))

  return {
    total: leads.length,
    aLancer,
    ecartes: leads.length - aLancer,
    parMotif,
  }
}

// ── Ce qu'on vérifie AVANT de lancer ────────────────────────────────────────

/**
 * Un contrôle avant lancement.
 *
 * `bloquant` refuse le lancement ; `avertissement` le laisse passer en le
 * disant. La distinction n'est pas cosmétique : ce qui bloque doit être ce qui
 * abîme des prospects, jamais ce qui déplaît.
 */
export interface ControleLancement {
  code: string
  gravite: 'bloquant' | 'avertissement'
  message: string
  /** L'étape en cause, quand il y en a une. */
  etapeId?: string
}

/** Les étapes qui portent un message à écrire — une étape d'attente n'en a pas. */
const ETAPES_A_MESSAGE = new Set(['email', 'whatsapp', 'linkedin'])

/**
 * Ce qui empêche — ou devrait faire hésiter à — lancer cette campagne.
 *
 * CETTE FONCTION EXISTE À CAUSE DE 59 INSCRIPTIONS. Une attente-réponse sans
 * délai écrit `next_run_at = null` : l'inscription quitte la file du moteur et
 * PLUS RIEN ne la réveillera — ni un tick, ni une relance, ni un clic. 59
 * prospects ont dormi des semaines sans qu'aucun écran ne le montre, parce que
 * rien, nulle part, ne regardait cette ligne de définition avant de lancer.
 *
 * Le deuxième contrôle vient du même accident, par l'autre bout : poser un
 * délai rend atteignable l'étape de tronc suivante, écrite pour quelqu'un qui
 * VIENT DE RÉPONDRE. Dégeler sans avoir écrit la voie « sans réponse », c'est
 * envoyer « Très bien, je me suis permis de… » à des gens qui n'ont rien dit.
 *
 * Module pur : les étapes suffisent, la base n'a rien à dire ici.
 */
export function controlesAvantLancement(
  steps: readonly {
    id: string
    kind: string
    message?: string
    template?: string | null
    script?: string | null
    waitMode?: 'days' | 'reply'
    replyTimeoutDays?: number
    branch?: { waitId: string; on: string } | null
  }[],
  statut: string,
): ControleLancement[] {
  const controles: ControleLancement[] = []

  if (steps.length === 0) {
    controles.push({
      code: 'sequence_vide',
      gravite: 'bloquant',
      message: 'Cette campagne n’a aucune étape : rien ne partira. Elle sert à ranger des prospects, pas à les démarcher.',
    })
    return controles
  }

  // Le moteur gèle les inscriptions d'une séquence qui n'est pas `on`, avec le
  // motif `sequence_paused` (cf. `processSequenceEnrollment`). Lancer sans
  // l'activer, c'est donc inscrire tout le monde pour que personne ne bouge —
  // et l'écran dirait « lancée ».
  if (statut !== 'on') {
    controles.push({
      code: 'sequence_inactive',
      gravite: 'bloquant',
      message: 'La séquence n’est pas active : les inscriptions gèleraient aussitôt. Activez-la avant de lancer.',
    })
  }

  for (const step of steps) {
    if (ETAPES_A_MESSAGE.has(step.kind) && !(step.message ?? '').trim() && !step.template) {
      controles.push({
        code: 'message_vide',
        gravite: 'bloquant',
        etapeId: step.id,
        message: 'Une étape n’a aucun message : elle partirait vide.',
      })
    }

    if (step.kind !== 'wait' || step.waitMode !== 'reply') continue

    const delai = step.replyTimeoutDays ?? 0
    if (delai <= 0) {
      controles.push({
        code: 'attente_sans_delai',
        gravite: 'bloquant',
        etapeId: step.id,
        message:
          'L’attente de réponse n’a pas de limite : les inscriptions s’y gareront et plus rien ne les réveillera. Posez un délai (3 jours par défaut).',
      })
      continue
    }

    // Le délai est posé, mais personne n'a écrit ce qu'on dit à un silencieux :
    // il recevra les étapes du tronc, qui supposent une réponse.
    const aUneVoieSilence = steps.some((s) => s.branch?.waitId === step.id && s.branch.on === 'timeout')
    if (!aUneVoieSilence) {
      controles.push({
        code: 'voie_silence_vide',
        gravite: 'avertissement',
        etapeId: step.id,
        message:
          'Aucune étape n’est prévue pour ceux qui ne répondent pas : ils recevront la suite du tronc, écrite pour quelqu’un qui vient de répondre.',
      })
    }
  }

  return controles
}

/** Le lancement est-il permis ? Un seul contrôle bloquant suffit à le refuser. */
export const lancementPermis = (controles: readonly ControleLancement[]): boolean =>
  !controles.some((c) => c.gravite === 'bloquant')
