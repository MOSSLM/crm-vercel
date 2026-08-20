// _lecture.ts — les fils, lus une seule fois pour deux écrans.
//
// POURQUOI CE FICHIER EXISTE
// L'admin voit tous les fils, l'agent ne voit que les siens — et c'est la SEULE
// différence entre les deux écrans. La recopier dans une seconde route, c'était
// se donner deux définitions de « ce qu'est un fil », qui divergeraient à la
// première colonne ajoutée : la couche 5a a mis trois jours à obtenir un fil
// qui se lit d'une traite, et il n'y en aura pas deux.
//
// LE PÉRIMÈTRE EST UN PARAMÈTRE, PAS UNE ROUTE. `agentId` absent = tout le
// corpus ; `agentId` posé = les entreprises dont il est propriétaire. Le filtre
// passe par `entreprises!inner`, comme `/api/agent/tasks` — sans `!inner`,
// PostgREST vide l'embed au lieu d'écarter la ligne, et l'agent verrait les
// fils des autres avec un nom d'entreprise en blanc.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assemblerFils, type Fil, type Message } from '@/lib/prospection/conversation'

/**
 * Le plafond de lecture. Le journal fait 210 lignes ; celui-ci est très
 * au-dessus, et s'il est atteint la lecture le DIT plutôt que de rendre des
 * fils amputés par le milieu — un fil auquel il manque le début se lit à
 * l'envers.
 */
const PLAFOND = 4000

type LigneBrute = {
  id: string
  channel: string
  direction: string
  sent_at: string
  subject: string | null
  body_text: string | null
  outcome: string | null
  step_id: string | null
  auteur_id: string | null
  delivery_status: string | null
  blocked_reason: string | null
  entreprise_id: number | null
  contact: unknown
  entreprise: unknown
}

const premier = <T,>(v: unknown): T | null =>
  (Array.isArray(v) ? (v[0] as T | undefined) : (v as T | null)) ?? null

export interface Lecture {
  fils: Fil[]
  tronque: boolean
  /** Non nul = la lecture a échoué. Un `fils: []` avec une erreur n'est jamais « aucun fil ». */
  erreur: string | null
  /** Vrai quand la colonne `direction` manque encore — la migration du 20/08. */
  migrationAbsente: boolean
}

export async function lireLesFils(
  sb: SupabaseClient,
  opts: { agentId?: string | null } = {},
): Promise<Lecture> {
  const embedEntreprise = opts.agentId
    ? 'entreprise:entreprises!inner(name, ville, cohorte_demarchage, owner_id)'
    : 'entreprise:entreprises(name, ville, cohorte_demarchage)'

  let q = sb
    .from('email_logs')
    .select(
      'id, channel, direction, sent_at, subject, body_text, outcome, step_id, auteur_id, ' +
        'delivery_status, blocked_reason, entreprise_id, ' +
        embedEntreprise +
        ', contact:contacts(first_name, last_name)',
    )
    .not('entreprise_id', 'is', null)
  if (opts.agentId) q = q.eq('entreprise.owner_id', opts.agentId)

  const { data, error } = await q.order('sent_at', { ascending: false }).limit(PLAFOND)

  if (error) {
    return {
      fils: [],
      tronque: false,
      erreur: error.message,
      migrationAbsente: /direction/i.test(error.message),
    }
  }

  const brutes = (data ?? []) as unknown as LigneBrute[]

  const idsAuteurs = [...new Set(brutes.map((l) => l.auteur_id).filter(Boolean))] as string[]
  const { data: profils } = idsAuteurs.length
    ? await sb.from('user_profiles').select('id, full_name, email').in('id', idsAuteurs)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }

  const nom = new Map<string, string>()
  for (const p of (profils ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    nom.set(p.id, p.full_name?.trim() || p.email || p.id)
  }

  const lignes = brutes.map((l) => {
    const ent = premier<{ name: string | null; ville: string | null; cohorte_demarchage: string | null }>(
      l.entreprise,
    )
    // `contacts` porte `first_name`/`last_name`, pas `prenom`/`nom`. Vérifié en base.
    const ct = premier<{ first_name: string | null; last_name: string | null }>(l.contact)
    const nomContact = [ct?.first_name, ct?.last_name].filter(Boolean).join(' ').trim()
    return {
      id: l.id,
      canal: l.channel,
      // Une valeur inconnue retombe sur `sortant` — le défaut de la colonne.
      // Mieux vaut un sens par défaut qu'une ligne muette dans le fil.
      sens: (['sortant', 'entrant', 'interne'].includes(l.direction)
        ? l.direction
        : 'sortant') as Message['sens'],
      quand: l.sent_at,
      objet: l.subject ?? '',
      texte: l.body_text ?? '',
      issue: l.outcome,
      etapeId: l.step_id,
      auteurId: l.auteur_id,
      auteur: l.auteur_id ? (nom.get(l.auteur_id) ?? null) : null,
      remise: l.delivery_status,
      bloquePar: l.blocked_reason,
      entrepriseId: l.entreprise_id,
      entreprise: ent?.name?.trim() || (l.entreprise_id != null ? `#${l.entreprise_id}` : '—'),
      ville: ent?.ville ?? null,
      cohorte: ent?.cohorte_demarchage ?? null,
      contact: nomContact || null,
    }
  })

  return {
    fils: assemblerFils(lignes),
    tronque: brutes.length >= PLAFOND,
    erreur: null,
    migrationAbsente: false,
  }
}
