// La porte humaine — celle du lien visible dans le corps du message.
//
// ELLE NE DÉSABONNE PAS AU CHARGEMENT, et c'est délibéré : les passerelles
// antispam et les aperçus de lien suivent les URL d'un message. Un GET qui
// écrit désinscrirait un lot entier sans qu'un seul prospect ait cliqué.
// La page montre donc UN bouton, qui poste vers /api/desabonnement/{jeton}.
//
// « Un simple clic », au sens des règles d'or de la CNIL, est respecté : le
// visiteur arrive et clique une fois. Ce que la CNIL proscrit, c'est le
// formulaire, l'authentification et le détour par un DPO — c'est là-dessus que
// CALOGA a été sanctionnée, pas sur un bouton de confirmation.
//
// La page porte aussi ce que la CNIL demande explicitement d'y mettre : « le
// nom et les coordonnées du responsable du traitement et du propriétaire du
// fichier source », plus l'origine des données (article 14 du RGPD, données
// collectées indirectement).

import type { Metadata } from 'next'
import { inscriptionDepuisJeton } from '@/lib/email/desabonnement'
import BoutonDesinscription from './BoutonDesinscription'

// Jamais indexée : une URL à jeton dans un index de moteur est une fuite.
export const metadata: Metadata = {
  title: 'Se désinscrire',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params
  const valide = inscriptionDepuisJeton(jeton) !== null

  // ── LA PAGE PORTE SON PROPRE FOND, ET C'EST NÉCESSAIRE ────────────────────
  //
  // Le calque `(public)` est celui des SITES CLIENTS : il ne pose ni police ni
  // couleur, chaque design apportant les siennes. Une page qui s'y glisse sans
  // fond hérite donc de celui du navigateur — et sur un visiteur en thème
  // sombre, un `color: #1a1a1a` devient du texte noir sur fond noir. Constaté à
  // l'écran le 03/09/2026 : le titre était invisible.
  //
  // Fond et couleur explicites, sur toute la hauteur. Pas de `prefers-color-scheme` :
  // cette page-ci doit être lisible partout et de la même façon, y compris dans
  // l'aperçu intégré d'un client de messagerie, qui ne suit pas toujours le
  // thème du système.
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        background: '#ffffff',
        color: '#1a1a1a',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        lineHeight: 1.6,
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
      {valide ? (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Ne plus recevoir nos messages</h1>
          <p style={{ marginTop: 0, color: '#555' }}>
            Un clic, et nous ne vous écrivons plus. Aucune information ne vous sera demandée.
          </p>
          <BoutonDesinscription jeton={jeton} />
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Ce lien n’est plus valide</h1>
          <p style={{ marginTop: 0, color: '#555' }}>
            Écrivez-nous à{' '}
            <a href="mailto:contact@samadigitalstudio.fr">contact@samadigitalstudio.fr</a> et nous
            vous retirons de nos listes le jour même.
          </p>
        </>
      )}

      <hr style={{ margin: '40px 0 20px', border: 0, borderTop: '1px solid #e5e5e5' }} />

        <section style={{ fontSize: 13, color: '#666' }}>
        <p style={{ margin: '0 0 10px' }}>
          <strong>Qui vous écrit.</strong> Sama Digital Studio — contact@samadigitalstudio.fr.
          Responsable du traitement de vos données.
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <strong>D’où viennent vos coordonnées.</strong> De sources professionnelles publiques —
          le site internet de votre entreprise, sa fiche d’établissement en ligne, et le registre
          national des entreprises. Nous ne les avons ni achetées ni reçues d’un tiers.
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <strong>Pourquoi nous vous écrivons.</strong> Pour vous proposer un site internet
          professionnel, prestation en lien direct avec votre activité. Base légale : l’intérêt
          légitime (article 6.1.f du RGPD).
        </p>
        <p style={{ margin: 0 }}>
          <strong>Vos droits.</strong> Accès, rectification, effacement, opposition et limitation,
          en écrivant à contact@samadigitalstudio.fr. Vous pouvez aussi introduire une réclamation
          auprès de la CNIL. Vos coordonnées sont conservées trois ans après notre dernier échange.
        </p>
        </section>
      </div>
    </main>
  )
}
