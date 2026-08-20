// /api/lissage/local — la porte de l'exécuteur local.
//
// POURQUOI CETTE ROUTE EXISTE, ET POURQUOI CE N'EST PAS UN AVEU D'ÉCHEC
// Onze des trente-trois bots du registre sont des scripts locaux : Playwright, un
// profil Chrome persistant, des CAPTCHA à contourner à l'œil. Rien de tout ça ne
// tient dans une fonction serverless, et ce n'est pas une limite à repousser —
// c'est la raison pour laquelle ces bots marchent. Matteo l'a posé lui-même :
// ceux-là peuvent n'être utilisables que quand il ouvre son localhost.
//
// La file, elle, vit en base. Cette route est le pont : le script réclame les
// étapes qui l'attendent, les fait, et rend ses constats.
//
//   GET  → réclame un lot d'étapes `local`, avec les faits nécessaires
//   POST → rend les constats, et remet les lignes dans la file
//
// CE QU'ELLE NE REND JAMAIS : les étapes `humain`. Elles attendent un écran, pas
// un script — « chercher et écrire sont deux scripts séparés », et l'écriture
// exige des ids relus. Un runner qui les prendrait écrirait sans relecture.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { preflight } from '@/app/api/_lib/cors'
import {
  candidatsDeLaFile,
  chargerFaits,
  enregistrerResultat,
  reclamerLot,
  type LigneFile,
} from '@/lib/lissage/passe-db'
import { outilParId } from '@/lib/lissage/passe'
import { MIGRATION, constatValide, migrationAbsente, secretPartageValide } from '../_lissage'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const cinqCentTrois = () =>
  jsonError('migration_non_appliquee', 503, {
    sql_file: MIGRATION,
    message: `${MIGRATION} n’est pas appliquée.`,
  })

export const GET = async (req: Request): Promise<Response> => {
  if (!secretPartageValide(req)) return json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const passeId = sp.get('passeId') ?? undefined
  const taille = Math.max(1, Math.min(Number(sp.get('taille')) || 20, 100))

  try {
    const sc = getServiceClient()
    const lignes = await reclamerLot(sc, {
      passeId,
      lieux: ['local'],
      par: `local:${sp.get('machine') ?? 'inconnue'}`,
      taille,
    })
    if (lignes.length === 0) return json({ items: [] })

    const faits = await chargerFaits(
      sc,
      lignes.map((l) => l.entrepriseId),
      candidatsDeLaFile(lignes),
    )

    // On rend TOUT ce dont le script a besoin pour travailler hors ligne : il ne
    // doit pas avoir à réinterroger la base, ni à connaître son schéma.
    const items = lignes.map((l) => ({
      ligneId: l.id,
      passeId: l.passeId,
      outil: l.outil,
      outilNom: l.outil ? (outilParId(l.outil)?.nom ?? l.outil) : null,
      tentes: l.tentes,
      dossier: l.dossier,
      prospect: faits.get(l.entrepriseId) ?? null,
    }))
    return json({ items })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return migrationAbsente(err) ? cinqCentTrois() : jsonError(err.message ?? 'erreur', 500)
  }
}

interface CompteRendu {
  ligneId?: number
  outil?: string
  constats?: unknown[]
  dossier?: Record<string, unknown>
  erreur?: string
}

export const POST = async (req: Request): Promise<Response> => {
  if (!secretPartageValide(req)) return json({ error: 'Unauthorized' }, { status: 401 })

  let corps: { comptes?: CompteRendu[] }
  try {
    corps = (await req.json()) as { comptes?: CompteRendu[] }
  } catch {
    return jsonError('corps_illisible', 400)
  }
  const comptes = Array.isArray(corps?.comptes) ? corps.comptes.slice(0, 200) : []
  if (comptes.length === 0) return jsonError('rien_a_enregistrer', 400)

  const sc = getServiceClient()
  const ids = comptes.map((c) => Number(c.ligneId)).filter((n) => Number.isFinite(n))

  // On relit les lignes plutôt que de croire le corps sur parole : `tentes` et
  // `dossier` doivent être fusionnés à partir de ce que la BASE porte, pas de ce
  // que le script croit qu'elle porte. Sinon deux exécuteurs se marchent dessus.
  const { data, error } = await sc
    .from('lissage_leads')
    .select('id, passe_id, entreprise_id, statut, outil, lieu, tentes, motif, dossier, tentatives')
    .in('id', ids)
  if (error) {
    return migrationAbsente(error) ? cinqCentTrois() : jsonError(error.message, 500)
  }
  const parId = new Map(
    (data ?? []).map((r) => {
      const b = r as Record<string, unknown>
      const l: LigneFile = {
        id: Number(b.id),
        passeId: String(b.passe_id),
        entrepriseId: Number(b.entreprise_id),
        statut: b.statut as LigneFile['statut'],
        outil: (b.outil as string | null) ?? null,
        lieu: (b.lieu as LigneFile['lieu']) ?? null,
        tentes: (b.tentes as string[] | null) ?? [],
        motif: (b.motif as string | null) ?? null,
        dossier: (b.dossier as Record<string, unknown> | null) ?? {},
        tentatives: Number(b.tentatives ?? 0),
      }
      return [l.id, l]
    }),
  )

  let enregistres = 0
  const ignores: number[] = []
  for (const c of comptes) {
    const ligne = parId.get(Number(c.ligneId))
    // Une ligne inconnue, ou dont l'outil n'est pas celui qu'on avait posé :
    // on refuse plutôt que d'écrire un constat au nom d'un outil qui n'a
    // jamais tourné dessus.
    const outil = typeof c.outil === 'string' ? c.outil : ligne?.outil
    if (!ligne || !outil) {
      if (c.ligneId != null) ignores.push(Number(c.ligneId))
      continue
    }
    const constats = (c.constats ?? []).map(constatValide).filter((x) => x !== null)
    await enregistrerResultat(sc, ligne, {
      outil,
      constats,
      dossier: c.dossier,
      erreur: typeof c.erreur === 'string' ? c.erreur : undefined,
    })
    enregistres += 1
  }
  return json({ enregistres, ignores })
}
