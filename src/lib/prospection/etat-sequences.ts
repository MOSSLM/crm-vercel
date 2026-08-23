// etat-sequences.ts — où en sont les inscrits, bloc par bloc.
//
// LE MANQUE, DIT PAR MATTEO : « ce qui manque c'est vraiment une vue concrète
// sur ce qu'il se passe dans les séquences, où on en est ». Le CRM savait dire
// la performance d'une séquence (envoyés, ouvertures, réponses) et la position
// d'UN prospect dans sa frise. Entre les deux, personne ne pouvait répondre à
// « combien de gens sont garés sur l'étape 6, et depuis quand ».
//
// CE QUE CE MODULE COMPTE, ET POURQUOI CES QUATRE-LÀ. Sur une étape donnée,
// une inscription est dans exactement UN de ces états :
//   · `taches`      — un humain a quelque chose à faire, c'est dans sa file ;
//   · `programmes`  — l'horloge s'en charge (`next_run_at` ou `send_at` posé) ;
//   · `garees`      — NI l'un NI l'autre. Rien ne la fera bouger, jamais.
//   · `sorties`     — elle a quitté la séquence sur cette étape.
// La troisième est la seule qui compte vraiment, et c'est celle qu'aucun écran
// ne montrait. Mesuré le 23/08/2026 en production : 524 inscriptions garées sur
// l'étape 0 de « S1 — Premier contact », toutes avec `hold_reason` =
// `sequence_paused` alors que la séquence est repassée `on`. Le sélecteur du
// ticker exige `next_run_at is not null` (`regulator-db.ts`) : sans date, aucun
// tick ne les reprend. Elles n'attendent rien, elles sont perdues.
//
// LE COMPTE NE MENT PAS PAR OMISSION. Une définition qu'on raccourcit laisse
// des inscriptions sur un index qui n'existe plus. Elles ne disparaissent pas
// du total : elles vont dans `horsPlan`, avec leur numéro d'étape.
//
// PUR, DONC TESTABLE SANS BASE. La route pose les requêtes et passe les lignes ;
// toute l'arithmétique est ici. C'est l'idiome du dépôt (`etages.ts`,
// `annulation.ts`) et c'est ce qui rend l'écran incapable d'afficher autre
// chose que ce qui a été mesuré.
import {
  natureDuBlocage,
  type HoldReason,
  type NatureDuBlocage,
} from '@/lib/automations/regulator'

/** Une étape, telle que la définition de la séquence la porte. */
export interface EtapeBrute {
  id: string
  kind: string
  day?: number | null
  label?: string | null
}

export interface SequenceBrute {
  id: string
  name?: string | null
  status?: string | null
  steps: EtapeBrute[]
}

export interface InscriptionBrute {
  id: string
  automation_id: string | null
  current_step: number | null
  status: string | null
  next_run_at?: string | null
  send_at?: string | null
  hold_reason?: string | null
  entered_at?: string | null
  updated_at?: string | null
}

export interface TacheBrute {
  enrollment_id: string | null
  status: string | null
  due_at?: string | null
  kind?: string | null
}

/** L'état d'un bloc de la séquence : ce qui s'y trouve, maintenant. */
export interface BlocEtat {
  /** Index 0-based — exactement `sequence_enrollments.current_step`. */
  index: number
  id: string
  kind: string
  label: string
  jour: number
  /** Inscriptions actives arrêtées sur ce bloc, tous états confondus. */
  inscrits: number
  /** Celles qui portent une tâche ouverte : quelqu'un doit agir. */
  taches: number
  /** Dont l'échéance est passée. */
  enRetard: number
  /** Tâches reportées à plus tard — ni en retard, ni oubliées. */
  reportees: number
  /** Celles que l'horloge reprendra (`next_run_at` ou `send_at`). */
  programmes: number
  /** Ni tâche ni horloge : rien ne les fera bouger. */
  garees: number
  /** La date la plus proche à laquelle quelque chose repartira seul. */
  prochain: string | null
  /** Les motifs de blocage rencontrés ici, du plus fréquent au plus rare. */
  motifs: MotifCompte[]
}

export interface MotifCompte {
  motif: string
  nature: NatureDuBlocage
  n: number
}

export interface EtatSequence {
  id: string
  nom: string
  statut: string
  blocs: BlocEtat[]
  /** Inscriptions actives, tous blocs confondus. */
  actives: number
  taches: number
  enRetard: number
  garees: number
  programmes: number
  termines: number
  sorties: number
  /**
   * Actives dont l'étape courante n'existe plus dans la définition. Jamais
   * fondues dans un autre compte : c'est une incohérence, pas un état.
   */
  horsPlan: number
  /** Le premier départ programmé de toute la séquence. */
  prochain: string | null
}

const ETIQUETTE_KIND: Record<string, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  linkedin: 'LinkedIn',
  call: 'Appel',
  wait: 'Attente',
  // Les deux blocs de structure. `channelOf` les rendrait « Tâche », ce qui
  // ferait croire à un geste humain là où il n'y a qu'un aiguillage.
  condition: 'Condition',
  transition: 'Aiguillage',
}

/** Le libellé d'un bloc : celui qu'on a écrit, sinon celui de sa nature. */
export function libelleBloc(etape: EtapeBrute): string {
  const propre = etape.label?.trim()
  if (propre) return propre
  return ETIQUETTE_KIND[etape.kind] ?? 'Étape'
}

