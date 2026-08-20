// /api/lissage/passes/[id] — où en est cette passe, et sur quoi elle bute.
//
// LA COUVERTURE A QUATRE COLONNES, PAS TROIS. « inconnu » (on a regardé sans
// conclure) et « jamais regardé » (personne n'a regardé) sont deux travaux
// différents : le premier demande un autre outil, le second demande juste de
// lancer la passe. Les fondre donnerait un chiffre sur lequel on ne saurait pas
// quoi faire — et c'est exactement l'erreur des 448 « sites faibles » du 16/08,
// dont 431 étaient en réalité des fiches jamais mesurées.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import {
  avancementDePasse,
  candidatsDeLaFile,
  chargerFaits,
  planDe,
  rejouerPasse,
  type LigneFile,
} from '@/lib/lissage/passe-db'
import { couverture, outilParId } from '@/lib/lissage/passe'
import { MIGRATION, migrationAbsente } from '../../_lissage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le plafond de ce qu'on mesure d'un coup. Au-delà, la page ne s'ouvre plus. */
const PLAFOND = 2000

export const GET = withAuth<undefined, { id: string }>(
  { role: 'admin' },
  async ({ params, cors }) => {
    const sc = getServiceClient()

    const { data: brute, error: errPasse } = await sc
      .from('lissage_passes')
      .select('id, nom, criteres, plan, statut, cree_le')
      .eq('id', params.id)
      .maybeSingle()
    if (errPasse) {
      return migrationAbsente(errPasse)
        ? jsonError('migration_non_appliquee', 503, { sql_file: MIGRATION }, cors)
        : jsonError(errPasse.message, 500, {}, cors)
    }
    if (!brute) return jsonError('passe_introuvable', 404, {}, cors)

    const p = brute as {
      id: string
      nom: string
      criteres: Record<string, unknown>
      plan: unknown
      statut: string
      cree_le: string
    }
    const plan = planDe(p.plan)

    const { data: lignesBrutes, error: errLignes } = await sc
      .from('lissage_leads')
      .select('id, passe_id, entreprise_id, statut, outil, lieu, tentes, motif, dossier, tentatives')
      .eq('passe_id', p.id)
      .order('id', { ascending: true })
      .limit(PLAFOND)
    if (errLignes) return jsonError(errLignes.message, 500, {}, cors)

    const lignes: LigneFile[] = ((lignesBrutes ?? []) as Record<string, unknown>[]).map((b) => ({
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
    }))

    const faits = await chargerFaits(
      sc,
      lignes.map((l) => l.entrepriseId),
      candidatsDeLaFile(lignes),
    )

    // ON NE COMPTE QUE LES SUJETS DU PLAN. Afficher « RGE : 100 % jamais
    // regardé » sur une passe qui ne demande pas le RGE ferait passer pour un
    // manque ce qui n'a jamais été demandé.
    const couvertures = couverture([...faits.values()], plan.sujets)

    const items = lignes.map((l) => {
      const f = faits.get(l.entrepriseId)
      return {
        ligneId: l.id,
        entrepriseId: l.entrepriseId,
        nom: f?.nom ?? null,
        ville: f?.ville ?? null,
        statut: l.statut,
        outil: l.outil,
        outilNom: l.outil ? (outilParId(l.outil)?.nom ?? l.outil) : null,
        lieu: l.lieu,
        tentes: l.tentes,
        motif: l.motif,
        constats: f?.constats ?? {},
      }
    })

    return json(
      {
        passe: {
          id: p.id,
          nom: p.nom,
          criteres: p.criteres ?? {},
          plan,
          statut: p.statut,
          creeLe: p.cree_le,
        },
        avancement: await avancementDePasse(sc, p.id),
        couvertures,
        items,
        // Le plafond se DIT : une passe de 3 000 lignes affichée en silence sur
        // les 2 000 premières donnerait une couverture fausse sans le montrer.
        plafonne: lignes.length >= PLAFOND,
      },
      { headers: cors },
    )
  },
)

/**
 * POST — rejouer la passe.
 *
 * Ramène dans la file les lignes sorties en `sans_prise` ou en `erreur`, et
 * OUBLIE les outils déjà tentés sur elles. C'est le geste qui manquait : une
 * découverte en entraîne une autre — un SIRET tranché rend l'hydratation
 * possible, un dossier web ramené du poste local donne une fiche Google qui
 * déclare souvent le site — et rien ne ramenait les lignes déjà sorties.
 *
 * Sans danger, parce que les constats restent écrits : `prochaineEtape` ne
 * propose un outil que pour un sujet NON réglé. Rejouer ne rouvre que ce qui
 * manquait, et ne redépense rien sur ce qui est tranché.
 */
export const POST = withAuth<undefined, { id: string }>(
  { role: 'admin' },
  async ({ params, cors }) => {
    try {
      const { relancees } = await rejouerPasse(getServiceClient(), params.id)
      return json({ ok: true, relancees }, { headers: cors })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      return migrationAbsente(err)
        ? jsonError(
            'migration_non_appliquee',
            503,
            { sql_file: MIGRATION, message: `${MIGRATION} n’est pas appliquée.` },
            cors,
          )
        : jsonError(err.message ?? 'erreur', 500, {}, cors)
    }
  },
)
