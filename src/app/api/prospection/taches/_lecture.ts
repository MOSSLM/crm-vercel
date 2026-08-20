// _lecture.ts — la file des tâches, lue une seule fois pour deux écrans.
//
// POURQUOI CE FICHIER EXISTE
// L'admin voit toute la file, l'agent ne voit que la sienne. C'est la SEULE
// différence entre les deux tableaux — mêmes colonnes, mêmes pastilles, mêmes
// vues enregistrées. La recopier dans une seconde route donnerait deux
// définitions de « une ligne de la file », qui divergeraient à la première
// colonne ajoutée.
//
// LE PÉRIMÈTRE DE L'AGENT N'EST PAS « CE QUI LUI EST ATTRIBUÉ »
// Une tâche peut lui être attribuée sans que l'entreprise soit à lui (le
// régulateur distribue), et une entreprise peut être à lui sans que la tâche
// porte son nom (une tâche détachée, `assignee_id` nul — il y en a). Prendre
// l'un des deux seulement escamote des lignes que l'agent doit voir, et rien à
// l'écran ne dirait qu'elles manquent. On prend donc L'UNION des deux, en deux
// lectures : PostgREST ne sait pas exprimer « OU » entre une colonne et un
// embed.
import type { SupabaseClient } from '@supabase/supabase-js'
import { readReplies } from '@/lib/automations/week'
import type { LigneTache } from '@/lib/prospection/vue-taches'

/**
 * Le plafond de lecture.
 *
 * Il est très au-dessus des 933 lignes d'aujourd'hui, et c'est voulu : ce n'est
 * pas une pagination, c'est un garde-fou. S'il est atteint, la lecture le DIT
 * (`tronque: true`) plutôt que de rendre une file incomplète qui aurait l'air
 * entière — un tableau qui ment sur son propre effectif est pire qu'un tableau
 * qui refuse.
 */
const PLAFOND = 5000

const CHAMPS =
  'id, kind, status, title, due_at, done_at, entreprise_id, assignee_id, ' +
  'automation_id, enrollment_id, step_id, routing_reason, '

type TacheBrute = {
  id: string
  kind: string
  status: string
  title: string | null
  due_at: string | null
  done_at: string | null
  entreprise_id: number | null
  assignee_id: string | null
  automation_id: string | null
  enrollment_id: string | null
  step_id: string | null
  routing_reason: string | null
  entreprise: unknown
}

/** L'embed postgrest rend tantôt l'objet, tantôt un tableau d'un élément. */
const premier = <T,>(v: unknown): T | null =>
  (Array.isArray(v) ? (v[0] as T | undefined) : (v as T | null)) ?? null

type EntrepriseJointe = {
  /** `entreprises.name` — la colonne s'appelle `name`, pas `nom`. Vérifié en base. */
  name: string | null
  ville: string | null
  cohorte_demarchage: string | null
  premiere_touche_le: string | null
}

export interface LectureTaches {
  lignes: LigneTache[]
  tronque: boolean
  /** Non nul = la lecture a échoué. Une liste vide avec erreur n'est jamais « aucune tâche ». */
  erreur: string | null
}

/**
 * PAS D'INSCRIPTION, PAS DE TÂCHE — la même règle que la file de l'agent.
 *
 * Mot pour mot : « ceux qui ne sont pas en séquence, on ne doit pas les voir
 * dans des tâches, même pas d'appels. Dans tous les cas on met en séquence pour
 * avoir des tâches. »
 *
 * Ce qui sortait d'ici sans inscription, c'était le stock semé par l'ancienne
 * attribution : 631 appels en attente au 20/08/2026, dont 86 sur des entreprises
 * DÉJÀ inscrites ailleurs — du travail en double, et un tableau que sa taille
 * rendait illisible. `assignProspectToAgent` met désormais en séquence, donc
 * plus rien n'entre ici sans une étape derrière.
 */
