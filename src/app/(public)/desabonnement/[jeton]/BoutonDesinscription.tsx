'use client'

// Le bouton, et rien d'autre. Il poste — il ne navigue pas : voir l'en-tête de
// la page pour la raison (un GET qui écrit est déclenché par les scanners).
//
// L'échec est traité comme un cas normal, pas comme une exception à cacher : un
// prospect qui ne parvient pas à se désinscrire doit repartir avec une adresse
// à qui écrire, sinon il clique sur « signaler comme spam » — ce qui coûte plus
// cher que le désabonnement qu'on vient de rater.

import { useState } from 'react'

type Etat = 'pret' | 'en_cours' | 'fait' | 'echec'

export default function BoutonDesinscription({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>('pret')

  async function desinscrire() {
    setEtat('en_cours')
    try {
      const res = await fetch(`/api/desabonnement/${encodeURIComponent(jeton)}`, { method: 'POST' })
      // `res.ok` NE SUFFIT PAS : la route rend 200 même quand elle n'a rien pu
      // écrire (inscription purgée, donc adresse introuvable). Annoncer « c'est
      // fait » dans ce cas enverrait le prospect se croire tranquille pendant
      // qu'une autre séquence continue de lui écrire.
      const corps = (await res.json().catch(() => null)) as { fait?: boolean } | null
      setEtat(res.ok && corps?.fait === true ? 'fait' : 'echec')
    } catch {
      setEtat('echec')
    }
  }

  if (etat === 'fait') {
    return (
      <p
        role="status"
        style={{
          background: '#ecfdf3',
          border: '1px solid #abefc6',
          borderRadius: 8,
          padding: '14px 16px',
          margin: '24px 0 0',
        }}
      >
        <strong>C’est fait.</strong> Vous ne recevrez plus rien de notre part. Désolé pour le
        dérangement.
      </p>
    )
  }

  if (etat === 'echec') {
    return (
      <p
        role="status"
        style={{
          background: '#fef3f2',
          border: '1px solid #fecdca',
          borderRadius: 8,
          padding: '14px 16px',
          margin: '24px 0 0',
        }}
      >
        <strong>Ça n’a pas marché.</strong> Écrivez à{' '}
        <a href="mailto:contact@samadigitalstudio.fr">contact@samadigitalstudio.fr</a> et nous vous
        retirons à la main le jour même.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={desinscrire}
      disabled={etat === 'en_cours'}
      style={{
        marginTop: 24,
        padding: '12px 22px',
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        background: etat === 'en_cours' ? '#9aa2ad' : '#1f2937',
        border: 0,
        borderRadius: 8,
        cursor: etat === 'en_cours' ? 'default' : 'pointer',
      }}
    >
      {etat === 'en_cours' ? 'Un instant…' : 'Me désinscrire'}
    </button>
  )
}
