// hors-scenario.ts — quand le prospect sort du scénario par le haut.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE CAS QUI L'A FAIT ÉCRIRE, LE 29/08/2026
// ─────────────────────────────────────────────────────────────────────────────
// Azur Climat Froid. L'accroche WhatsApp part à 11h37. Le gérant RAPPELLE dans
// la foulée — il croit avoir affaire à un client. Bilal lui explique, il répond
// qu'il refait déjà son site avec quelqu'un mais qu'on peut lui envoyer la démo.
// Bilal envoie la démo ET la plaquette. Le gérant les ouvre.
//
// Le CRM, lui, n'a vu qu'une chose : un message sortant à 11h37. Pas l'appel,
// pas la démo, pas la plaquette, pas l'objection. `replied` est resté à `false`.
// Et à 13h22, quand la tâche d'accroche a été bouclée, le moteur a pris la
// seule voie qu'il connaissait — celle du SILENCE — et posé dans la file une
// relance « je me permets de revenir vers vous […] si ce n'est pas le bon
// moment, dites-le moi et je n'insiste pas ». À un homme qui venait d'appeler.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE LE SCÉNARIO NE SAIT PAS FAIRE, ET POURQUOI CE N'EST PAS UN BUG
// ─────────────────────────────────────────────────────────────────────────────
// Une séquence pousse : elle envoie, elle attend, elle relance. Elle est écrite
// pour un prospect qui subit le démarchage. Celui qui DÉCROCHE SON TÉLÉPHONE
// inverse le rapport — il n'est plus dans le scénario, il est devant nous.
//
// Aucune issue d'étape ne dit ça. « A répondu » libère une attente sur le canal
// où l'on écrivait ; ici la réponse est arrivée par un AUTRE canal, avant même
// que l'attente existe, et elle s'est accompagnée d'envois que personne n'a
// journalisés parce qu'ils ne venaient d'aucune étape.
//
// D'où ce module : une porte de sortie qui RAMASSE TOUT — ce qu'il a dit, ce
// qu'on lui a donné pendant l'échange — et qui le repose dans une séquence
// écrite pour lui (« S4 — Il a rappelé »), au lieu de le laisser sur un rail
// qui va le relancer d'un silence qui n'a pas eu lieu.
//
// ─────────────────────────────────────────────────────────────────────────────
// ON INSCRIT D'ABORD, ON SORT ENSUITE. JAMAIS L'INVERSE.
// ─────────────────────────────────────────────────────────────────────────────
// C'est la règle de `processTransitionStep`, et elle est recopiée ici parce
// qu'elle vaut pour tout changement de séquence, humain ou non : sortir sans
// avoir ouvert en face fait disparaître le prospect de tous les écrans à la
// fois. Un prospect sans inscription vivante n'est dans aucune file, dans aucun
// tableau, et rien ne le signale — il faut le chercher pour savoir qu'il manque.
//
// Ce module ne va PAS chercher le contexte lui-même (tâche, entreprise, droits) :
// c'est le travail de la route, qui pose le mur du périmètre. Ici, la mécanique
// seulement, pour qu'elle soit éprouvable et réutilisable par un autre geste.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Automation } from '@/components/automations/types'
import { enrollInSequence, sortirDeSequence } from '@/lib/automations/engine'
import { readTransitions } from '@/lib/automations/week'

/**
 * « S4 — Il a rappelé » — la séquence de repli, posée par
 * `sql/20260829_sequence_il_a_rappele.sql`.
 *
 * L'identifiant est FIXE et écrit ici plutôt que cherché par son nom : un
 * renommage dans l'écran des séquences ne doit pas casser le bouton. Il suit la
 * série des trois autres (`…0001` à `…0003`).
 */
export const SEQUENCE_IL_A_RAPPELE = '0e7a1f30-0000-4000-8000-000000000004'

/** Ce qui s'est réellement passé, pour que l'écran le dise sans le deviner. */
export interface Bascule {
  /** L'inscription ouverte dans la séquence cible, ou celle qui existait déjà. */
  enrollmentId: string | null
  /** Vrai s'il y était déjà : le geste n'a rien ouvert, et ce n'est pas un échec. */
  dejaInscrit: boolean
  /** L'inscription quittée, s'il y en avait une. */
  sortieDe: string | null
  /**
   * Pourquoi rien ne s'est ouvert, quand rien ne s'est ouvert. `null` = tout va
   * bien. Un motif ici veut dire que l'ancienne inscription a été LAISSÉE EN
   * PLACE — c'est délibéré, cf. l'en-tête.
   */
  refus: string | null
}

