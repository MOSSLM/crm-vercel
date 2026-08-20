// coffre.ts — le chiffrement des identifiants de boîtes témoins.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/crypto.ts`, AES-256-GCM.
//
// POURQUOI GCM ET PAS CBC : GCM authentifie. Un chiffré modifié en base ne se
// déchiffre pas en silence sur des octets faux — il lève. Pour un mot de passe
// de messagerie, échouer bruyamment vaut mieux que se connecter avec n'importe
// quoi et faire verrouiller le compte.
//
// CE QUI CHANGE PAR RAPPORT À L'ORIGINAL : la clé absente ne laisse plus
// passer. L'original lisait `env.encryptionKey()` et laissait l'erreur remonter
// telle quelle ; ici, `disponible()` permet à l'appelant de REFUSER D'ÉCRIRE
// avant même de demander le mot de passe à l'humain. Enregistrer un secret que
// l'on ne saura pas relire est pire que ne pas l'enregistrer : on croit la
// boîte branchée, elle ne l'est pas, et le mot de passe est perdu dans un
// chiffré orphelin.
//
// LA CLÉ VIT DANS L'ENVIRONNEMENT, JAMAIS EN BASE. Une clé rangée à côté du
// chiffré qu'elle protège ne protège rien.
//
// La générer :
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const NOM_VARIABLE = 'RECHAUFFEUR_CLE'

function cle(): Buffer {
  const brut = Buffer.from(process.env[NOM_VARIABLE] ?? '', 'base64')
  if (brut.length !== 32) {
    throw new Error(
      `${NOM_VARIABLE} doit faire 32 octets en base64. ` +
        'La générer : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return brut
}

/** La clé est-elle utilisable ? À vérifier AVANT de demander un secret. */
export function disponible(): boolean {
  try {
    cle()
    return true
  } catch {
    return false
  }
}

/** Chiffre. Format : base64(iv | tag | chiffré). */
export function sceller(valeur: unknown): string {
  const iv = randomBytes(12)
  const chiffreur = createCipheriv(ALGO, cle(), iv)
  const corps = Buffer.concat([
    chiffreur.update(JSON.stringify(valeur), 'utf8'),
    chiffreur.final(),
  ])
  return Buffer.concat([iv, chiffreur.getAuthTag(), corps]).toString('base64')
}

/** Déchiffre. Lève si le chiffré a été modifié — c'est le but de GCM. */
export function ouvrir<T = Record<string, string>>(scelle: string): T {
  const brut = Buffer.from(scelle, 'base64')
  const dechiffreur = createDecipheriv(ALGO, cle(), brut.subarray(0, 12))
  dechiffreur.setAuthTag(brut.subarray(12, 28))
  const clair = Buffer.concat([
    dechiffreur.update(brut.subarray(28)),
    dechiffreur.final(),
  ]).toString('utf8')
  return JSON.parse(clair) as T
}
