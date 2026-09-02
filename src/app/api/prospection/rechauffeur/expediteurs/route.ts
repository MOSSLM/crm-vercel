// /api/prospection/rechauffeur/expediteurs — déclarer une adresse d'envoi, et
// DÉMARRER sa chauffe.
//
// ── POURQUOI CETTE ROUTE N'EXISTAIT PAS, ET CE QUE ÇA COÛTAIT ────────────
// L'écran du réchauffeur savait ajouter des TÉMOINS (les boîtes qui reçoivent)
// et rien d'autre. L'expéditeur — l'adresse qu'on chauffe — n'avait aucune
// porte : il fallait l'insérer à la main en SQL, puis y repasser pour poser
// `statut` et `demarre_le`. Personne ne le savait, donc personne ne l'a fait :
// au 02/09/2026, la seule ligne de `rechauffe_expediteurs` était encore
// `en_pause` avec `demarre_le` nul, quatorze jours après sa création.
//
// LES DEUX COLONNES SONT DES INTERRUPTEURS INDÉPENDANTS, et c'est ce qui rend
// le silence si complet quand l'une manque :
//   · `chargerExpediteurs` ne rend QUE les `statut = 'chauffe'` ;
//   · `jourDeChauffe(null)` rend 0, et `planifierJournee` sort aussitôt.
// Un expéditeur `chauffe` sans date, ou daté mais en pause, ne produit donc
// rien — sans la moindre erreur nulle part. D'où « démarrer » comme un seul
// geste, qui pose les deux à la fois : c'est la seule combinaison qui travaille.
//
// ── LA DATE DE DÉMARRAGE NE SE REMET PAS À ZÉRO ──────────────────────────
// Reprendre après une pause GARDE la date d'origine : la courbe mesure
// l'ancienneté de la boîte aux yeux des filtres, pas notre assiduité. La
// repousser ferait redescendre un domaine chauffé depuis trois semaines au
// palier du premier jour — et ferait mentir `capacite()`, qui autorise la
// prospection sur ce nombre. Repartir de zéro se demande explicitement
// (`redemarrer: true`), pour que ce soit un choix et jamais un effet de bord.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le domaine de l'adresse, à défaut de domaine signant explicite. */
const domaineDe = (email: string): string => email.split('@')[1]?.toLowerCase() ?? ''

const Expediteur = z.object({
  email: z.string().email(),
  nom: z.string().trim().min(1).max(80),
  /**
   * Le domaine qui SIGNE (`d=`), pas celui de l'adresse. Chez nous les deux
   * coïncident — d'où le défaut — mais l'un ne vaut pas l'autre : c'est le
   * signant que le filtre indexe.
   */
  domaineSignant: z.string().trim().min(3).max(120).optional(),
  cibleJour: z.number().int().min(1).max(200).optional().default(40),
  plafondProspection: z.number().int().min(0).max(500).optional().default(50),
  fenetreDe: z.number().int().min(0).max(23).optional().default(8),
  fenetreA: z.number().int().min(1).max(24).optional().default(19),
})