/**
 * Fait passer un prospect d'une séquence à une autre, sur décision humaine.
 *
 * `enrollmentId` est facultatif : un prospect appelé à froid, ou dont la
 * séquence est déjà close, n'en a pas. Il entre alors dans la cible sans que
 * rien n'ait à être quitté — c'est le cas « de n'importe quelle fiche ».
 */
export async function basculerVersSequence(
  sb: SupabaseClient,
  cible: string,
  ctx: {
    entrepriseId: number | null
    contactId: string | null
    opportuniteId: string | null
    /** L'inscription en cours, à quitter une fois la cible ouverte. */
    enrollmentId?: string | null
    /** Qui a décidé — la bascule est un geste, elle porte son auteur. */
    userId?: string | null
  },
): Promise<Bascule> {
  const vide: Bascule = { enrollmentId: null, dejaInscrit: false, sortieDe: null, refus: null }

  const { data: autoRow } = await sb.from('automations').select('*').eq('id', cible).maybeSingle()
  const destination = autoRow as Automation | null
  if (!destination || destination.kind !== 'sequence') {
    return { ...vide, refus: 'sequence_introuvable' }
  }
  // ⚠️ ON N'EXIGE PAS QUE LA CIBLE SOIT `on`, pour la même raison que le
  // passage de relais : une séquence en pause gèle ses inscriptions avec un
  // motif visible (`sequence_paused`) plutôt que de les perdre. Refuser ferait
  // disparaître le prospect au moment précis où il vient de nous parler.

  // L'inscription quittée porte la chaîne des séquences déjà traversées. La
  // transmettre est ce qui empêche le garde-fou de boucle de repartir de zéro
  // à chaque saut — un aller-retour S1 → S4 → S1 doit se compter.
  let chaine: string[] = []
  let ancienne: { id: string; automation_id: string } | null = null
  if (ctx.enrollmentId) {
    const { data } = await sb
      .from('sequence_enrollments')
      .select('id, automation_id, vars')
      .eq('id', ctx.enrollmentId)
      .maybeSingle()
    if (data) {
      ancienne = { id: data.id as string, automation_id: data.automation_id as string }
      chaine = readTransitions(data.vars)
    }
  }

  const { enrolled, enrollmentId } = await enrollInSequence(
    destination,
    {
      contact_id: ctx.contactId,
      entreprise_id: ctx.entrepriseId,
      opportunite_id: ctx.opportuniteId,
      event: 'hors_scenario',
    },
    {
      createdBy: ctx.userId ?? null,
      vars: ancienne ? { transitions: [...chaine, ancienne.automation_id] } : {},
    },
  )

  // Ni canal, ni fiche : `enrollInSequence` a refusé. On ne quitte rien.
  if (!enrolled && !enrollmentId) return { ...vide, refus: 'aucun_canal' }

  if (ancienne) await sortirDeSequence(sb, ancienne.id, 'transfert')

  return {
    enrollmentId: enrollmentId ?? null,
    dejaInscrit: !enrolled,
    sortieDe: ancienne?.id ?? null,
    refus: null,
  }
}

/* ── Ce qu'on lui a donné pendant l'échange ──────────────────────────────── */

/**
 * Les pièces qu'un agent peut avoir envoyées de sa main pendant la
 * conversation, et qui ne viennent d'aucune étape.
 *
 * POURQUOI CETTE LISTE EST COURTE ET FERMÉE. Ce ne sont pas « des pièces
 * jointes » au sens large : ce sont les trois liens à jeton que le CRM SAIT
 * MESURER (la démo par GA4, le rapport et la plaquette par leur compteur de
 * vues). Journaliser un envoi qu'on ne saura jamais relier à une ouverture
 * remplirait le fil sans rien apprendre.
 */
export const PIECES = ['demo', 'plaquette', 'audit'] as const
export type Piece = (typeof PIECES)[number]

export const PIECE_LABEL: Record<Piece, string> = {
  demo: 'Site démo',
  plaquette: 'Plaquette',
  audit: 'Rapport d’audit',
}

/**
 * Le texte journalisé pour une pièce envoyée à la main.
 *
 * L'URL est DANS le corps, pas seulement dans un champ : le fil se relit comme
 * une conversation, et « plaquette envoyée » sans le lien oblige à aller
 * chercher ailleurs de quelle version on parlait.
 */
export const ligneDePiece = (piece: Piece, url: string): string =>
  `${PIECE_LABEL[piece]} envoyé pendant l’échange :\n${url}`