export async function lireLesTaches(
  sb: SupabaseClient,
  opts: { agentId?: string | null } = {},
): Promise<LectureTaches> {
  let brutes: TacheBrute[] = []

  if (opts.agentId) {
    // Deux lectures, réunies par identifiant. Voir l'en-tête : ni « ce qui
    // m'est attribué » ni « mes entreprises » ne suffit seul.
    const [attribuees, possedees] = await Promise.all([
      sb
        .from('prospection_tasks')
        .select(CHAMPS + 'entreprise:entreprises(name, ville, cohorte_demarchage, premiere_touche_le)')
        .eq('assignee_id', opts.agentId)
        .not('enrollment_id', 'is', null)
        .order('due_at', { ascending: true })
        .limit(PLAFOND),
      sb
        .from('prospection_tasks')
        .select(CHAMPS + 'entreprise:entreprises!inner(name, ville, cohorte_demarchage, premiere_touche_le, owner_id)')
        .eq('entreprise.owner_id', opts.agentId)
        .not('enrollment_id', 'is', null)
        .order('due_at', { ascending: true })
        .limit(PLAFOND),
    ])
    const erreur = attribuees.error?.message ?? possedees.error?.message ?? null
    if (erreur) return { lignes: [], tronque: false, erreur }

    const parId = new Map<string, TacheBrute>()
    for (const t of [...(attribuees.data ?? []), ...(possedees.data ?? [])] as unknown as TacheBrute[]) {
      parId.set(t.id, t)
    }
    brutes = [...parId.values()].sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
  } else {
    const { data, error } = await sb
      .from('prospection_tasks')
      .select(CHAMPS + 'entreprise:entreprises(name, ville, cohorte_demarchage, premiere_touche_le)')
      .not('enrollment_id', 'is', null)
      .order('due_at', { ascending: true })
      .limit(PLAFOND)
    if (error) return { lignes: [], tronque: false, erreur: error.message }
    brutes = (data ?? []) as unknown as TacheBrute[]
  }

  // ── Ce qu'il faut aller chercher ailleurs ───────────────────────────────
  //
  // Trois lectures groupées plutôt qu'une par ligne. Chacune est facultative :
  // une jointure qui échoue coûte une colonne vide, jamais le tableau.
  const idsAgents = [...new Set(brutes.map((t) => t.assignee_id).filter(Boolean))] as string[]
  const idsCampagnes = [...new Set(brutes.map((t) => t.automation_id).filter(Boolean))] as string[]
  const idsInscriptions = [...new Set(brutes.map((t) => t.enrollment_id).filter(Boolean))] as string[]

  const [agents, campagnes, inscriptions] = await Promise.all([
    idsAgents.length
      ? sb.from('user_profiles').select('id, full_name, email').in('id', idsAgents)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    idsCampagnes.length
      ? sb.from('automations').select('id, name').in('id', idsCampagnes)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    idsInscriptions.length
      ? sb.from('sequence_enrollments').select('id, vars').in('id', idsInscriptions)
      : Promise.resolve({ data: [] as { id: string; vars: unknown }[] }),
  ])

  const nomAgent = new Map<string, string>()
  for (const a of (agents.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    nomAgent.set(a.id, a.full_name?.trim() || a.email || a.id)
  }
  const nomCampagne = new Map<string, string>()
  for (const c of (campagnes.data ?? []) as { id: string; name: string | null }[]) {
    nomCampagne.set(c.id, c.name?.trim() || 'Sans nom')
  }
  // LA PREUVE DE RÉPONSE VIT DANS `vars.replies`, ET NULLE PART AILLEURS —
  // `sales_pipeline_state.replied` est faux sur les 153 inscriptions, et le
  // poser automatiquement éteindrait les cellules WhatsApp et Appel
  // (cf. l'en-tête de `reply.ts`). On lit, on n'écrit pas.
  const aRepondu = new Set<string>()
  for (const e of (inscriptions.data ?? []) as { id: string; vars: unknown }[]) {
    if (Object.keys(readReplies(e.vars)).length > 0) aRepondu.add(e.id)
  }

  const lignes: LigneTache[] = brutes.map((t) => {
    const ent = premier<EntrepriseJointe>(t.entreprise)
    return {
      id: t.id,
      canal: t.kind,
      statut: t.status,
      titre: t.title?.trim() || '',
      echeance: t.due_at,
      faiteLe: t.done_at,
      entrepriseId: t.entreprise_id,
      // Sans nom d'entreprise la ligne reste lisible : l'identifiant vaut mieux
      // qu'une cellule vide dont on ne saurait pas de qui elle parle.
      entreprise: ent?.name?.trim() || (t.entreprise_id != null ? `#${t.entreprise_id}` : '—'),
      ville: ent?.ville ?? null,
      cohorte: ent?.cohorte_demarchage ?? null,
      agentId: t.assignee_id,
      agent: t.assignee_id ? (nomAgent.get(t.assignee_id) ?? null) : null,
      campagneId: t.automation_id,
      campagne: t.automation_id ? (nomCampagne.get(t.automation_id) ?? null) : null,
      etapeId: t.step_id,
      inscriptionId: t.enrollment_id,
      motif: t.routing_reason,
      premiereTouche: ent?.premiere_touche_le ?? null,
      aRepondu: t.enrollment_id ? aRepondu.has(t.enrollment_id) : false,
    }
  })

  return { lignes, tronque: brutes.length >= PLAFOND, erreur: null }
}
