// Ce que toutes les routes de campagne partagent : charger la campagne, savoir
// qui elle vise, et dire proprement qu'une migration manque.
//
// UNE CAMPAGNE EST UNE AUTOMATION, PAS UNE NOUVELLE TABLE. C'est la décision
// structurante de cette couche : `automations` porte déjà le pipeline, l'étape
// de reprise, les accès, les plages d'envoi, le plafond et la priorité de file.
// Une table `campagnes` en 1-1 aurait obligé six lecteurs déjà écrits
// (`_board.ts`, `week/_view.ts`, `regulator-db.ts`, `stats/_view.ts`,
// `sequence_agent_assignments`, `/api/agent/sequences`) à apprendre une clé de
// plus. Il ne manquait qu'une chose à une séquence pour être une campagne : sa
// LISTE. C'est elle, et elle seule, qu'on a ajoutée (`campagne_leads`).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Automation, SequenceDefinition, SequenceStep } from '@/components/automations/types'
import type { PublicVise } from '@/lib/prospects/canal'

/** La migration qui porte la liste — nommée dans l'erreur, pas devinée. */
export const MIGRATION_LISTE = 'sql/20260819_campagne_leads.sql'
/** Celle qui porte le décompte de l'écran de liste. */
export const MIGRATION_COMPTE = 'sql/20260819_campagne_leads_compte.sql'

/** Une table ou une vue absente n'est pas une panne : c'est une migration non jouée. */
export const migrationAbsente = (erreur: { code?: string; message?: string } | null): boolean =>
  erreur?.code === '42P01' ||
  erreur?.code === 'PGRST205' ||
  /campagne_leads/i.test(erreur?.message ?? '')

export const MAX_AJOUT = 500

/** La campagne telle que les routes la manipulent : l'automation, plus ce qu'on en déduit. */
export interface Campagne {
  automation: Automation
  /** Les étapes, toujours un tableau — une séquence vide est une campagne sans envoi. */
  steps: SequenceStep[]
  /** Le public visé, lu dans les réglages de la séquence. */
  cible: PublicVise
  /** D'où vient la liste, quand elle a été posée depuis un segment ou un lot. */
  audience: Audience | null
}

/**
 * L'origine déclarée de la liste, rangée dans `automations.settings.audience`.
 *
 * En jsonb dans un champ qui existe déjà : aucune migration de schéma pour ce
 * qui n'est qu'une trace. Ce qui compte — qui est dans la liste — vit dans
 * `campagne_leads`, jamais ici.
 */
export interface Audience {
  type: 'segment' | 'lot' | 'explorateur' | 'manuel' | 'reprise'
  segmentId?: string | null
  lotId?: string | null
  dernierRafraichissement?: string | null
}

/** Le public visé d'une séquence : ses réglages, rien de plus. */
export function cibleDe(automation: Automation): PublicVise {
  const s = automation.settings ?? {}
  return { requireCanaux: s.requireCanaux ?? null, excludeCanaux: s.excludeCanaux ?? null }
}

/** Charge une campagne par son identifiant. `null` quand elle n'existe pas ou n'est pas une séquence. */
export async function chargerCampagne(sb: SupabaseClient, id: string): Promise<Campagne | null> {
  const { data } = await sb.from('automations').select('*').eq('id', id).maybeSingle()
  const automation = data as Automation | null
  if (!automation || automation.kind !== 'sequence') return null

  const def = (automation.definition as SequenceDefinition | null) ?? { steps: [] }
  const settings = (automation.settings ?? {}) as { audience?: Audience }
  return {
    automation,
    steps: Array.isArray(def.steps) ? def.steps : [],
    cible: cibleDe(automation),
    audience: settings.audience ?? null,
  }
}

/** Écrit l'origine de la liste sans toucher au reste des réglages. */
export async function noterAudience(
  sb: SupabaseClient,
  automation: Automation,
  audience: Audience,
): Promise<void> {
  const settings = { ...(automation.settings ?? {}), audience }
  await sb.from('automations').update({ settings }).eq('id', automation.id)
}

// ── Corps de requête ────────────────────────────────────────────────────────

/**
 * Ajouter des leads. La source dit d'où ils viennent ET comment on les résout :
 * un segment se rejoue, un lot se lit, une sélection arrive telle quelle.
 */
export const ajoutLeadsSchema = z
  .object({
    origine: z.enum(['segment', 'lot', 'explorateur', 'manuel', 'reprise']),
    /** Pour `explorateur` et `manuel` : la sélection, en clair. */
    entreprise_ids: z.array(z.number().int().positive()).max(MAX_AJOUT).optional(),
    /** Pour `segment` : le segment à rejouer. */
    segment_id: z.string().uuid().optional(),
    /** Pour `lot` : le lot à lire. */
    lot_id: z.string().uuid().optional(),
    /**
     * Où reprendre dans une source plus large que `MAX_AJOUT`. Un segment de
     * 1 200 entreprises s'ajoute en trois appels, et chacun dit combien il
     * reste — plutôt qu'un ajout tronqué en silence.
     */
    offset: z.coerce.number().int().min(0).max(100_000).optional(),
  })
  .strict()
export type AjoutLeadsBody = z.infer<typeof ajoutLeadsSchema>

/** Écarter un lead à la main, ou le remettre dans la file. */
export const majLeadSchema = z
  .object({
    entreprise_id: z.number().int().positive(),
    action: z.enum(['ecarter', 'reintegrer']),
  })
  .strict()
export type MajLeadBody = z.infer<typeof majLeadSchema>

/**
 * Lancer un paquet.
 *
 * `taille` n'est pas un confort : les étapes manuelles créent leur tâche TOUT
 * DE SUITE, et un agent a un quota de 60 par jour. Lancer 300 WhatsApp d'un
 * coup, c'est 300 cartes le même matin — la file devient illisible et personne
 * ne fait les 240 autres.
 */
export const lancementSchema = z
  .object({ taille: z.coerce.number().int().min(1).max(200).default(25) })
  .strict()
export type LancementBody = z.infer<typeof lancementSchema>