/** Ces blocs n'attendent personne : ils se franchissent en une fraction de tick. */
export const BLOCS_DE_STRUCTURE: readonly string[] = ['condition', 'transition'] as const

const OUVERTES: readonly string[] = ['pending', 'snoozed'] as const

const plusTot = (a: string | null, b: string | null): string | null => {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) <= Date.parse(b) ? a : b
}

/**
 * L'état de chaque séquence, bloc par bloc.
 *
 * `maintenant` est passé plutôt que lu : un compte de retards qui dépend de
 * l'horloge de la machine n'est pas reproductible, et ces chiffres finissent
 * dans un écran qu'on compare d'un jour sur l'autre.
 */
export function etatDesSequences({
  sequences,
  inscriptions,
  taches,
  maintenant = new Date(),
}: {
  sequences: SequenceBrute[]
  inscriptions: InscriptionBrute[]
  taches: TacheBrute[]
  maintenant?: Date
}): EtatSequence[] {
  const nowMs = maintenant.getTime()

  // Les tâches ouvertes, rangées par inscription. Une inscription peut en
  // porter plusieurs (une relance semée pendant qu'une autre traîne) : on garde
  // la plus urgente pour décider du retard, et le compte reste celui des
  // INSCRIPTIONS, pas des tâches — sinon un bloc afficherait plus d'occupants
  // qu'il n'en a.
  const ouvertesPar = new Map<string, TacheBrute[]>()
  for (const t of taches) {
    if (!t.enrollment_id || !OUVERTES.includes(t.status ?? '')) continue
    const liste = ouvertesPar.get(t.enrollment_id)
    if (liste) liste.push(t)
    else ouvertesPar.set(t.enrollment_id, [t])
  }

  const parSequence = new Map<string, InscriptionBrute[]>()
  for (const i of inscriptions) {
    if (!i.automation_id) continue
    const liste = parSequence.get(i.automation_id)
    if (liste) liste.push(i)
    else parSequence.set(i.automation_id, [i])
  }

  return sequences.map((seq) => {
    const lignes = parSequence.get(seq.id) ?? []
    const blocs: BlocEtat[] = seq.steps.map((etape, index) => ({
      index,
      id: etape.id,
      kind: etape.kind,
      label: libelleBloc(etape),
      jour: Number(etape.day) || 0,
      inscrits: 0,
      taches: 0,
      enRetard: 0,
      reportees: 0,
      programmes: 0,
      garees: 0,
      prochain: null,
      motifs: [],
    }))

    // Les motifs se comptent d'abord dans une table par bloc : on ne peut les
    // trier qu'une fois tout le monde passé.
    const motifsParBloc = blocs.map(() => new Map<string, number>())

    const etat: EtatSequence = {
      id: seq.id,
      nom: seq.name?.trim() || 'Séquence',
      statut: seq.status ?? 'off',
      blocs,
      actives: 0,
      taches: 0,
      enRetard: 0,
      garees: 0,
      programmes: 0,
      termines: 0,
      sorties: 0,
      horsPlan: 0,
      prochain: null,
    }

    for (const ligne of lignes) {
      if (ligne.status === 'finished') {
        etat.termines++
        continue
      }
      if (ligne.status !== 'active') {
        etat.sorties++
        continue
      }
      etat.actives++

      const index = Number(ligne.current_step)
      const bloc = Number.isInteger(index) ? blocs[index] : undefined
      if (!bloc) {
        etat.horsPlan++
        continue
      }
      bloc.inscrits++

      const ouvertes = ouvertesPar.get(ligne.id) ?? []
      const horloge = ligne.next_run_at ?? ligne.send_at ?? null

      if (ouvertes.length > 0) {
        bloc.taches++
        etat.taches++
        // EN RETARD SE DÉCIDE SUR LA PLUS URGENTE, et « reportée » ne compte
        // que si AUCUNE des tâches n'est due : une inscription qui traîne une
        // tâche en retard n'est pas une inscription reportée.
        const enRetard = ouvertes.some((t) => t.due_at != null && Date.parse(t.due_at) < nowMs)
        if (enRetard) {
          bloc.enRetard++
          etat.enRetard++
        } else if (ouvertes.every((t) => t.status === 'snoozed')) {
          bloc.reportees++
        }
      } else if (horloge) {
        bloc.programmes++
        etat.programmes++
        bloc.prochain = plusTot(bloc.prochain, horloge)
        etat.prochain = plusTot(etat.prochain, horloge)
      } else {
        bloc.garees++
        etat.garees++
      }

      // Le motif se relève dans tous les cas où il y en a un : une inscription
      // programmée qui porte `daily_cap` explique pourquoi elle est loin.
      if (ligne.hold_reason) {
        const table = motifsParBloc[index]
        table.set(ligne.hold_reason, (table.get(ligne.hold_reason) ?? 0) + 1)
      }
    }

    blocs.forEach((bloc, i) => {
      bloc.motifs = [...motifsParBloc[i].entries()]
        .map(([motif, n]) => ({
          motif,
          nature: natureDuBlocage(motif as HoldReason, null),
          n,
        }))
        .sort((a, b) => b.n - a.n || a.motif.localeCompare(b.motif))
    })

    return etat
  })
}
