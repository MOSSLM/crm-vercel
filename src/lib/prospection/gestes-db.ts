// gestes-db.ts — photographier avant d'agir, reposer la photo après coup.
//
// LE DÉCOUPAGE EST CELUI DU DÉPÔT : `annulation.ts` décide et ne touche à rien,
// ce fichier lit et écrit et ne décide de rien. C'est ce qui rend le verdict
// testable sans base, et c'est le même partage que `regulator.ts` /
// `regulator-db.ts`.
//
// UNE RÈGLE QUI GOUVERNE TOUT CE FICHIER : LE JOURNAL NE DOIT JAMAIS FAIRE
// ÉCHOUER LE GESTE. Un agent qui vient de passer son appel doit voir son
// « Fait » enregistré, même si la photo n'a pas pu être prise. Perdre la
// possibilité d'annuler est ennuyeux ; perdre le travail de l'agent parce
// qu'une table de confort résiste serait le pire échange possible. D'où le
// `catch` qui avale, et le `null` rendu plutôt qu'une exception.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CHAMPS_INSCRIPTION,
  CHAMPS_TACHE,
  photographier,
  resumeAnnulation,
  verdictAnnulation,
  type PhotoAvant,
  type TypeGeste,
  type Verdict,
} from './annulation'

/** Une ligne du journal, telle que l'écran la lit. */
export interface GesteJournalise {
  id: string
  geste: TypeGeste
  faitLe: string
  faitPar: string | null
  tacheId: string
  enrollmentId: string | null
  entrepriseId: number | null
  /** Le nom de l'entreprise — un journal d'identifiants ne se relit pas. */
  entreprise: string | null
  titre: string | null
  resume: string
  verdict: Verdict
}

type Ligne = Record<string, unknown>

/**
 * Prend la photo AVANT que le geste ne s'applique, et rend l'identifiant de la
 * ligne de journal.
 *
 * À APPELER AVANT LA MUTATION, pas après : c'est tout l'intérêt. Appelée après,
 * elle photographierait l'état d'arrivée et l'annulation ne ferait rien —
 * silencieusement, ce qui est pire que pas d'annulation du tout.
 */
export async function journaliserGeste(
  sb: SupabaseClient,
  params: { geste: TypeGeste; tacheId: string; faitPar: string | null },
): Promise<string | null> {
  try {
    const { data: tacheRow } = await sb
      .from('prospection_tasks')
      .select('id, status, done_at, due_at, payload, enrollment_id, entreprise_id, opportunite_id')
      .eq('id', params.tacheId)
      .maybeSingle()
    if (!tacheRow) return null
    const tache = tacheRow as Ligne

    const enrollmentId = (tache.enrollment_id as string | null) ?? null
    const entrepriseId = (tache.entreprise_id as number | null) ?? null
    const opportuniteId = (tache.opportunite_id as string | null) ?? null

    // Les trois lignes que le geste peut déplacer, lues en parallèle : la photo
    // doit être aussi instantanée que possible.
    const [inscription, entreprise, opportunite] = await Promise.all([
      enrollmentId
        ? sb
            .from('sequence_enrollments')
            .select(CHAMPS_INSCRIPTION.join(', '))
            .eq('id', enrollmentId)
            .maybeSingle()
            .then((r) => r.data as Ligne | null)
        : Promise.resolve(null),
      entrepriseId != null
        ? sb
            .from('entreprises')
            .select('premiere_touche_le')
            .eq('id', entrepriseId)
            .maybeSingle()
            .then((r) => r.data as Ligne | null)
        : Promise.resolve(null),
      opportuniteId
        ? sb
            .from('opportunites')
            .select('stage_id')
            .eq('id', opportuniteId)
            .maybeSingle()
            .then((r) => r.data as Ligne | null)
        : Promise.resolve(null),
    ])

    const avant: PhotoAvant = {
      tache: photographier(tache, CHAMPS_TACHE)!,
      inscription: photographier(inscription, CHAMPS_INSCRIPTION),
      // ON NE GARDE PAS LA DATE, MAIS LE FAIT QU'ELLE ÉTAIT ABSENTE. « Fait »
      // ne l'écrit que si elle est nulle ; l'annulation ne doit donc la retirer
      // que dans ce cas — sinon elle effacerait un premier contact bien réel,
      // antérieur, que ce geste-ci n'a pas posé.
      premiereTouchePosee: entreprise ? entreprise.premiere_touche_le == null : false,
      stageId: (opportunite?.stage_id as number | null) ?? null,
    }

    const { data, error } = await sb
      .from('prospection_gestes')
      .insert({
        geste: params.geste,
        fait_par: params.faitPar,
        tache_id: params.tacheId,
        enrollment_id: enrollmentId,
        entreprise_id: entrepriseId,
        opportunite_id: opportuniteId,
        avant,
      })
      .select('id')
      .single()

    if (error) return null
    return String(data.id)
  } catch {
    // Le geste passe quand même : voir l'en-tête.
    return null
  }
}

