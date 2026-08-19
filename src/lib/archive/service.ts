import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { stopOutreach } from '@/lib/sales-pipeline/actions'
import { canonicalizeDomain, canonicalizeUrl } from '@/lib/url-canonical'

import { isPlausibleDomain, type ArchiveReason } from './reasons'

/**
 * Cœur de l'archivage, partagé par `/api/archive` (admin) et
 * `/api/agent/archive` (freelance, avec garde de propriété en amont).
 *
 * Tout passe par un client service-role : un `update` navigateur sur une fiche
 * du pool est refusé par la RLS sans lever d'erreur (0 ligne touchée = succès
 * silencieux), et l'utilisateur voyait la carte revenir au rechargement. Les
 * fonctions renvoient donc le nombre **réel** de lignes touchées.
 */

export interface ConcurrentRef {
  id: string
  domaine: string
  nom: string | null
}

export interface ArchiveInput {
  opportunityIds?: string[]
  entrepriseIds?: number[]
  reason: ArchiveReason
  note?: string | null
  concurrentUrl?: string | null
  actorId: string | null
}

export interface ArchiveOutcome {
  opportunites: number
  entreprises: number
  concurrent: ConcurrentRef | null
}

export class ArchiveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ArchiveError'
  }
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)]

/** Repli lisible quand l'utilisateur n'a saisi qu'une URL : « agence-web.fr » → « Agence Web ». */
const nomDepuisDomaine = (domaine: string): string => {
  const base = domaine.split('.').slice(0, -1).join('.') || domaine
  return base
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Trouve ou crée le concurrent correspondant à une URL saisie.
 *
 * La clé de déduplication est le hostname sans `www.` : deux agents qui
 * archivent avec « https://www.Agence-Web.fr/realisations » et
 * « agence-web.fr » pointent bien sur la même ligne.
 *
 * `canonicalizeDomain` ne valide rien — « pas une url » ressort tel quel —
 * d'où le contrôle explicite avant l'upsert.
 */
export async function upsertConcurrentFromUrl(
  sb: SupabaseClient,
  url: string,
  actorId: string | null,
): Promise<ConcurrentRef> {
  const domaine = canonicalizeDomain(url.trim())
  if (!isPlausibleDomain(domaine)) {
    throw new ArchiveError('url_concurrent_invalide', 400)
  }

  const { data: existing, error: readErr } = await sb
    .from('concurrents')
    .select('id, domaine, nom')
    .eq('domaine', domaine)
    .maybeSingle()
  if (readErr) throw new ArchiveError(readErr.message, 500)
  if (existing) return existing as ConcurrentRef

  // Course possible entre deux archivages simultanés sur le même domaine :
  // `onConflict` laisse la contrainte unique arbitrer plutôt que de lever.
  const { data, error } = await sb
    .from('concurrents')
    .upsert(
      {
        domaine,
        site_url: canonicalizeUrl(url.trim()) || null,
        nom: nomDepuisDomaine(domaine),
        created_by: actorId,
      },
      { onConflict: 'domaine', ignoreDuplicates: false },
    )
    .select('id, domaine, nom')
    .maybeSingle()
  if (error) throw new ArchiveError(error.message, 500)
  if (data) return data as ConcurrentRef

  // `upsert` sans retour (cas ignoreDuplicates côté PostgREST) : on relit.
  const { data: reread } = await sb
    .from('concurrents')
    .select('id, domaine, nom')
    .eq('domaine', domaine)
    .maybeSingle()
  if (!reread) throw new ArchiveError('concurrent_introuvable', 500)
  return reread as ConcurrentRef
}

/**
 * Archive des opportunités et/ou des entreprises.
 *
 * Archiver une **entreprise** entraîne ses opportunités : les boards partent
 * tous d'un select sur `opportunites`, donc sans la cascade la ligne resterait
 * affichée dans le kanban alors que la fiche est archivée.
 */
export async function archiveTargets(
  sb: SupabaseClient,
  input: ArchiveInput,
): Promise<ArchiveOutcome> {
  const entrepriseIds = uniq(input.entrepriseIds ?? [])
  const opportunityIds = uniq(input.opportunityIds ?? [])

  const concurrent = input.concurrentUrl
    ? await upsertConcurrentFromUrl(sb, input.concurrentUrl, input.actorId)
    : null

  const patch = {
    archived_at: new Date().toISOString(),
    archived_by: input.actorId,
    archive_reason: input.reason,
    archive_note: input.note?.trim() || null,
    archive_concurrent_id: concurrent?.id ?? null,
  }

  const touchedOpportunites = new Set<string>()

  // 1. Les entreprises visées, puis leurs opportunités.
  let entreprises = 0
  if (entrepriseIds.length > 0) {
    const { data, error } = await sb
      .from('entreprises')
      // `hidden_in_qualification` est délibéré : c'est ce que filtrent déjà la
      // file de qualification, /api/agent/progress et les objectifs. Le poser
      // ici sort la fiche de tous ces comptages sans les modifier.
      .update({ ...patch, hidden_in_qualification: true })
      .in('id', entrepriseIds)
      .select('id')
    if (error) throw new ArchiveError(error.message, 500)
    entreprises = (data ?? []).length

    const { data: cascade, error: cascadeErr } = await sb
      .from('opportunites')
      .update(patch)
      .in('entreprise_id', entrepriseIds)
      .select('id')
    if (cascadeErr) throw new ArchiveError(cascadeErr.message, 500)
    for (const row of cascade ?? []) touchedOpportunites.add(String(row.id))
  }

  // 2. Les opportunités visées directement — l'entreprise reste active.
  if (opportunityIds.length > 0) {
    const { data, error } = await sb
      .from('opportunites')
      .update(patch)
      .in('id', opportunityIds)
      .select('id')
    if (error) throw new ArchiveError(error.message, 500)
    for (const row of data ?? []) touchedOpportunites.add(String(row.id))
  }

  // 3. Couper ce qui est encore en vol. Sans ça un email de séquence part
  //    après l'archivage — exactement le bug que `stopOutreach` évite ailleurs.
  for (const id of touchedOpportunites) {
    try {
      await stopOutreach(sb, id, 'exited', 'archive')
    } catch (e) {
      console.warn('stopOutreach a échoué pour', id, e)
    }
  }

  return { opportunites: touchedOpportunites.size, entreprises, concurrent }
}

/**
 * Désarchive : symétrique de l'archivage, sans relancer les séquences —
 * relancer un envoi reste une action explicite du pipeline commercial
 * (`reviveRow`).
 */
export async function unarchiveTargets(
  sb: SupabaseClient,
  input: { opportunityIds?: string[]; entrepriseIds?: number[] },
): Promise<ArchiveOutcome> {
  const entrepriseIds = uniq(input.entrepriseIds ?? [])
  const opportunityIds = uniq(input.opportunityIds ?? [])

  const patch = {
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_note: null,
    archive_concurrent_id: null,
  }

  const touchedOpportunites = new Set<string>()

  let entreprises = 0
  if (entrepriseIds.length > 0) {
    const { data, error } = await sb
      .from('entreprises')
      .update({ ...patch, hidden_in_qualification: false })
      .in('id', entrepriseIds)
      .select('id')
    if (error) throw new ArchiveError(error.message, 500)
    entreprises = (data ?? []).length

    const { data: cascade, error: cascadeErr } = await sb
      .from('opportunites')
      .update(patch)
      .in('entreprise_id', entrepriseIds)
      .select('id')
    if (cascadeErr) throw new ArchiveError(cascadeErr.message, 500)
    for (const row of cascade ?? []) touchedOpportunites.add(String(row.id))
  }

  if (opportunityIds.length > 0) {
    const { data, error } = await sb
      .from('opportunites')
      .update(patch)
      .in('id', opportunityIds)
      .select('id')
    if (error) throw new ArchiveError(error.message, 500)
    for (const row of data ?? []) touchedOpportunites.add(String(row.id))
  }

  return { opportunites: touchedOpportunites.size, entreprises, concurrent: null }
}
