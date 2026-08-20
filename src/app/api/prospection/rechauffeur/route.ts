// /api/prospection/rechauffeur — l'état de la chauffe, en un appel.
//
// LA QUESTION À LAQUELLE CETTE ROUTE RÉPOND : « où en est mon domaine, et
// combien puis-je démarcher aujourd'hui sans l'abîmer ? »
//
// Elle ne calcule rien elle-même : tout vient des modules purs (`courbe`,
// `sante`, `appariement`), qui sont testés. Ici on ne fait que lire la base et
// leur passer les chiffres — c'est ce qui garantit que l'écran et le moteur
// disent la même chose, puisqu'ils appellent les mêmes fonctions.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { jourDeChauffe, palierDuJour, coefficientDuJour } from '@/lib/rechauffeur/courbe'
import { capacite, sante } from '@/lib/rechauffeur/sante'
import { capaciteDuMaillage, famillesManquantes } from '@/lib/rechauffeur/appariement'
import { disponible } from '@/lib/rechauffeur/coffre'
import {
  chargerExpediteurs,
  chargerTemoins,
  glissant7Jours,
} from '@/lib/rechauffeur/rechauffeur-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'admin' }, async () => {
  const sb = getServiceClient()

  let expediteurs, temoins
  try {
    // Tous les expéditeurs, pas seulement ceux en chauffe : un expéditeur en
    // pause est précisément ce que l'écran doit montrer, avec son motif.
    ;[expediteurs, temoins] = await Promise.all([
      chargerExpediteurs(sb, false),
      chargerTemoins(sb),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    if (/rechauffe_/.test(message)) {
      return jsonError('Migration absente : appliquer sql/20260819_rechauffeur.sql', 503)
    }
    return jsonError(message, 500)
  }

  const { data: maillage } = await sb
    .from('v_rechauffe_maillage')
    .select('*')
    .order('famille')

  const chargeDuJour: Record<string, number> = {}
  for (const t of maillage ?? []) chargeDuJour[String(t.id)] = Number(t.recus_aujourdhui ?? 0)

  const maintenant = new Date()
  const lignes = await Promise.all(
    expediteurs.map(async (e) => {
      const jour = jourDeChauffe(e.demarreLe, maintenant)
      const glissant = await glissant7Jours(sb, e.id, maintenant)
      const etat = sante(glissant)
      const palier = palierDuJour(Math.max(1, jour), e.cibleJour)
      const coefficient = coefficientDuJour(maintenant)

      return {
        id: e.id,
        email: e.email,
        nom: e.nom,
        domaineSignant: e.domaineSignant,
        statut: e.statut,
        demarreLe: e.demarreLe,
        jour,
        cibleJour: e.cibleJour,
        fenetre: e.fenetre,
        coefficient,
        // Le palier théorique du jour, avant le coefficient de week-end.
        viseAujourdHui: jour > 0 ? Math.round(palier.chauffe * coefficient) : 0,
        glissant,
        sante: etat,
        capacite:
          jour > 0
            ? capacite({
                jourDeChauffe: jour,
                cibleQuotidienne: e.cibleJour,
                plafondDur: e.plafondProspection,
                sante: etat,
              })
            : null,
      }
    }),
  )

  return json({
    expediteurs: lignes,
    maillage: maillage ?? [],
    capaciteMaillage: capaciteDuMaillage(temoins, chargeDuJour),
    famillesManquantes: famillesManquantes(temoins),
    temoinsActifs: temoins.filter((t) => t.actif).length,
    // La moitié qui manque, dite par la route plutôt que devinée par l'écran.
    mesurePossible: (maillage ?? []).some((t) => t.peut_lire),
    // Sans clé, le formulaire ne doit même pas proposer de saisir un mot de
    // passe : mieux vaut le dire avant qu'après.
    coffrePret: disponible(),
  })
})
