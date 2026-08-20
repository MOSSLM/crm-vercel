// /api/agent/campagnes — où en sont SES prospects. Lecture seule, et c'est le sujet.
//
// UN AGENT NE CONÇOIT PAS D'AUDIENCE. Pas de constructeur, pas de segment, pas
// de délivrabilité, aucune écriture : c'est la décision qui garde son écran
// lisible, et c'est aussi ce qui rend cette route sûre — elle ne peut rien
// casser, donc elle peut tout montrer.
//
// CE QU'ELLE MONTRE, ET POURQUOI CE DÉCOUPAGE
// Un agent regarde une campagne pour trois raisons, et une seule est le total :
//   · combien de ses prospects y sont — le dénominateur ;
//   · combien AVANCENT, et quand tombe la prochaine échéance ;
//   · combien sont GARÉS, et pour quel motif. C'est le plus important, et
//     c'est précisément ce que personne ne voyait quand 59 inscriptions
//     dormaient sans date de réveil. Un agent qui ne voit pas ses gelées croit
//     que sa campagne travaille.
//
// LES SORTIES SONT COMPTÉES À PART, PAR MOTIF. « Sorti » ne veut rien dire
// seul : un prospect pas intéressé et un prospect injoignable ne se
// retravaillent pas de la même façon (`sortieARedemarcher`).
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { readReplies } from '@/lib/automations/week'
import { holdReasonLabel, type HoldReason } from '@/lib/automations/regulator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Garde-fou, pas pagination. S'il mord, la route le DIT. */
const PLAFOND = 4000

type Inscription = {
  id: string
  automation_id: string | null
  entreprise_id: number | null
  status: string | null
  hold_reason: string | null
  exit_reason: string | null
  next_run_at: string | null
  send_at: string | null
  vars: unknown
}

