// /api/prospection/assistant — une phrase, une campagne à valider.
//
// LA ROUTE MESURE, LE MODULE DÉCIDE. Les densités sont relevées ICI, à chaque
// appel, et passées à `proposer` : les figer dans le code les daterait du
// 20/08/2026, et une proposition qui s'appuie sur des chiffres périmés est
// exactement le genre de conseil qu'on suit sans le vérifier.
//
// ELLE NE CRÉE RIEN. Pas de campagne, pas d'inscription, pas de message : elle
// rend une PROPOSITION. Créer reste le geste de l'écran de campagne, qui a déjà
// sa revue avant lancement — et c'est ce qui fait qu'un assistant qui se trompe
// coûte une relecture, pas un envoi.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { collecterCanaux } from '@/lib/prospects/canal'
import { lireLObjectif, proposer, type Densites } from '@/lib/prospection/assistant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Garde-fou de lecture. Le portefeuille fait 908 fiches ; s'il mord, on le dit. */
const PLAFOND = 5000

const Demande = z.object({
  objectif: z.string().trim().min(1).max(300),
})

type LigneEntreprise = {
  id: number
  email: string | null
  telephone: string | null
  telephones: string[] | null
  cohorte_demarchage: string | null
  premiere_touche_le: string | null
}

export const POST = withAuth({ role: 'admin', body: Demande }, async ({ body, cors }) => {
  const sb = getServiceClient()

  const { data, error } = await sb
    .from('entreprises')
    .select('id, email, telephone, telephones, cohorte_demarchage, premiere_touche_le')
    .not('owner_id', 'is', null)
    .limit(PLAFOND)

  if (error) return jsonError(error.message, 500, {}, cors)

  const entreprises = (data ?? []) as unknown as LigneEntreprise[]
  const ids = entreprises.map((e) => e.id)

  // Les contacts nominatifs : un NOM et une ADRESSE. C'est ce chiffre — 75 sur
  // 908 au 20/08 — qui interdit de proposer une séquence nominative en tête du
  // catalogue, et il ne se déduit pas de la fiche entreprise.
  const nominatifs = new Set<number>()
  if (ids.length) {
    const { data: contacts } = await sb
      .from('contacts')
      .select('entreprise_id, first_name, last_name, email')
      .in('entreprise_id', ids)
      .not('email', 'is', null)
      .limit(PLAFOND * 2)
    for (const c of (contacts ?? []) as {
      entreprise_id: number | null
      first_name: string | null
      last_name: string | null
      email: string | null
    }[]) {
      const nomme = Boolean(c.first_name?.trim() || c.last_name?.trim())
      if (nomme && c.email?.trim() && c.entreprise_id != null) nominatifs.add(c.entreprise_id)
    }
  }

  const densites: Densites = {
    total: entreprises.length,
    avecEmail: 0,
    avecMobile: 0,
    avecFixe: 0,
    contactNominatif: nominatifs.size,
    cohorteA: 0,
    cohorteB: 0,
    jamaisTouches: 0,
  }

  for (const e of entreprises) {
    // `collecterCanaux` est LA lecture des canaux du CRM. La refaire ici
    // donnerait une seconde définition de « joignable », et les deux
    // divergeraient — c'est déjà la règle de `conditions-db.ts`.
    const canaux = collecterCanaux({
      entrepriseEmail: e.email,
      entrepriseTelephones: [e.telephone, ...(e.telephones ?? [])],
      contacts: [],
    })
    if (canaux.canaux.has('email')) densites.avecEmail += 1
    if (canaux.canaux.has('mobile')) densites.avecMobile += 1
    if (canaux.canaux.has('fixe')) densites.avecFixe += 1
    if (e.cohorte_demarchage === 'A_site_faible') densites.cohorteA += 1
    if (e.cohorte_demarchage === 'B_sans_site') densites.cohorteB += 1
    // `premiere_touche_le` est LA frontière entre le stock et le suivi — la
    // même que la file de démarchage, jamais une heuristique.
    if (!e.premiere_touche_le) densites.jamaisTouches += 1
  }

  const intention = lireLObjectif(body.objectif)
  const proposition = proposer(intention, densites)

  return json(
    {
      intention,
      proposition,
      densites,
      tronque: entreprises.length >= PLAFOND,
    },
    { headers: cors },
  )
})
