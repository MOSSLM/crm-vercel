// connecteur-imap.ts — lire une boîte témoin, en sortir un message, y répondre.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/connectors/imap-smtp.ts`.
//
// C'EST DE L'IO, PAS DU PUR. Une session IMAP suppose un serveur en face ; ça
// ne se teste pas comme `courbe.ts` ou `sante.ts`. Ce qui POUVAIT rester pur
// en a été extrait (`extraireReference`) — c'est le seul point testé ici sans
// réseau.
//
// LA RÉFÉRENCE VOYAGE EN EN-TÊTE `X-Sama-Ref`, jamais dans le texte — c'est la
// décision prise dans `contenu.ts`. C'est elle qu'on cherche ici, dans
// INBOX et dans le dossier indésirable, pour savoir où un message a atterri.
//
// UNE CONNEXION PAR APPEL, JAMAIS UN POOL. On lit une poignée de témoins toutes
// les dix minutes : garder une session ouverte ne fait gagner rien et coûte un
// risque de fuite si le tick est interrompu.

import { ImapFlow, type FetchMessageObject } from 'imapflow'
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { ReglagesHote } from './hotes-connus'

const ENTETE_REF = 'x-sama-ref'

export interface SecretTemoin {
  utilisateur: string
  motDePasse: string
}

export interface MessageTrouve {
  idFournisseur: string
  reference: string
  dossier: 'boite' | 'spam'
  de: string
  objet: string
  messageIdRfc: string | null
  recuLe: Date
}

const NOMS_DOSSIER_SPAM = [
  'spam', 'junk', 'junk e-mail', 'junk email', 'indésirables', 'indesirables',
  'courrier indésirable', '[gmail]/spam', 'inbox.spam', 'inbox.junk', 'bulk mail',
]

/**
 * Extrait la référence de chauffe d'un bloc d'en-têtes bruts.
 *
 * SEULE PARTIE PURE DU FICHIER : elle ne suppose ni IMAP ni réseau, donc elle
 * est testée directement, sans mock.
 */
export function extraireReference(entetesBrutes: string): string | null {
  const m = new RegExp(`^${ENTETE_REF}:\\s*(\\S+)`, 'im').exec(entetesBrutes)
  return m?.[1]?.trim() || null
}

export function extraireMessageIdRfc(entetesBrutes: string): string | null {
  return /^message-id:\s*(\S+)/im.exec(entetesBrutes)?.[1] ?? null
}

async function connecter(hote: ReglagesHote, secret: SecretTemoin): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: hote.imapHote,
    port: hote.imapPort,
    secure: hote.imapSecurise,
    auth: { user: secret.utilisateur, pass: secret.motDePasse },
    logger: false,
  })
  await client.connect()
  return client
}

/** Trouve le dossier indésirable : d'abord par usage spécial, sinon par nom connu. */
async function dossierSpam(client: ImapFlow): Promise<string | null> {
  const boites = await client.list()
  const special = boites.find((b) => b.specialUse === '\\Junk')
  if (special) return special.path
  const parNom = boites.find(
    (b) => NOMS_DOSSIER_SPAM.includes(b.path.toLowerCase()) || NOMS_DOSSIER_SPAM.includes(b.name.toLowerCase()),
  )
  return parNom?.path ?? null
}

async function scannerDossier(
  client: ImapFlow,
  chemin: string,
  dossier: 'boite' | 'spam',
  depuis: Date,
): Promise<MessageTrouve[]> {
  const trouves: MessageTrouve[] = []
  const verrou = await client.getMailboxLock(chemin)
  try {
    for await (const msg of client.fetch(
      { since: depuis },
      { uid: true, envelope: true, headers: [ENTETE_REF, 'message-id'] },
    ) as AsyncIterable<FetchMessageObject>) {
      const brut = msg.headers?.toString('utf8') ?? ''
      const reference = extraireReference(brut)
      if (!reference) continue // pas un message de chauffe : du vrai courrier reçu
      trouves.push({
        idFournisseur: String(msg.uid),
        reference,
        dossier,
        de: msg.envelope?.from?.[0]?.address ?? '',
        objet: msg.envelope?.subject ?? '',
        messageIdRfc: msg.envelope?.messageId ?? extraireMessageIdRfc(brut),
        recuLe: msg.envelope?.date ?? new Date(),
      })
    }
  } finally {
    verrou.release()
  }
  return trouves
}

