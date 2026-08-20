// conversation.ts — un lead, un fil. Pur, sans base ni React.
//
// POURQUOI CE MODULE EXISTE
// Le grief : « je ne vois pas les notes de Bilal », et « on reste cantonné à sa
// carte, sans vue d'ensemble ». La matière est là — `email_logs` porte l'e-mail,
// le WhatsApp et la note dans la même table depuis `20260722_message_channel` —
// mais aucun écran ne la lit comme UNE CONVERSATION : la fiche entreprise en
// montre un bout, le pipeline un autre, et personne ne voit l'ensemble.
//
// L'ARBITRAGE HONNÊTE, ÉCRIT AVANT LE CODE
// Une inbox e-mail résoudrait aujourd'hui 4 échanges sur 210. Les 177 WhatsApp
// partent par des `wa.me` ouverts à la main, et **aucun mécanisme ne captera
// jamais une réponse WhatsApp** sans l'API Business. Livrer une boîte vide en
// l'appelant « inbox unifiée » serait pire que ne rien livrer.
//
// Donc : LE FIL D'ABORD, LA RÉCEPTION APRÈS. Ce module assemble ce qu'on a
// déjà, et le seul transport entrant qui existe aujourd'hui est l'agent qui
// recopie ce qu'on lui a dit. C'est un geste qu'il fait déjà — dans un carnet,
// dans sa tête, dans un message à Matteo. Ici il le fait en un clic, daté, dans
// le fil.
//
// TROIS SENS, ET ILS NE SE DEVINENT PAS. `direction` est en base
// (`20260820_conversation.sql`) : `sortant` (nous avons écrit), `entrant` (le
// prospect a parlé), `interne` (note d'équipe). Une ligne sans auteur n'est pas
// « écrite par personne » — elle est écrite par le CRM, ou avant que la colonne
// existe. Les deux se disent, ils ne se confondent pas.

/* ── Le message ──────────────────────────────────────────────────────────── */

export type Sens = 'sortant' | 'entrant' | 'interne'

/** Une ligne du fil, telle que l'API la rend. */
export interface Message {
  id: string
  /** email · whatsapp · note */
  canal: string
  sens: Sens
  quand: string
  objet: string
  texte: string
  /** L'issue déclarée sur l'étape (vocabulaire `STEP_OUTCOMES`). */
  issue: string | null
  etapeId: string | null
  /** `null` = le CRM lui-même, ou une ligne écrite avant le 20/08/2026. */
  auteurId: string | null
  auteur: string | null
  /** Ce que Resend en a dit — `delivered`, `bounced`… `null` = non mesuré. */
  remise: string | null
  bloquePar: string | null
}

/** Un fil : un lead, tous canaux, dans l'ordre du temps. */
export interface Fil {
  entrepriseId: number
  entreprise: string
  ville: string | null
  cohorte: string | null
  contact: string | null
  messages: Message[]
  /** Le dernier message, quel qu'en soit le sens — ce qui date le fil. */
  dernier: Message | null
  /** Le dernier message ENTRANT. C'est lui qui décide de « à répondre ». */
  dernierEntrant: Message | null
  /** Le prospect a parlé et personne ne lui a répondu depuis. */
  aRepondre: boolean
  /** Combien de messages, par sens — jamais additionnés à l'écran. */
  compte: { sortant: number; entrant: number; interne: number }
}

