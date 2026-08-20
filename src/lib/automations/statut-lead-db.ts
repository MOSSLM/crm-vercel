// statut-lead-db.ts — aller chercher ce que `statut-lead.ts` sait juger.
//
// MÊME DÉCOUPAGE QUE PARTOUT : `regulator.ts`/`regulator-db.ts`,
// `conditions.ts`/`conditions-db.ts`. Le module pur ne touche ni base ni
// horloge, donc il est éprouvable ; celui-ci ne décide rien, il relève.
//
// UNE PAGE, PAS UNE LISTE. Une campagne peut compter dix mille leads ; l'écran
// n'en montre jamais cinquante. Toutes les lectures d'ici sont donc bornées aux
// entreprises de la page en cours, en cinq requêtes parallèles — le même
// compromis que la route des leads a déjà pris pour les fiches d'entreprise.
//
// CE QU'ON NE MESURE PAS, ON NE L'INVENTE PAS. Trois champs de `FaitsEngagement`
// restent vides aujourd'hui, et c'est exact plutôt que pessimiste :
//
//   · `remis` — `email_logs.delivery_status` est NUL sur les 210 lignes. Le
//     webhook Resend existe mais n'a jamais eu d'envoi à qualifier : 4 e-mails
//     sont partis, tous en juillet, avant qu'il ne soit branché.
//   · `rebond` — même colonne, même conclusion. Une seule suppression existe.
//   · l'ouverture — volontairement absente : ni pixel, ni réécriture de liens.
//     Ce qui la remplace est `vuesLiens`, compté côté serveur sur les jetons.
//
// Un lead sans aucun de ces signaux ressort `non_mesure`, pas « pas ouvert ».

import type { SupabaseClient } from '@supabase/supabase-js'
import { readReplies } from '@/lib/automations/week'
import { holdReasonLabel, type HoldReason } from '@/lib/automations/regulator'
import {
  engagementDuLead,
  etageDuLead,
  estMesure,
  progressionDuLead,
  type Engagement,
  type Etage,
  type Progression,
} from '@/lib/automations/statut-lead'
import type { MotifEcart, StatutListe } from '@/lib/automations/campagne'

/** Une ligne de liste, telle que la route la connaît déjà. */
export interface LigneAJuger {
  entrepriseId: number
  statutListe: StatutListe
  motifEcart: MotifEcart | null
  /** Pour la seule vérification qui se fait par adresse : le désabonnement. */
  email?: string | null
}

export interface StatutReleve {
  progression: Progression
  engagement: Engagement
  etage: Etage
  /** Faux quand rien n'a jamais été mesuré — à afficher autrement qu'un zéro. */
  mesure: boolean
  /**
   * POURQUOI c'est gelé, en français. Nul quand rien ne bloque.
   *
   * « Gelé » tout court est un mot qui accuse sans instruire, et il mélange
   * deux situations qui n'ont rien à voir : une attente qui se terminera d'
   * elle-même dans trois jours, et une attente que rien ne réveillera jamais.
   * Relevé le 20/08 sur la seule séquence active : 93 inscriptions portent
   * `awaiting_reply`, dont **34 ont une date de relance** et 59 n'en ont pas.
   * Les peindre du même rouge, c'est refaire à l'écran l'erreur qui a laissé
   * ces 59 dormir des semaines.
   */
  motif: string | null
}

/** Toutes les lignes d'une table, groupées par entreprise. */
function grouper<T extends { entreprise_id: number | null }>(lignes: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const l of lignes) {
    if (l.entreprise_id == null) continue
    const k = Number(l.entreprise_id)
    const liste = m.get(k)
    if (liste) liste.push(l)
    else m.set(k, [l])
  }
  return m
}

type LigneInscription = {
  entreprise_id: number | null
  status: string
  hold_reason: string | null
  next_run_at: string | null
  vars: unknown
  entered_at: string | null
}

/**
 * L'inscription qui compte, quand il y en a plusieurs.
 *
 * Une entreprise peut avoir été inscrite deux fois à la même séquence — une
 * sortie, puis une reprise. C'est la VIVANTE qui décrit où on en est ; à
 * défaut, la plus récente. Prendre la première venue ferait afficher
 * « terminé » à quelqu'un qui reçoit un message ce matin.
 */
function inscriptionRetenue(lignes: LigneInscription[]): LigneInscription | null {
  if (lignes.length === 0) return null
  const parDate = [...lignes].sort((a, b) => (b.entered_at ?? '').localeCompare(a.entered_at ?? ''))
  return parDate.find((l) => l.status === 'active') ?? parDate.find((l) => l.status === 'paused') ?? parDate[0]
}

/**
 * La phrase qui dit pourquoi c'est gelé — et si ça se débloquera tout seul.
 *
 * Le cas SANS MOTIF est le plus traître : ni `hold_reason`, ni `next_run_at`,
 * ni tâche. L'inscription n'est retenue par rien et n'est attendue nulle part ;
 * aucun écran ne pouvait la montrer, parce qu'elle ne portait aucun mot à
 * afficher. Il y en a exactement une aujourd'hui. C'est elle qu'il faut nommer,
 * pas taire.
 */