/** Les messages de chauffe reçus depuis `depuisMinutes`, boîte ET spam confondus. */
export async function scanner(
  hote: ReglagesHote,
  secret: SecretTemoin,
  depuisMinutes: number,
): Promise<MessageTrouve[]> {
  const client = await connecter(hote, secret)
  try {
    const depuis = new Date(Date.now() - depuisMinutes * 60_000)
    const resultats = await scannerDossier(client, 'INBOX', 'boite', depuis)
    const spam = await dossierSpam(client)
    if (spam) resultats.push(...(await scannerDossier(client, spam, 'spam', depuis)))
    return resultats
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Sort un message du spam : marqué lu et suivi, PUIS déplacé.
 *
 * L'ORDRE COMPTE. Marquer après le déplacement viserait un UID qui vient de
 * changer — l'IMAP renumérote à chaque changement de dossier.
 */
export async function sauverDuSpam(
  hote: ReglagesHote,
  secret: SecretTemoin,
  message: MessageTrouve,
): Promise<void> {
  const client = await connecter(hote, secret)
  try {
    const spam = await dossierSpam(client)
    if (!spam) return
    const verrou = await client.getMailboxLock(spam)
    try {
      await client.messageFlagsAdd({ uid: message.idFournisseur }, ['\\Seen', '\\Flagged'], { uid: true })
      await client.messageMove({ uid: message.idFournisseur }, 'INBOX', { uid: true })
    } finally {
      verrou.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export interface EntreeEnvoiTemoin {
  nomExpediteur: string
  emailExpediteur: string
  vers: string
  nomDestinataire?: string
  objet: string
  texte: string
  reference: string
  /** Pour tenir le fil : le Message-ID du message auquel on répond. */
  enReponseA?: string | null
}

/**
 * Un témoin envoie — que ce soit sa réponse à la chauffe, via SON PROPRE SMTP.
 *
 * C'EST VOULU QUE ÇA NE PASSE PAS PAR RESEND. Une réponse envoyée par le vrai
 * SMTP de Gmail ou d'Orange est un vrai message Gmail-vers-nous : c'est
 * exactement le trafic qui construit la réputation, bien plus qu'une réponse
 * simulée qui contournerait le fournisseur du témoin.
 */
export async function envoyerDepuisTemoin(
  hote: ReglagesHote,
  secret: SecretTemoin,
  entree: EntreeEnvoiTemoin,
): Promise<{ messageIdRfc: string }> {
  const options: SMTPTransport.Options = {
    host: hote.smtpHote,
    port: hote.smtpPort,
    secure: hote.smtpSecurise,
    auth: { user: secret.utilisateur, pass: secret.motDePasse },
  }
  const info = await nodemailer.createTransport(options).sendMail({
    from: { name: entree.nomExpediteur, address: entree.emailExpediteur },
    to: entree.nomDestinataire ? { name: entree.nomDestinataire, address: entree.vers } : entree.vers,
    subject: entree.objet,
    text: entree.texte,
    inReplyTo: entree.enReponseA ?? undefined,
    references: entree.enReponseA ?? undefined,
    headers: { 'X-Sama-Ref': entree.reference },
  })
  return { messageIdRfc: info.messageId }
}

/** Éprouve la connexion — IMAP et SMTP — sans rien envoyer ni rien lire. */
export async function eprouverConnexion(hote: ReglagesHote, secret: SecretTemoin): Promise<void> {
  await nodemailer.createTransport({
    host: hote.smtpHote, port: hote.smtpPort, secure: hote.smtpSecurise,
    auth: { user: secret.utilisateur, pass: secret.motDePasse },
  }).verify()
  const client = await connecter(hote, secret)
  const verrou = await client.getMailboxLock('INBOX')
  verrou.release()
  await client.logout().catch(() => {})
}
