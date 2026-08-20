// /api/prospection/delivrabilite — l'état d'authentification de nos domaines.
//
// LA QUESTION À LAQUELLE CETTE ROUTE RÉPOND : « est-ce que ce qu'on envoie a
// une chance d'arriver ? » — avant même de parler de contenu, de rythme ou de
// réchauffage.
//
// DEUX DOMAINES, DEUX RÔLES, ET ON NE LES CONFOND PAS. Le CRM envoie par Resend
// depuis `contact@samadigitalstudio.fr` ; les réponses arrivent dans les boîtes
// de `samadigitalstudio.com`, chez LWS. Les deux ne se contrôlent pas de la
// même façon, et surtout : ce qui est bon pour l'un serait une faute pour
// l'autre. Le SPF du `.com` se termine par `-all` SANS Resend — envoyer depuis
// une adresse `.com` par Resend, c'est un échec SPF garanti, donc la
// quarantaine annoncée par son propre DMARC. La tentation d'« aligner » les
// deux adresses est réelle ; cette route est là pour qu'on voie pourquoi non.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { resolveurSysteme, verifierDomaine } from '@/lib/email/dns-delivrabilite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le domaine d'une adresse, en minuscules. `null` si l'adresse n'en porte pas. */
const domaineDe = (adresse: string | null | undefined): string | null => {
  const m = /@([^>\s]+)/.exec((adresse ?? '').trim())
  return m ? m[1].toLowerCase() : null
}

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sc = getServiceClient()

  const { data: connexion } = await sc
    .from('automation_connections')
    .select('config')
    .eq('id', 'resend')
    .maybeSingle()
  const config = ((connexion as { config: Record<string, string> } | null)?.config ?? {}) as Record<string, string>

  const expediteur = process.env.RESEND_FROM_EMAIL ?? null
  const reponse = config.reply_to ?? process.env.RESEND_REPLY_TO ?? null

  const domaineEnvoi = domaineDe(expediteur)
  const domaineReception = domaineDe(reponse)

  const resolveur = resolveurSysteme()
  const [envoi, reception] = await Promise.all([
    domaineEnvoi ? verifierDomaine(resolveur, domaineEnvoi, { role: 'envoi' }) : null,
    // Le domaine des boîtes ne passe pas par Resend : pas de sous-domaine
    // d'enveloppe à chercher, son SPF doit tenir sur sa racine.
    domaineReception && domaineReception !== domaineEnvoi
      ? verifierDomaine(resolveur, domaineReception, { role: 'reception', sousDomaineEnveloppe: null })
      : null,
  ])

  // Le régulateur porte les plafonds : les afficher ici évite d'aller les
  // chercher dans un autre écran pour comprendre ce qui limite les envois.
  const { data: reglages } = await sc
    .from('regulator_settings')
    .select('daily_cap, paused, bounce_guard, bounce_guard_threshold, verify_before_send, test_mode, canaux_suspendus')
    .eq('id', 'global')
    .maybeSingle()

  return json(
    {
      expediteur,
      adresseDeReponse: reponse,
      sousAdressage: /^(oui|true|1)$/i.test(config.reply_to_sous_adressage ?? ''),
      envoi,
      reception,
      reglages: reglages ?? null,
    },
    { headers: cors },
  )
})
