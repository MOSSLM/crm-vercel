// hotes-connus.ts — les réglages IMAP/SMTP des fournisseurs qu'on chauffe.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/connectors/imap-smtp.ts`
// (`KNOWN_HOSTS`, `guessHosts`), module pur.
//
// POURQUOI CE FICHIER EXISTE : sans lui, brancher un témoin exigerait de
// connaître le serveur IMAP et le serveur SMTP de son fournisseur — deux noms
// d'hôte et deux ports que personne ne retient. Pour les cinq familles
// qu'on chauffe, ils sont connus d'avance ; on les déduit du domaine, l'humain
// ne tape que son adresse et son mot de passe.

export interface ReglagesHote {
  smtpHote: string
  smtpPort: number
  smtpSecurise: boolean
  imapHote: string
  imapPort: number
  imapSecurise: boolean
}

export const HOTES_CONNUS: Record<string, ReglagesHote> = {
  'gmail.com':      { smtpHote: 'smtp.gmail.com',      smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.gmail.com',        imapPort: 993, imapSecurise: true },
  'googlemail.com': { smtpHote: 'smtp.gmail.com',      smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.gmail.com',        imapPort: 993, imapSecurise: true },
  'outlook.com':    { smtpHote: 'smtp.office365.com',  smtpPort: 587, smtpSecurise: false, imapHote: 'outlook.office365.com', imapPort: 993, imapSecurise: true },
  'outlook.fr':     { smtpHote: 'smtp.office365.com',  smtpPort: 587, smtpSecurise: false, imapHote: 'outlook.office365.com', imapPort: 993, imapSecurise: true },
  'hotmail.com':    { smtpHote: 'smtp.office365.com',  smtpPort: 587, smtpSecurise: false, imapHote: 'outlook.office365.com', imapPort: 993, imapSecurise: true },
  'hotmail.fr':     { smtpHote: 'smtp.office365.com',  smtpPort: 587, smtpSecurise: false, imapHote: 'outlook.office365.com', imapPort: 993, imapSecurise: true },
  'yahoo.com':      { smtpHote: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.mail.yahoo.com',   imapPort: 993, imapSecurise: true },
  'yahoo.fr':       { smtpHote: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.mail.yahoo.com',   imapPort: 993, imapSecurise: true },
  'free.fr':        { smtpHote: 'smtp.free.fr',        smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.free.fr',          imapPort: 993, imapSecurise: true },
  'laposte.net':    { smtpHote: 'smtp.laposte.net',    smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.laposte.net',      imapPort: 993, imapSecurise: true },
  'orange.fr':      { smtpHote: 'smtp.orange.fr',      smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.orange.fr',        imapPort: 993, imapSecurise: true },
  'wanadoo.fr':      { smtpHote: 'smtp.orange.fr',      smtpPort: 465, smtpSecurise: true,  imapHote: 'imap.orange.fr',        imapPort: 993, imapSecurise: true },
  'icloud.com':     { smtpHote: 'smtp.mail.me.com',    smtpPort: 587, smtpSecurise: false, imapHote: 'imap.mail.me.com',      imapPort: 993, imapSecurise: true },
}

/** Les réglages du fournisseur de cette adresse, ou `null` si inconnu. */
export function reglagesDeviness(email: string): ReglagesHote | null {
  const domaine = email.split('@')[1]?.toLowerCase().trim()
  return domaine ? (HOTES_CONNUS[domaine] ?? null) : null
}
