// envoi-resend.ts — le quatrième connecteur, celui qui n'existait pas.
//
// LE RÉCHAUFFEUR D'ORIGINE en avait trois — IMAP/SMTP, API Gmail, Microsoft
// Graph — et tous partaient d'une BOÎTE. Aucun ne convient ici, pour une raison
// mesurée le 19/08/2026 et écrite dans `docs/lemlist/08-rechauffeur.md` : un
// filtre anti-spam indexe la réputation sur le couple (domaine signant `d=`,
// IP émettrice). Notre prospection part de `@samadigitalstudio.fr` signé par
// Resend depuis SES ; nos boîtes sont chez LWS sur `@samadigitalstudio.com`.
// Les DEUX composantes diffèrent. Chauffer les boîtes LWS n'apporte
// rigoureusement RIEN au chemin d'envoi réel.
//
// La chauffe doit donc emprunter le MÊME chemin que la prospection : Resend,
// même clé, même expéditeur, même enveloppe. C'est tout ce que fait ce fichier.
//
// ── POURQUOI PAS `sendEngineEmail` ────────────────────────────────────────
// Parce qu'il habille : `wrapEmailBodyHtml` pose un gabarit HTML, la signature
// d'entreprise s'ajoute au texte, et le régulateur, le vérificateur d'adresses
// et le disjoncteur s'interposent. Pour la prospection c'est exactement ce
// qu'il faut. Pour la chauffe, ce serait envoyer quarante fois par jour le même
// gabarit HTML signé au même petit groupe d'adresses : la signature la plus
// facile à apprendre qu'on puisse imaginer, dans un message dont le seul but
// est de ressembler à du courrier ordinaire.
//
// ── POURQUOI PAS `email_logs` ─────────────────────────────────────────────
// Le disjoncteur de rebonds compte son dénominateur sur `channel = 'email'`,
// pas sur `type` — écrire la chauffe dans `email_logs` la ferait entrer dans ce
// dénominateur, et quarante envois de chauffe par jour y noieraient un rebond
// dur de prospection. C'est LE défaut corrigé la semaine dernière ; on ne le
// réintroduit pas par la porte de service. La chauffe tient son propre journal
// (`rechauffe_messages`), et le plafond partagé se dit autrement : le
// réchauffeur RETRANCHE son volume de la capacité qu'il rend au régulateur.

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EnvoiChauffe {
  de: string
  nomExpediteur: string
  vers: string
  nomDestinataire: string
  objet: string
  texte: string
  /** Le jeton qu'on retrouvera dans la boîte témoin. */
  reference: string
}

export interface ResultatEnvoi {
  ok: boolean
  resendId?: string
  erreur?: string
}

/** L'expéditeur configuré, lu là où le moteur de séquences le lit déjà. */
export async function adresseDEnvoi(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await sb
      .from('automation_connections')
      .select('config')
      .eq('id', 'resend')
      .maybeSingle()
    const cfg = (data?.config ?? {}) as Record<string, string>
    if (cfg.from_email) return cfg.from_email
  } catch {
    /* on retombe sur l'environnement */
  }
  return process.env.RESEND_FROM_EMAIL ?? null
}

/**
 * Envoie un message de chauffe.
 *
 * TEXTE BRUT ET RIEN D'AUTRE : pas de `html`, pas de pièce jointe, pas de lien.
 * Resend ne peut pas suivre les ouvertures sans HTML — c'est voulu : le pixel
 * de suivi est lui-même un signal négatif, et le placement se mesure dans la
 * boîte témoin, pas au départ.
 */
export async function envoyerChauffe(envoi: EnvoiChauffe): Promise<ResultatEnvoi> {
  const cle = process.env.RESEND_API_KEY
  if (!cle) return { ok: false, erreur: 'RESEND_API_KEY non configuré' }

  const resend = new Resend(cle)
  try {
    const res = await resend.emails.send({
      from: `${envoi.nomExpediteur} <${envoi.de}>`,
      to: `${envoi.nomDestinataire} <${envoi.vers}>`,
      // Le témoin répond à l'adresse d'envoi : c'est le fil qui compte, et un
      // `Reply-To` divergent est précisément ce que font les campagnes.
      subject: envoi.objet,
      text: envoi.texte,
      headers: { 'X-Sama-Ref': envoi.reference },
      // Une seule étiquette, pour que le webhook Resend sache trier la chauffe
      // du reste sans avoir à deviner.
      tags: [{ name: 'genre', value: 'chauffe' }],
    })
    if (res.error) return { ok: false, erreur: res.error.message }
    return { ok: true, resendId: res.data?.id }
  } catch (err) {
    return { ok: false, erreur: err instanceof Error ? err.message : 'Erreur inconnue' }
  }
}
