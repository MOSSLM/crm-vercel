// _lissage.ts — ce que les routes du lissage partagent.
//
// LA POPULATION SE CHOISIT PAR LES FILTRES DE L'EXPLORATEUR, ET PAR RIEN
// D'AUTRE. `chercher_entreprises` sait déjà trancher `sans_site`, `sans_google`
// et `sans_siret` — c'est-à-dire exactement les trois trous que la passe est
// faite pour boucher. Réécrire une sélection ici créerait une deuxième
// définition de « sans site », et deux définitions divergent toujours.

import {
  ETATS,
  PLAN_DEFAUT,
  SUJETS,
  type Confiance,
  type Constat,
  type Etat,
  type PlanPasse,
  type Sujet,
} from '@/lib/lissage/passe'
import type { SupabaseClient } from '@supabase/supabase-js'

export const MIGRATION = 'sql/20260820_lissage.sql'

export const migrationAbsente = (erreur: { code?: string; message?: string } | null): boolean =>
  erreur?.code === '42P01' ||
  erreur?.code === 'PGRST205' ||
  /lissage_(passes|leads)/i.test(erreur?.message ?? '')

/** Le plafond d'une passe. Au-delà, ce n'est plus une passe, c'est un backfill. */
export const MAX_POPULATION = 2000

/** Les critères, dans la forme exacte de l'URL de `/api/entreprises/explorer`. */
export interface CriteresPasse extends Record<string, unknown> {
  q?: string | null
  flags?: string[]
  sources?: string[]
  /**
   * Le propriétaire des fiches (`entreprises.owner_id`), ou `null` pour tout le
   * parc. Il se CUMULE avec les drapeaux : « mes fiches » ET « sans SIRET »
   * veut dire les deux à la fois — c'est le découpage avec lequel on travaille
   * vraiment, et sans lui il fallait lisser 60 445 fiches en espérant tomber
   * sur les siennes. Ajouté à `chercher_entreprises` par
   * `sql/20260820_chercher_entreprises_owner.sql`.
   */
  owner?: string | null
}

/**
 * Les entreprises que ces critères désignent.
 *
 * On pagine à la main parce que `chercher_entreprises` plafonne à 200 par appel
 * — et qu'un `limite: 2000` silencieusement rogné à 200 donnerait une passe qui
 * a l'air complète et ne couvre qu'un dixième de la population.
 */
export async function populationDesCriteres(
  sb: SupabaseClient,
  criteres: CriteresPasse,
  taille: number,
): Promise<{ ids: number[]; total: number }> {
  const voulu = Math.max(1, Math.min(taille, MAX_POPULATION))
  const ids: number[] = []
  let total = 0
  for (let offset = 0; ids.length < voulu; offset += 200) {
    const { data, error } = await sb.rpc('chercher_entreprises', {
      p_recherche: criteres.q?.trim() || null,
      p_flags: criteres.flags ?? [],
      p_sources: criteres.sources ?? [],
      p_limite: Math.min(200, voulu - ids.length),
      p_offset: offset,
      p_owner: criteres.owner ?? null,
    })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    const lignes = (data ?? []) as { id: number; total: number | string }[]
    if (lignes.length === 0) break
    total = Number(lignes[0].total ?? 0)
    for (const l of lignes) ids.push(Number(l.id))
    if (offset + lignes.length >= total) break
  }
  return { ids: ids.slice(0, voulu), total }
}

/**
 * Une population choisie À LA MAIN, et non par des filtres.
 *
 * C'est l'autre porte d'entrée du lissage : on coche des lignes dans le
 * pipeline marketing et on les envoie à la file. Ces identifiants viennent d'un
 * NAVIGATEUR — donc on ne les croit pas sur parole. Deux raisons, et la seconde
 * est la vraie :
 *
 *  1. `lissage_leads.entreprise_id` référence `entreprises` : un id inventé
 *     ferait échouer l'insertion du LOT ENTIER, pas seulement de sa ligne.
 *  2. Lisser une fiche fusionnée ou archivée, c'est dépenser des appels sur un
 *     doublon dont on sait déjà qu'il ne servira à personne. On les écarte, et
 *     surtout **on dit combien** — un lot silencieusement rogné passerait pour
 *     complet.
 */
