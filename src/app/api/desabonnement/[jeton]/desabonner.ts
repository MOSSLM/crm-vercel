// desabonner.ts — l'écriture, partagée par les deux portes.
//
// Deux chemins mènent ici et ils n'ont pas le même déclencheur : le bouton de
// la page (un humain) et l'en-tête `List-Unsubscribe-Post` (son client de
// messagerie). Ils doivent produire exactement le même effet, d'où ce module
// unique — les faire diverger, c'est se retrouver avec un prospect désabonné
// d'un côté et pas de l'autre.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { inscriptionDepuisJeton } from '@/lib/email/desabonnement'
import { normalizeEmail } from '@/lib/email/verify/normalize'

export type Issue = 'fait' | 'jeton_invalide' | 'introuvable' | 'erreur'

/**
 * Retire l'adresse portée par ce jeton, et arrête sa séquence.
 *
 * DEUX ÉCRITURES, ET L'ORDRE COMPTE. La suppression d'abord : c'est elle que
 * `send-guard` consulte en priorité absolue, donc c'est elle qui garantit qu'un
 * email ne repartira pas. La sortie de séquence ensuite — si elle échoue,
 * l'inscription reste vivante mais le garde bloque quand même l'envoi. L'ordre
 * inverse laisserait une fenêtre où la séquence est arrêtée mais l'adresse
 * encore envoyable par un workflow.
 *
 * IDEMPOTENT : se désabonner deux fois n'est pas une erreur. Un client de
 * messagerie qui réémet son POST, un prospect qui reclique dans un vieil email,
 * un scanner qui rejoue le lien — tous doivent voir « c'est fait ».
 */
export async function desabonner(jeton: string): Promise<{ issue: Issue; email?: string }> {
  const inscription = inscriptionDepuisJeton(jeton)
  if (!inscription) return { issue: 'jeton_invalide' }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) return { issue: 'erreur' }
  const sb = createClient(url, cle, { auth: { persistSession: false } })

  // L'adresse ne vient pas du jeton — le jeton ne porte qu'un identifiant
  // d'inscription, exprès, pour qu'aucune donnée personnelle ne circule dans
  // une URL. On la relit donc ici, par le même chemin que le moteur.
  const { data: insc, error } = await sb
    .from('sequence_enrollments')
    .select('id, entreprise_id, contact_id, status')
    .eq('id', inscription)
    .maybeSingle()
  if (error) return { issue: 'erreur' }
  if (!insc) return { issue: 'introuvable' }

  const email = await adresseDeLInscription(sb, insc)
  if (!email) return { issue: 'introuvable' }

  const { error: errSup } = await sb
    .from('email_suppressions')
    .upsert({ email, reason: 'unsubscribe', note: `Désinscription en un clic — inscription ${inscription}` },
            { onConflict: 'email' })
  if (errSup) return { issue: 'erreur' }

  // La séquence s'arrête, avec son motif. `exited` et non `paused` : ce n'est
  // pas une pause, c'est un refus, et il ne se reprend pas tout seul.
  try {
    await sb
      .from('sequence_enrollments')
      .update({ status: 'exited', exit_reason: 'desabonnement', next_run_at: null })
      .eq('id', inscription)
      .eq('status', 'active')
  } catch {
    // Le garde d'envoi tient déjà : la suppression est écrite.
  }

  return { issue: 'fait', email }
}

/** L'adresse de l'inscription : contact d'abord, entreprise ensuite. */
async function adresseDeLInscription(
  sb: SupabaseClient,
  insc: { entreprise_id?: number | null; contact_id?: string | null },
): Promise<string | null> {
  if (insc.contact_id) {
    const { data } = await sb.from('contacts').select('email').eq('id', insc.contact_id).maybeSingle()
    const e = normalizeEmail(String(data?.email ?? ''))
    if (e) return e
  }
  if (insc.entreprise_id) {
    const { data } = await sb.from('entreprises').select('email').eq('id', insc.entreprise_id).maybeSingle()
    const e = normalizeEmail(String(data?.email ?? ''))
    if (e) return e
  }
  return null
}
