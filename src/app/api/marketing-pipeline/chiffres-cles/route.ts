// /api/marketing-pipeline/chiffres-cles — combler l'ancienneté par le calcul.
//
// POURQUOI CETTE ROUTE EXISTE. Les années d'expérience sont, de loin, la
// variable qui manque le plus après un enrichissement : **564 dossiers sur 882
// au 20/08/2026**. Et l'enrichissement la cherche pourtant — dans le texte du
// site du prospect, avec un LLM. Or 352 de ces 564 portent DÉJÀ en base la date
// d'immatriculation de l'entreprise : on payait un modèle pour deviner ce
// qu'une soustraction donne exactement.
//
// ELLE NE VA RIEN CHERCHER. Aucun appel sortant, aucun crédit d'IA, aucune
// fiche modifiée hors des trois chiffres du dossier lead magnet. Elle lit ce
// que le registre a déjà donné et applique le barème — donc elle est rejouable
// autant de fois qu'on veut, et elle ne fabrique rien pour les fiches sans date
// de création : celles-là relèvent du LISSAGE, qui va chercher le SIRET puis la
// date. Les deux boutons de la barre de sélection se répondent dans cet ordre.
import { z } from 'zod'

import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { ancienneteDouteuse, patchChiffresCles } from '@/lib/enrichment/chiffres-cles'

export const runtime = 'nodejs'
// Un `UPDATE` par dossier, jusqu'à mille : c'est rapide (aucun appel sortant)
// mais ce sont mille allers-retours. Sans cette ligne, un lot du parc entier
// tombe sur la limite par défaut de Vercel — et l'écran verrait un échec là où
// la moitié des lignes ont pourtant été écrites.
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le plafond d'un lot. Au-delà, ce n'est plus un geste, c'est un backfill. */
const PLAFOND = 1000

/**
 * Combien d'identifiants par lecture.
 *
 * ⚠️ TROUVÉ EN PRODUISANT UNE 500, PAS EN RELISANT LE CODE. Un `in` de 877 UUID
 * fait une URL de plus de trente kilo-octets, et PostgREST répond « Bad
 * Request » — sans dire pourquoi. Un UUID coûte une quarantaine d'octets une
 * fois encodé ; deux cents en font huit kilos, ce qui passe partout. Les
 * identifiants d'entreprise sont numériques et bien plus courts, d'où les deux
 * tailles.
 */
const PAR_LECTURE_UUID = 200
const PAR_LECTURE_ENTIER = 500

/** Découper une liste en tranches lisibles d'un seul `in`. */
function tranches<T>(liste: readonly T[], taille: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille))
  return out
}

const Demande = z.object({
  project_ids: z.array(z.string()).min(1).max(PLAFOND),
})

const COLONNES =
  'id, entreprise_id, stat_years_experience, stat_satisfied_clients, stat_installations_completed'
/** Chiffres confirmés par le client — migration 20260805, appliquée à la main. */
const COLONNES_OFFICIELLES =
  'stat_years_experience_official, stat_satisfied_clients_official, ' +
  'stat_installations_completed_official'

type LigneProjet = {
  id: string
  entreprise_id: number | null
  stat_years_experience: string | null
  stat_satisfied_clients: string | null
  stat_installations_completed: string | null
  stat_years_experience_official?: string | null
  stat_satisfied_clients_official?: string | null
  stat_installations_completed_official?: string | null
}