/** Ce qui s'est passé depuis un geste, et qui décide s'il est encore annulable. */
async function contexteDe(
  sb: SupabaseClient,
  ligne: { id: string; fait_le: string; annule_le: string | null; tache_id: string; enrollment_id: string | null },
) {
  const [tache, plusRecent, envois] = await Promise.all([
    sb.from('prospection_tasks').select('id').eq('id', ligne.tache_id).maybeSingle(),
    ligne.enrollment_id
      ? sb
          .from('prospection_gestes')
          .select('geste, fait_le')
          .eq('enrollment_id', ligne.enrollment_id)
          .is('annule_le', null)
          .gt('fait_le', ligne.fait_le)
          .order('fait_le', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as Ligne[] }),
    // CE QUI EST VRAIMENT PARTI, pas ce qui était prévu. Les notes ne comptent
    // pas : elles ne sortent pas du CRM, et les compter refuserait des
    // annulations parfaitement inoffensives.
    ligne.enrollment_id
      ? sb
          .from('email_logs')
          .select('id', { count: 'exact', head: true })
          .eq('enrollment_id', ligne.enrollment_id)
          .neq('channel', 'note')
          .gt('created_at', ligne.fait_le)
      : Promise.resolve({ count: 0 }),
  ])

  const recent = (plusRecent as { data?: Ligne[] }).data?.[0]

  return {
    dejaAnnule: ligne.annule_le != null,
    tacheAbsente: !tache.data,
    gestePlusRecent: recent
      ? { geste: String(recent.geste) as TypeGeste, le: String(recent.fait_le) }
      : null,
    envoisDepuis: (envois as { count?: number | null }).count ?? 0,
  }
}

/**
 * Les derniers gestes, avec leur verdict déjà calculé.
 *
 * LE VERDICT EST RENDU MÊME QUAND IL REFUSE, et c'est le point : un bouton
 * grisé sans motif est exactement ce qu'on remplace. L'écran affiche la
 * phrase, l'humain sait quoi faire — souvent « annule l'autre d'abord ».
 */
export async function listerGestes(
  sb: SupabaseClient,
  options: { agentId?: string; limite?: number } = {},
): Promise<GesteJournalise[]> {
  let q = sb
    .from('prospection_gestes')
    .select('id, geste, fait_le, fait_par, tache_id, enrollment_id, entreprise_id, avant, annule_le')
    .is('annule_le', null)
    .order('fait_le', { ascending: false })
    .limit(Math.min(options.limite ?? 20, 100))

  // Un agent ne voit que ses propres gestes : annuler celui d'un collègue
  // rendrait une tâche à quelqu'un qui ne saurait pas pourquoi elle revient.
  if (options.agentId) q = q.eq('fait_par', options.agentId)

  const { data, error } = await q
  if (error) throw new Error(`listerGestes: ${error.message}`)
  const lignes = (data ?? []) as unknown as {
    id: string
    geste: TypeGeste
    fait_le: string
    fait_par: string | null
    tache_id: string
    enrollment_id: string | null
    entreprise_id: number | null
    avant: PhotoAvant
    annule_le: string | null
  }[]
  if (lignes.length === 0) return []

  // Les titres et les noms en UN aller-retour chacun, pas un par ligne.
  const idsTaches = [...new Set(lignes.map((l) => l.tache_id))]
  const idsEntreprises = [...new Set(lignes.map((l) => l.entreprise_id).filter((x): x is number => x != null))]
  const [taches, entreprises] = await Promise.all([
    sb.from('prospection_tasks').select('id, title').in('id', idsTaches),
    idsEntreprises.length > 0
      ? sb.from('entreprises').select('id, nom').in('id', idsEntreprises)
      : Promise.resolve({ data: [] as Ligne[] }),
  ])
  const titreDe = new Map((taches.data ?? []).map((t) => [String(t.id), (t.title as string) ?? null]))
  const nomDe = new Map(((entreprises.data ?? []) as Ligne[]).map((e) => [Number(e.id), (e.nom as string) ?? null]))

  return Promise.all(
    lignes.map(async (l) => ({
      id: l.id,
      geste: l.geste,
      faitLe: l.fait_le,
      faitPar: l.fait_par,
      tacheId: l.tache_id,
      enrollmentId: l.enrollment_id,
      entrepriseId: l.entreprise_id,
      entreprise: l.entreprise_id != null ? (nomDe.get(l.entreprise_id) ?? null) : null,
      titre: titreDe.get(l.tache_id) ?? null,
      resume: resumeAnnulation(l.avant),
      verdict: verdictAnnulation(await contexteDe(sb, l)),
    })),
  )
}