const msDe = (m: Message): number => {
  const t = new Date(m.quand).getTime()
  // Sans date lisible, le message part en fin de fil plutôt que d'être perdu :
  // le voir mal placé vaut mieux que ne pas le voir.
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

/**
 * Assemble les fils à partir du journal brut.
 *
 * REGROUPÉ PAR ENTREPRISE, PAS PAR CONTACT. Chez les artisans, une entreprise
 * de trois personnes n'a qu'un interlocuteur, et 830 de nos 905 fiches n'ont
 * AUCUN contact nominatif : grouper par contact rendrait 830 fils vides et
 * perdrait tout le reste. Le contact, quand il existe, s'affiche dans le fil de
 * son entreprise.
 *
 * Les lignes SANS entreprise sont écartées — ce sont les 4 e-mails de
 * `scheduling` de juillet, qui n'appartiennent à aucun prospect. Les garder
 * fabriquerait un fil fantôme que personne ne saurait ouvrir.
 */
export function assemblerFils(
  lignes: readonly (Message & {
    entrepriseId: number | null
    entreprise: string
    ville: string | null
    cohorte: string | null
    contact: string | null
  })[],
): Fil[] {
  const par = new Map<number, Fil>()

  for (const l of lignes) {
    if (l.entrepriseId == null) continue
    let fil = par.get(l.entrepriseId)
    if (!fil) {
      fil = {
        entrepriseId: l.entrepriseId,
        entreprise: l.entreprise,
        ville: l.ville,
        cohorte: l.cohorte,
        contact: l.contact,
        messages: [],
        dernier: null,
        dernierEntrant: null,
        aRepondre: false,
        compte: { sortant: 0, entrant: 0, interne: 0 },
      }
      par.set(l.entrepriseId, fil)
    }
    // Le contact se renseigne dès qu'une ligne en porte un : les lignes d'une
    // même entreprise n'en portent pas toutes.
    if (!fil.contact && l.contact) fil.contact = l.contact
    fil.messages.push(l)
    fil.compte[l.sens] += 1
  }

  for (const fil of par.values()) {
    fil.messages.sort((a, b) => msDe(a) - msDe(b))
    fil.dernier = fil.messages[fil.messages.length - 1] ?? null
    fil.dernierEntrant = [...fil.messages].reverse().find((m) => m.sens === 'entrant') ?? null
    fil.aRepondre = estARepondre(fil)
  }

  // Le fil qui a bougé en dernier passe en tête : c'est l'ordre d'une messagerie,
  // et c'est celui dans lequel on travaille.
  return [...par.values()].sort((a, b) => msDe(b.dernier!) - msDe(a.dernier!))
}

/**
 * Ce fil attend-il une réponse de NOUS ?
 *
 * Le prospect a parlé, et rien de SORTANT n'est parti depuis. Une note interne
 * ne compte pas comme une réponse : écrire « rappeler en septembre » dans le
 * fil ne répond à personne — c'est même exactement le fil qu'on risque
 * d'oublier, puisqu'il a l'air d'avoir bougé.
 */
export function estARepondre(fil: Pick<Fil, 'messages'>): boolean {
  const dernierEntrant = [...fil.messages].reverse().find((m) => m.sens === 'entrant')
  if (!dernierEntrant) return false
  const t = new Date(dernierEntrant.quand).getTime()
  return !fil.messages.some(
    (m) => m.sens === 'sortant' && new Date(m.quand).getTime() > t,
  )
}

/* ── Les filtres du volet de gauche ──────────────────────────────────────── */

export const FILTRES_FIL = ['tous', 'a_repondre', 'ont_parle', 'jamais_parle'] as const
export type FiltreFil = (typeof FILTRES_FIL)[number]

export const FILTRE_FIL_LABEL: Record<FiltreFil, string> = {
  tous: 'Tous',
  a_repondre: 'À répondre',
  ont_parle: 'Ont parlé',
  jamais_parle: 'Sans réponse',
}

export function filtrerFils(fils: readonly Fil[], filtre: FiltreFil, recherche = ''): Fil[] {
  const q = recherche
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

  return fils.filter((f) => {
    if (q) {
      const cible = `${f.entreprise} ${f.ville ?? ''} ${f.contact ?? ''}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
      if (!cible.includes(q)) return false
    }
    if (filtre === 'a_repondre') return f.aRepondre
    if (filtre === 'ont_parle') return f.compte.entrant > 0
    if (filtre === 'jamais_parle') return f.compte.entrant === 0
    return true
  })
}

/**
 * Combien de fils par filtre.
 *
 * CE SONT DES VUES, PAS DES SIGNAUX ADDITIONNÉS. « À répondre » est un
 * sous-ensemble d'« Ont parlé » : les additionner compterait deux fois le même
 * prospect — le grief n° 2, encore, et il vaut ici comme ailleurs.
 */
export function compterFils(fils: readonly Fil[]): Record<FiltreFil, number> {
  return {
    tous: fils.length,
    a_repondre: fils.filter((f) => f.aRepondre).length,
    ont_parle: fils.filter((f) => f.compte.entrant > 0).length,
    jamais_parle: fils.filter((f) => f.compte.entrant === 0).length,
  }
}

/* ── Ce qu'on affiche sur une ligne ──────────────────────────────────────── */

export const CANAL_LABEL: Record<string, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  note: 'Note',
  call: 'Appel',
  linkedin: 'LinkedIn',
}

/**
 * Qui a écrit, en français.
 *
 * `null` n'est PAS « personne ». C'est soit le CRM (une relance automatique,
 * une note de cron), soit une ligne écrite avant que la colonne existe. Le
 * distinguer d'un auteur connu est la moitié de la réponse au grief : dire « on
 * ne sait pas » est une information, dire « personne » est un mensonge.
 */
export function libelleAuteur(m: Message, avantLaColonne: string = '2026-08-20'): string {
  if (m.auteur) return m.auteur
  const t = new Date(m.quand).getTime()
  const seuil = new Date(`${avantLaColonne}T00:00:00Z`).getTime()
  if (Number.isFinite(t) && t < seuil) return 'auteur non enregistré'
  return 'le CRM'
}

/** L'aperçu d'un fil dans la liste — la dernière chose dite, tronquée. */
export function apercu(fil: Fil, max = 90): string {
  const m = fil.dernier
  if (!m) return ''
  const brut = (m.texte || m.objet || '').replace(/\s+/g, ' ').trim()
  return brut.length > max ? `${brut.slice(0, max - 1)}…` : brut
}