export async function populationDeLaSelection(
  sb: SupabaseClient,
  ids: readonly number[],
): Promise<{ ids: number[]; demandes: number; ecartees: number }> {
  const demandes = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0)
  if (demandes.length === 0) return { ids: [], demandes: 0, ecartees: 0 }

  const retenus: number[] = []
  // Par tranches : une clause `in` de deux mille identifiants dépasse la
  // longueur d'URL que PostgREST accepte.
  for (let i = 0; i < demandes.length; i += 500) {
    const { data, error } = await sb
      .from('entreprises')
      .select('id')
      .in('id', demandes.slice(i, i + 500))
      .is('merged_into_id', null)
      .is('archived_at', null)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    for (const r of (data ?? []) as { id: number }[]) retenus.push(Number(r.id))
  }

  // L'ordre de la sélection est celui de l'écran ; `in` ne le garantit pas.
  const vivantes = new Set(retenus)
  const gardes = demandes.filter((id) => vivantes.has(id))
  return {
    ids: gardes.slice(0, MAX_POPULATION),
    demandes: demandes.length,
    ecartees: demandes.length - gardes.length,
  }
}

const CONFIANCES_VALIDES = new Set<string>(['certaine', 'haute', 'moyenne', 'faible'])

/** Valider un plan venu du navigateur. Un sujet inconnu est ÉCARTÉ, pas traduit. */
export function planDepuisLeCorps(brut: unknown): PlanPasse {
  const p = (brut ?? {}) as Record<string, unknown>
  const sujets = Array.isArray(p.sujets)
    ? (p.sujets as unknown[]).filter((s): s is Sujet =>
        typeof s === 'string' && (SUJETS as readonly string[]).includes(s),
      )
    : []
  const exigence = typeof p.exigence === 'string' && CONFIANCES_VALIDES.has(p.exigence)
    ? (p.exigence as Confiance)
    : PLAN_DEFAUT.exigence
  return {
    sujets: sujets.length > 0 ? sujets : PLAN_DEFAUT.sujets,
    exigence,
    facture: typeof p.facture === 'boolean' ? p.facture : PLAN_DEFAUT.facture,
    local: typeof p.local === 'boolean' ? p.local : PLAN_DEFAUT.local,
  }
}

/** Les critères, validés. On ne stocke pas un filtre que l'explorateur ignorerait. */
export function criteresDepuisLeCorps(brut: unknown): CriteresPasse {
  const c = (brut ?? {}) as Record<string, unknown>
  const liste = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
  return {
    q: typeof c.q === 'string' && c.q.trim() ? c.q.trim() : null,
    flags: liste(c.flags),
    sources: liste(c.sources),
    // Un uuid, ou rien. On ne stocke pas une chaîne libre dans un critère qui
    // finira dans un `where` : la RPC la refuserait, et la passe échouerait à
    // la création sans qu'on sache pourquoi.
    owner: typeof c.owner === 'string' && UUID.test(c.owner) ? c.owner : null,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Le secret partagé, pour les appelants qui ne sont pas un navigateur : le cron,
 * et l'exécuteur local sur la machine de Matteo.
 *
 * Même contrat que le tick des automatisations — en production un secret DOIT
 * être configuré et correspondre ; en local, sans secret, on laisse passer pour
 * pouvoir l'essayer. C'est justement le cas de l'exécuteur local, qui parle à un
 * `npm run dev` sur la même machine.
 */
export function secretPartageValide(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  const pgCronSecret = process.env.PG_CRON_SECRET
  if (process.env.NODE_ENV === 'production' && !cronSecret && !pgCronSecret) return false
  if (!cronSecret && !pgCronSecret) return true
  return (
    (!!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) ||
    (!!pgCronSecret && req.headers.get('x-pg-cron-secret') === pgCronSecret)
  )
}

/**
 * Valider un constat venu de l'extérieur.
 *
 * L'exécuteur local est un script sur une machine ; ce qu'il envoie est une
 * ENTRÉE, pas une vérité. Un `sujet` inconnu ferait tomber tout le lot sur la
 * contrainte CHECK, et un `etat` inventé passerait tel quel dans une table qui
 * porte notre distinction la plus importante. On filtre ici, pas en base.
 */
export function constatValide(brut: unknown): Constat | null {
  const c = (brut ?? {}) as Record<string, unknown>
  if (typeof c.sujet !== 'string' || !(SUJETS as readonly string[]).includes(c.sujet)) return null
  if (typeof c.etat !== 'string' || !(ETATS as readonly string[]).includes(c.etat)) return null
  const confiance =
    typeof c.confiance === 'string' && CONFIANCES_VALIDES.has(c.confiance)
      ? (c.confiance as Confiance)
      : 'moyenne'
  return {
    sujet: c.sujet as Sujet,
    etat: c.etat as Etat,
    confiance,
    valeur: typeof c.valeur === 'string' ? c.valeur : null,
    source: typeof c.source === 'string' && c.source.trim() ? c.source.trim() : 'exécuteur local',
    preuve: c.preuve ?? {},
  }
}