export const POST = withAuth({ role: 'admin', body: Demande }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const ids = [...new Set(body.project_ids)]

  // Les colonnes « officielles » viennent d'une migration appliquée à la main :
  // elles peuvent manquer. On DÉGRADE plutôt que d'échouer — mais sans elles on
  // ne saurait pas distinguer un chiffre confirmé d'une case vide, donc on ne
  // peut plus les respecter. Le repli est le même que celui du board.
  let projets: LigneProjet[] = []
  let officiellesLues = true
  {
    let derniere: string | null = null
    let lu = false
    for (const select of [`${COLONNES}, ${COLONNES_OFFICIELLES}`, COLONNES]) {
      const lot: LigneProjet[] = []
      let echoue = false
      for (const tranche of tranches(ids, PAR_LECTURE_UUID)) {
        const res = await sb.from('lead_magnet_projects').select(select).in('id', tranche)
        if (res.error) {
          derniere = res.error.message
          echoue = true
          break
        }
        lot.push(...((res.data ?? []) as unknown as LigneProjet[]))
      }
      if (echoue) {
        officiellesLues = false
        continue
      }
      projets = lot
      lu = true
      break
    }
    if (!lu) return jsonError(derniere ?? 'lecture des dossiers impossible', 500, {}, cors)
  }

  const entIds = [
    ...new Set(projets.map((p) => p.entreprise_id).filter((v): v is number => v != null)),
  ]

  // Le registre : `date_creation` vit dans `entreprises_donnees_publiques`, et
  // NULLE PART AILLEURS. Les colonnes d'`entreprises` qui en ont l'air sont de
  // la prose libre, presque toujours nulle.
  const dates = new Map<number, string | null>()
  const avis = new Map<number, number | null>()
  for (const tranche of tranches(entIds, PAR_LECTURE_ENTIER)) {
    const [dp, ent] = await Promise.all([
      sb
        .from('entreprises_donnees_publiques')
        .select('entreprise_id, date_creation')
        .in('entreprise_id', tranche),
      sb.from('entreprises').select('id, nombre_avis').in('id', tranche),
    ])
    if (dp.error) return jsonError(dp.error.message, 500, {}, cors)
    if (ent.error) return jsonError(ent.error.message, 500, {}, cors)
    for (const r of (dp.data ?? []) as { entreprise_id: number; date_creation: string | null }[]) {
      dates.set(Number(r.entreprise_id), r.date_creation)
    }
    for (const r of (ent.data ?? []) as { id: number; nombre_avis: number | null }[]) {
      avis.set(Number(r.id), r.nombre_avis)
    }
  }

  const maintenant = new Date()
  const now = maintenant.toISOString()
  let completes = 0
  let deja = 0
  let sansDate = 0
  /**
   * Les dossiers dont l'ANCIENNETÉ AFFICHÉE est indéfendable au regard du
   * registre — 7 au 20/08, dont « 100 ans » pour une entreprise immatriculée en
   * 2024. La route ne les corrige pas : la règle veut qu'une revendication du
   * site l'emporte sur le registre, et trancher « revendication » contre
   * « chiffre cassé » demande un œil. Mais elle les COMPTE, sinon ce défaut
   * n'apparaîtrait nulle part.
   */
  const anciennetesDouteuses: string[] = []
  const echecs: { project_id: string; error: string }[] = []

  for (const p of projets) {
    const matiere = {
      dateCreation: p.entreprise_id != null ? (dates.get(p.entreprise_id) ?? null) : null,
      nombreAvis: p.entreprise_id != null ? (avis.get(p.entreprise_id) ?? null) : null,
    }
    const poses = {
      annees: p.stat_years_experience,
      clients: p.stat_satisfied_clients,
      installations: p.stat_installations_completed,
      anneesOfficiel: p.stat_years_experience_official ?? null,
      clientsOfficiel: p.stat_satisfied_clients_official ?? null,
      installationsOfficiel: p.stat_installations_completed_official ?? null,
    }
    if (ancienneteDouteuse(matiere, poses, maintenant)) anciennetesDouteuses.push(p.id)
    const patch = patchChiffresCles(matiere, poses, maintenant)
    if (!patch) {
      // DEUX SILENCES DIFFÉRENTS, ET C'EST TOUT L'INTÉRÊT DU COMPTE. « Déjà
      // complet » ne demande rien ; « pas de date au registre » demande un
      // lissage. Les fondre donnerait un chiffre sur lequel on ne saurait pas
      // quoi faire — la même faute que les 448 « sites faibles » du 16/08.
      const aUneDate = p.entreprise_id != null && !!dates.get(p.entreprise_id)
      if (aUneDate) deja += 1
      else sansDate += 1
      continue
    }
    const { error } = await sb
      .from('lead_magnet_projects')
      .update({ ...patch, updated_at: now })
      .eq('id', p.id)
    if (error) echecs.push({ project_id: p.id, error: error.message })
    else completes += 1
  }

  return json(
    {
      completes,
      deja,
      sansDate,
      anciennetes_douteuses: anciennetesDouteuses.length,
      echecs,
      // Les dossiers demandés qui n'ont pas été retrouvés — une opportunité
      // dont le projet a disparu entre le chargement du board et le clic.
      introuvables: ids.length - projets.length,
      // Sans les colonnes confirmées, on a écrit en ne regardant que les
      // estimations : c'est prudent mais moins juste, et ça se dit.
      officielles_lues: officiellesLues,
    },
    { headers: cors },
  )
})