export const POST = withAuth({ role: 'admin', body: Expediteur }, async ({ body: e, cors }) => {
  if (e.fenetreA <= e.fenetreDe) {
    return jsonError('La fenêtre d’envoi doit se terminer après son début.', 400, {}, cors)
  }

  const sb = getServiceClient()
  const { error } = await sb.from('rechauffe_expediteurs').upsert(
    {
      email: e.email.toLowerCase(),
      nom: e.nom,
      domaine_signant: (e.domaineSignant ?? domaineDe(e.email)).toLowerCase(),
      cible_jour: e.cibleJour,
      plafond_prospection: e.plafondProspection,
      fenetre_de: e.fenetreDe,
      fenetre_a: e.fenetreA,
    },
    { onConflict: 'email' },
  )
  if (error) {
    if (/rechauffe_expediteurs/.test(error.message) && /does not exist|relation/i.test(error.message)) {
      return jsonError('migration_non_appliquee', 503, { sql_file: 'sql/20260819_rechauffeur.sql' }, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }

  // Créé EN PAUSE, toujours. Déclarer une adresse et lancer son courrier sont
  // deux décisions : la première se corrige, la seconde part chez de vraies
  // boîtes et construit un historique qu'on ne réécrit pas.
  return json({ ok: true, email: e.email.toLowerCase() }, { headers: cors })
})

const Reglage = z.object({
  id: z.string().uuid(),
  /** Le seul geste qui met vraiment la chauffe en marche : statut + date. */
  demarrer: z.boolean().optional(),
  /** Repartir au jour 1 — explicite, jamais déduit d'une reprise. */
  redemarrer: z.boolean().optional(),
  statut: z.enum(['en_pause', 'chauffe', 'entretien']).optional(),
  cibleJour: z.number().int().min(1).max(200).optional(),
  plafondProspection: z.number().int().min(0).max(500).optional(),
  fenetreDe: z.number().int().min(0).max(23).optional(),
  fenetreA: z.number().int().min(1).max(24).optional(),
})

export const PATCH = withAuth({ role: 'admin', body: Reglage }, async ({ body, cors }) => {
  const sb = getServiceClient()

  const { data: avant, error: lecture } = await sb
    .from('rechauffe_expediteurs')
    .select('id, email, statut, demarre_le')
    .eq('id', body.id)
    .maybeSingle()
  if (lecture) return jsonError(lecture.message, 500, {}, cors)
  if (!avant) return jsonError('Expéditeur introuvable.', 404, {}, cors)

  const maj: Record<string, unknown> = {}
  if (body.cibleJour != null) maj.cible_jour = body.cibleJour
  if (body.plafondProspection != null) maj.plafond_prospection = body.plafondProspection
  if (body.fenetreDe != null) maj.fenetre_de = body.fenetreDe
  if (body.fenetreA != null) maj.fenetre_a = body.fenetreA
  if (body.statut) maj.statut = body.statut

  if (body.demarrer) {
    maj.statut = 'chauffe'
    // `demarre_le` est le repère de la COURBE, pas la trace du dernier clic :
    // on ne la repose que si elle manque, ou si on demande explicitement à
    // repartir du premier jour.
    if (!avant.demarre_le || body.redemarrer) {
      maj.demarre_le = new Date().toISOString().slice(0, 10)
    }
    // Une reprise efface le motif d'arrêt : le laisser afficherait sur l'écran
    // une panne qu'on vient de corriger.
    maj.derniere_erreur = null
  }

  if (Object.keys(maj).length === 0) return jsonError('Rien à modifier.', 400, {}, cors)

  const { data: apres, error } = await sb
    .from('rechauffe_expediteurs')
    .update(maj)
    .eq('id', body.id)
    .select('email, statut, demarre_le')
    .maybeSingle()
  if (error) return jsonError(error.message, 500, {}, cors)

  return json(
    { ok: true, email: apres?.email ?? avant.email, statut: apres?.statut, demarreLe: apres?.demarre_le },
    { headers: cors },
  )
})

export const DELETE = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return jsonError('id requis', 400, {}, cors)

  // Même règle que pour les témoins : ce qui a une histoire s'éteint, ce qui
  // n'en a pas se retire. `rechauffe_messages` part en cascade avec
  // l'expéditeur, et l'historique de placement des sept jours — celui sur
  // lequel `sante()` décide de monter le palier — changerait rétroactivement.
  const sb = getServiceClient()
  const { count } = await sb
    .from('rechauffe_messages')
    .select('id', { count: 'exact', head: true })
    .eq('expediteur_id', id)

  if ((count ?? 0) > 0) {
    await sb.from('rechauffe_expediteurs').update({ statut: 'en_pause' }).eq('id', id)
    return json({ ok: true, eteint: true, messages: count }, { headers: cors })
  }

  const { error } = await sb.from('rechauffe_expediteurs').delete().eq('id', id)
  if (error) return jsonError(error.message, 500, {}, cors)
  return json({ ok: true, eteint: false }, { headers: cors })
})
