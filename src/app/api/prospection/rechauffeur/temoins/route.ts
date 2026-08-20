// /api/prospection/rechauffeur/temoins — brancher, éteindre, retirer un témoin.
//
// LE MOT DE PASSE NE TRANSITE QUE DANS UN SENS. Il arrive dans le corps de la
// requête, il est chiffré ici, et il n'est JAMAIS relu vers le navigateur : ni
// cette route ni la vue `v_rechauffe_maillage` n'exposent `secret_enc`. L'écran
// n'affiche qu'un booléen — « branché » ou non.
//
// ON REFUSE D'ÉCRIRE PLUTÔT QUE D'ÉCRIRE CE QU'ON NE SAURA PAS RELIRE. Si
// `RECHAUFFEUR_CLE` manque, la route rend 503 en nommant la variable, AVANT
// d'avoir rien enregistré. Sans cette garde, on rangerait un chiffré qu'aucune
// clé n'ouvre : la boîte paraîtrait branchée, ne le serait pas, et le mot de
// passe serait perdu — l'humain devrait le retrouver sans savoir qu'il le doit.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { disponible, sceller } from '@/lib/rechauffeur/coffre'
import { familleDuDomaine } from '@/lib/rechauffeur/appariement'
import { FAMILLES } from '@/lib/rechauffeur/sante'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const Temoin = z.object({
  email: z.string().email(),
  nom: z.string().trim().min(1).max(80),
  famille: z.enum(FAMILLES).optional(),
  /** Facultatif : sans lui, le témoin reçoit mais on ne mesure rien. */
  motDePasse: z.string().min(1).max(200).optional(),
  hote: z.string().trim().min(1).max(120).optional(),
  port: z.number().int().min(1).max(65535).optional().default(993),
  plafondJour: z.number().int().min(0).max(50).optional().default(8),
  repond: z.boolean().optional().default(true),
  tauxReponse: z.number().min(0).max(1).optional().default(0.4),
})

export const POST = withAuth({ role: 'admin', body: Temoin }, async ({ body: t, cors }) => {
  if (t.motDePasse && !disponible()) {
    return jsonError(
      'RECHAUFFEUR_CLE absente : le mot de passe ne serait pas relisible. ' +
        'La générer avec node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))" ' +
        'puis la poser dans les variables d’environnement.',
      503,
      {},
      cors,
    )
  }

  // Le mot de passe suppose un hôte : lire une boîte sans savoir où se
  // connecter n'a pas de sens, et laisser la valeur vide se verrait au premier
  // tick, pas ici.
  if (t.motDePasse && !t.hote) {
    return jsonError('Le serveur IMAP est requis avec un mot de passe.', 400, {}, cors)
  }

  const ligne: Record<string, unknown> = {
    email: t.email.toLowerCase(),
    nom: t.nom,
    famille: t.famille ?? familleDuDomaine(t.email),
    plafond_jour: t.plafondJour,
    repond: t.repond,
    taux_reponse: t.tauxReponse,
    actif: true,
  }
  if (t.motDePasse) {
    ligne.secret_enc = sceller({ motDePasse: t.motDePasse })
    ligne.config = { hote: t.hote, port: t.port }
    ligne.peut_lire = true
  }

  const sb = getServiceClient()
  const { error } = await sb.from('rechauffe_temoins').upsert(ligne, { onConflict: 'email' })
  if (error) {
    if (/rechauffe_temoins/.test(error.message) && /does not exist|relation/i.test(error.message)) {
      return jsonError('migration_non_appliquee', 503, { sql_file: 'sql/20260819_rechauffeur.sql' }, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }

  // On ne renvoie ni le secret, ni l'objet complet : juste de quoi rafraîchir.
  return json(
    { ok: true, email: ligne.email, famille: ligne.famille, branche: !!t.motDePasse },
    { headers: cors },
  )
})

const Bascule = z.object({ id: z.string().uuid(), actif: z.boolean() })

export const PATCH = withAuth({ role: 'admin', body: Bascule }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const { error } = await sb
    .from('rechauffe_temoins')
    .update({ actif: body.actif })
    .eq('id', body.id)
  if (error) return jsonError(error.message, 500, {}, cors)
  return json({ ok: true }, { headers: cors })
})

export const DELETE = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return jsonError('id requis', 400, {}, cors)

  // ON N'EFFACE PAS UN TÉMOIN QUI A DÉJÀ REÇU. Ses messages partiraient avec
  // lui (`on delete cascade`), et l'historique de placement des sept derniers
  // jours — celui sur lequel `sante()` décide de monter ou non le palier —
  // changerait rétroactivement. On l'éteint : il ne reçoit plus, il compte
  // encore.
  const sb = getServiceClient()
  const { count } = await sb
    .from('rechauffe_messages')
    .select('id', { count: 'exact', head: true })
    .eq('temoin_id', id)

  if ((count ?? 0) > 0) {
    await sb.from('rechauffe_temoins').update({ actif: false }).eq('id', id)
    return json({ ok: true, eteint: true, messages: count }, { headers: cors })
  }

  const { error } = await sb.from('rechauffe_temoins').delete().eq('id', id)
  if (error) return jsonError(error.message, 500, {}, cors)
  return json({ ok: true, eteint: false }, { headers: cors })
})