export const GET = withAuth({ role: 'freelance' }, async ({ user, cors }) => {
  const sb = getServiceClient()

  // Les entreprises de l'agent d'abord : c'est le filtre, et il est court
  // (908 fiches attribuées en tout, réparties entre deux propriétaires).
  const { data: miennes, error: eEnt } = await sb
    .from('entreprises')
    .select('id, name')
    .eq('owner_id', user.id)
    .limit(PLAFOND)

  if (eEnt) return jsonError(eEnt.message, 500, {}, cors)

  const nomEntreprise = new Map<number, string>()
  for (const e of miennes ?? []) nomEntreprise.set(e.id as number, (e.name as string | null) ?? '—')
  const ids = [...nomEntreprise.keys()]

  // AUCUNE ENTREPRISE N'EST UNE RÉPONSE, PAS UNE PANNE. Sans ce court-circuit,
  // un `in()` vide rendrait une erreur PostgREST que l'écran lirait comme un
  // échec de lecture — et un agent qui n'a pas encore de portefeuille verrait
  // « les campagnes n'ont pas pu être lues » au lieu de « on ne vous a encore
  // attribué personne ».
  if (ids.length === 0) {
    return json({ campagnes: [], sansPortefeuille: true, tronque: false }, { headers: cors })
  }

  const { data: brutes, error: eInsc } = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, entreprise_id, status, hold_reason, exit_reason, next_run_at, send_at, vars')
    .in('entreprise_id', ids)
    .limit(PLAFOND)

  if (eInsc) return jsonError(eInsc.message, 500, {}, cors)

  const inscriptions = (brutes ?? []) as unknown as Inscription[]

  const idsCampagnes = [...new Set(inscriptions.map((i) => i.automation_id).filter(Boolean))] as string[]
  const { data: campagnes } = idsCampagnes.length
    ? await sb.from('automations').select('id, name, status').in('id', idsCampagnes)
    : { data: [] as { id: string; name: string | null; status: string | null }[] }

  const fiche = new Map<string, { nom: string; statut: string }>()
  for (const c of (campagnes ?? []) as { id: string; name: string | null; status: string | null }[]) {
    fiche.set(c.id, { nom: c.name?.trim() || 'Sans nom', statut: c.status ?? 'draft' })
  }

  type Bilan = {
    id: string
    nom: string
    statut: string
    total: number
    actives: number
    garees: number
    sorties: number
    ontRepondu: number
    prochaine: string | null
    motifs: { motif: string; libelle: string; sansReveil: boolean; combien: number; exemples: string[] }[]
  }

  type Groupe = { combien: number; exemples: string[]; motif?: string | null; reveil?: string | null }

  const parCampagne = new Map<string, Bilan>()
  const motifs = new Map<string, Map<string, Groupe>>()

  for (const i of inscriptions) {
    const cid = i.automation_id
    if (!cid) continue
    const f = fiche.get(cid) ?? { nom: 'Campagne inconnue', statut: 'draft' }
    const b =
      parCampagne.get(cid) ??
      ({ id: cid, nom: f.nom, statut: f.statut, total: 0, actives: 0, garees: 0, sorties: 0, ontRepondu: 0, prochaine: null, motifs: [] } as Bilan)

    b.total += 1
    // LA PREUVE DE RÉPONSE VIT DANS `vars.replies`, ET NULLE PART AILLEURS.
    if (Object.keys(readReplies(i.vars)).length > 0) b.ontRepondu += 1

    const vivante = i.status === 'active' || i.status === 'paused'
    if (!vivante) {
      b.sorties += 1
    } else if (i.hold_reason) {
      // GARÉE, ET LE MOTIF NE SUFFIT PAS À LA DÉCRIRE.
      //
      // `holdReasonLabel` prend une DATE DE RÉVEIL en second argument, et c'est
      // elle qui distingue les deux cas d'`awaiting_reply` : « relance prévue »
      // (l'attente se termine toute seule) et « attente sans limite — rien ne
      // la réveillera » (l'impasse qui a fait dormir 59 inscriptions). Grouper
      // sur le seul `hold_reason` écraserait les deux dans le pire libellé, et
      // l'écran annoncerait 70 impasses là où il y en a une trentaine.
      //
      // La clé de regroupement est donc le motif ET la présence d'un réveil.
      b.garees += 1
      const parMotif = motifs.get(cid) ?? new Map()
      const reveil = i.next_run_at ?? i.send_at
      const cle = `${i.hold_reason}|${reveil ? 'reveil' : 'sans'}`
      const e = parMotif.get(cle) ?? { combien: 0, exemples: [] }
      e.combien += 1
      e.motif = i.hold_reason
      e.reveil = reveil
      if (e.exemples.length < 3 && i.entreprise_id != null) {
        const nom = nomEntreprise.get(i.entreprise_id)
        if (nom) e.exemples.push(nom)
      }
      parMotif.set(cle, e)
      motifs.set(cid, parMotif)
    } else {
      b.actives += 1
      const quand = i.next_run_at ?? i.send_at
      if (quand && (b.prochaine === null || quand < b.prochaine)) b.prochaine = quand
    }

    parCampagne.set(cid, b)
  }

  for (const [cid, parMotif] of motifs) {
    const b = parCampagne.get(cid)
    if (!b) continue
    b.motifs = [...parMotif.values()]
      .map((e) => ({
        motif: e.motif ?? 'inconnu',
        // Le libellé français des 18 motifs du régulateur — écrit une seule
        // fois, dans `regulator.ts`. Un motif brut (`awaiting_reply`) affiché
        // à un agent est un motif qu'il ne peut pas expliquer au prospect.
        //
        // Le second argument est la date de réveil : sans lui, `awaiting_reply`
        // rend TOUJOURS le libellé de l'impasse.
        libelle: holdReasonLabel(
          (e.motif ?? null) as HoldReason | null,
          e.reveil ? Date.parse(e.reveil) : null,
        ),
        // Une garée sans réveil ne repartira JAMAIS toute seule : c'est la
        // seule ligne sur laquelle un agent doit agir aujourd'hui.
        sansReveil: !e.reveil,
        combien: e.combien,
        exemples: e.exemples,
      }))
      .sort((a, b2) => b2.combien - a.combien)
  }

  return json(
    {
      campagnes: [...parCampagne.values()].sort((a, b) => b.total - a.total),
      sansPortefeuille: false,
      tronque: inscriptions.length >= PLAFOND,
    },
    { headers: cors },
  )
})
