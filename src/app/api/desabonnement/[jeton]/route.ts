// La porte POST — celle des clients de messagerie (RFC 8058).
//
// POURQUOI LE GET NE DÉSABONNE PAS, ET POURQUOI CETTE ROUTE EXISTE
// Les passerelles antispam, les aperçus de lien et les robots d'indexation
// SUIVENT les URL d'un message. Si un GET désabonnait, un scanner désinscrirait
// silencieusement tout un lot sans qu'un seul prospect ait cliqué — et on
// chercherait la cause dans le contenu du message.
//
// C'est exactement la raison d'être de la RFC 8058 : `List-Unsubscribe-Post`
// impose au client de messagerie d'envoyer un POST avec un corps convenu.
// Un scanner ne poste pas.
//
// Deux portes, donc, et deux déclencheurs :
//   · POST /api/desabonnement/{jeton}  → le bouton natif de Gmail/Outlook,
//     zéro clic, c'est l'URL de l'en-tête `List-Unsubscribe`
//   · GET  /desabonnement/{jeton}      → une page avec UN bouton, qui poste ici,
//     c'est l'URL visible dans le corps du message
//
// Les deux vivent dans des dossiers séparés parce que Next refuse `route.ts` et
// `page.tsx` côte à côte — pas par choix d'architecture.
//
// Elles partagent `desabonner()` pour ne pas diverger.

import { NextResponse } from 'next/server'
import { desabonner } from './desabonner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jeton: string }> },
): Promise<NextResponse> {
  const { jeton } = await params

  // La RFC demande un corps `List-Unsubscribe=One-Click`. On ne l'EXIGE pas :
  // le bouton de notre propre page poste sans ce corps, et un client de
  // messagerie qui s'en écarterait ne doit pas voir sa demande refusée. Un
  // désabonnement raté est un manquement ; un désabonnement de trop ne l'est
  // pas.
  try {
    await req.text()
  } catch {
    /* un corps illisible n'empêche pas la demande */
  }

  const { issue } = await desabonner(jeton)

  // 200 même pour un jeton inconnu. Un client de messagerie n'a rien à faire
  // d'un code d'erreur — il l'afficherait à l'utilisateur comme un échec alors
  // que sa demande, elle, ne se rejoue pas. Seule une VRAIE panne se signale,
  // pour que le client réessaie.
  if (issue === 'erreur') {
    return NextResponse.json({ ok: false, fait: false }, { status: 503 })
  }

  // `fait` DIT SI ON A ÉCRIT, et le statut HTTP ne le dit pas. Les deux
  // lecteurs n'ont pas le même besoin : le client de messagerie ne lit que le
  // code, la page lit le corps.
  //
  // Le cas qui impose cette distinction est `introuvable` — l'inscription a été
  // purgée, donc on ne peut plus remonter à l'adresse, donc RIEN n'est écrit
  // dans `email_suppressions`. Or l'adresse peut être inscrite ailleurs :
  // afficher « c'est fait » enverrait le prospect se croire tranquille pendant
  // qu'une autre séquence continue. La page bascule alors sur « écrivez-nous ».
  return NextResponse.json({ ok: true, fait: issue === 'fait' }, { status: 200 })
}