/**
 * Repose la photo.
 *
 * L'ORDRE DES RESTAURATIONS N'EST PAS ARBITRAIRE :
 *   1. les tâches filles d'abord — celles que l'avancement vient de créer. Les
 *      laisser pendant qu'on rembobine l'inscription ferait apparaître deux
 *      tâches pour le même prospect, dont une que personne n'a demandée ;
 *   2. l'inscription ensuite, parce que c'est elle qui porte l'étape ;
 *   3. la tâche en dernier : c'est ce que l'agent verra revenir dans sa file,
 *      et elle ne doit revenir qu'une fois le reste cohérent.
 */
export async function annulerGeste(
  sb: SupabaseClient,
  params: {
    gesteId: string
    parQui: string | null
    /**
     * Quand il est posé, seul l'auteur du geste peut l'annuler. C'est le
     * périmètre de l'agent : rendre une tâche qu'un collègue a terminée la
     * ferait réapparaître dans SA file sans qu'il sache pourquoi.
     */
    auteurExige?: string | null
  },
): Promise<{ ok: boolean; motif: string }> {
  const { data, error } = await sb
    .from('prospection_gestes')
    .select(
      'id, geste, fait_le, fait_par, annule_le, tache_id, enrollment_id, entreprise_id, opportunite_id, avant',
    )
    .eq('id', params.gesteId)
    .maybeSingle()
  if (error) return { ok: false, motif: error.message }
  if (!data) return { ok: false, motif: 'Ce geste est introuvable.' }

  const ligne = data as unknown as {
    id: string
    fait_le: string
    fait_par: string | null
    annule_le: string | null
    tache_id: string
    enrollment_id: string | null
    entreprise_id: number | null
    opportunite_id: string | null
    avant: PhotoAvant
  }

  if (params.auteurExige && ligne.fait_par !== params.auteurExige) {
    return { ok: false, motif: 'Ce geste est celui de quelqu’un d’autre.' }
  }

  const verdict = verdictAnnulation(await contexteDe(sb, ligne))
  if (!verdict.possible) return { ok: false, motif: verdict.motif }

  // 1. Les tâches filles, créées par l'avancement qu'on défait.
  //
  // On ne touche QU'À CELLES QUI N'ONT PAS SERVI (`pending`, `snoozed`) : une
  // fille déjà traitée aurait son propre geste au journal, et le verdict aurait
  // refusé plus haut. Supprimer plutôt qu'annuler, parce qu'elles n'ont jamais
  // dû exister — les marquer `skipped` gonflerait un compteur qui sert à
  // mesurer des décisions humaines.
  if (ligne.enrollment_id) {
    await sb
      .from('prospection_tasks')
      .delete()
      .eq('enrollment_id', ligne.enrollment_id)
      .in('status', ['pending', 'snoozed'])
      .gt('created_at', ligne.fait_le)
  }

  // 2. L'inscription, reposée colonne par colonne comme elle était.
  if (ligne.enrollment_id && ligne.avant.inscription) {
    const { error: e } = await sb
      .from('sequence_enrollments')
      .update(ligne.avant.inscription)
      .eq('id', ligne.enrollment_id)
    if (e) return { ok: false, motif: `L’inscription n’a pas pu être reposée : ${e.message}` }
  }

  // 3. La tâche.
  const { error: eTache } = await sb
    .from('prospection_tasks')
    .update(ligne.avant.tache)
    .eq('id', ligne.tache_id)
  if (eTache) return { ok: false, motif: `La tâche n’a pas pu être reposée : ${eTache.message}` }

  // 4. La première touche, seulement si c'est CE geste qui l'a posée.
  if (ligne.avant.premiereTouchePosee && ligne.entreprise_id != null) {
    await sb
      .from('entreprises')
      .update({ premiere_touche_le: null })
      .eq('id', ligne.entreprise_id)
  }

  // 5. L'étape de l'affaire.
  if (ligne.avant.stageId != null && ligne.opportunite_id) {
    await sb
      .from('opportunites')
      .update({ stage_id: ligne.avant.stageId })
      .eq('id', ligne.opportunite_id)
  }

  await sb
    .from('prospection_gestes')
    .update({ annule_le: new Date().toISOString(), annule_par: params.parQui })
    .eq('id', params.gesteId)

  return { ok: true, motif: resumeAnnulation(ligne.avant) }
}