function motifDuGel(insc: LigneInscription | null, tachesEnAttente: number): string {
  if (!insc) return 'gelé'
  if (insc.hold_reason) {
    const at = insc.next_run_at ? Date.parse(insc.next_run_at) : null
    return holdReasonLabel(insc.hold_reason as HoldReason, Number.isFinite(at) ? at : null) || insc.hold_reason
  }
  if (!insc.next_run_at && tachesEnAttente === 0) {
    return 'enlisée — aucun motif, aucune relance, aucune tâche'
  }
  return 'gelé'
}

/**
 * Les deux axes de chaque lead d'une page, en cinq lectures.
 *
 * Rend une `Map` vide plutôt qu'une exception si la page est vide : l'appelant
 * a déjà de quoi afficher la liste, et un statut manquant se dégrade en
 * « non mesuré », pas en écran blanc.
 */
export async function releverLesStatuts(
  sb: SupabaseClient,
  automationId: string,
  lignes: readonly LigneAJuger[],
): Promise<Map<number, StatutReleve>> {
  const out = new Map<number, StatutReleve>()
  if (lignes.length === 0) return out

  const ids = [...new Set(lignes.map((l) => l.entrepriseId))]
  const emails = [...new Set(lignes.map((l) => l.email?.trim().toLowerCase()).filter((e): e is string => !!e))]

  const [inscriptions, taches, journal, jetons, suppressions] = await Promise.all([
    sb
      .from('sequence_enrollments')
      .select('entreprise_id, status, hold_reason, next_run_at, vars, entered_at')
      .eq('automation_id', automationId)
      .in('entreprise_id', ids),
    // `snoozed` compte comme une attente : la tâche existe, elle est reportée.
    // Sans elle, une inscription qui attend un rappel dans trois jours
    // s'afficherait « gelée », ce qui est le mot qu'on réserve aux impasses.
    sb
      .from('prospection_tasks')
      .select('entreprise_id')
      .in('entreprise_id', ids)
      .in('status', ['pending', 'snoozed']),
    sb
      .from('email_logs')
      .select('entreprise_id, status, outcome, direction, delivery_status, bounce_type')
      .in('entreprise_id', ids),
    sb.from('entreprises_rapport_public').select('entreprise_id, vues, plaquette_vues').in('entreprise_id', ids),
    emails.length ? sb.from('email_suppressions').select('email').in('email', emails) : Promise.resolve({ data: [] }),
  ])

  const parInscription = grouper((inscriptions.data ?? []) as LigneInscription[])
  const parTache = grouper((taches.data ?? []) as { entreprise_id: number | null }[])
  const parJournal = grouper(
    (journal.data ?? []) as {
      entreprise_id: number | null
      status: string | null
      outcome: string | null
      direction: string | null
      delivery_status: string | null
      bounce_type: string | null
    }[],
  )
  const parJeton = grouper(
    (jetons.data ?? []) as { entreprise_id: number | null; vues: number | null; plaquette_vues: number | null }[],
  )
  const desabonnes = new Set(
    ((suppressions.data ?? []) as { email: string | null }[])
      .map((s) => s.email?.trim().toLowerCase())
      .filter((e): e is string => !!e),
  )

  for (const ligne of lignes) {
    const insc = inscriptionRetenue(parInscription.get(ligne.entrepriseId) ?? [])
    const tachesEnAttente = (parTache.get(ligne.entrepriseId) ?? []).length
    const progression = progressionDuLead({
      statutListe: ligne.statutListe,
      motifEcart: ligne.motifEcart,
      inscription: insc
        ? { status: insc.status, holdReason: insc.hold_reason, nextRunAt: insc.next_run_at }
        : null,
      tachesEnAttente,
    })

    const lignesJournal = parJournal.get(ligne.entrepriseId) ?? []
    const jeton = (parJeton.get(ligne.entrepriseId) ?? [])[0]
    const replies = insc ? readReplies(insc.vars) : {}
    const engagement = engagementDuLead({
      // Une note interne n'est pas un envoi : c'est ce que la colonne
      // `direction` a été ajoutée pour distinguer.
      envois: lignesJournal.filter((l) => l.direction !== 'interne').length,
      remis: lignesJournal.some((l) => l.delivery_status === 'delivered'),
      rebond: lignesJournal.some((l) => l.bounce_type != null || l.delivery_status === 'bounced'),
      echecEnvoi: lignesJournal.some((l) => l.status === 'failed' || l.status === 'error'),
      vuesLiens: (jeton?.vues ?? 0) + (jeton?.plaquette_vues ?? 0),
      aRepondu: Object.values(replies).some(Boolean),
      issues: lignesJournal.map((l) => l.outcome).filter((o): o is string => !!o),
      desabonne: ligne.email ? desabonnes.has(ligne.email.trim().toLowerCase()) : false,
    })

    out.set(ligne.entrepriseId, {
      progression,
      engagement,
      etage: etageDuLead(progression, engagement),
      mesure: estMesure(engagement),
      motif: progression === 'gele' ? motifDuGel(insc, tachesEnAttente) : null,
    })
  }

  return out
}
