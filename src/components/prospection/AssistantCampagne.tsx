'use client'
// AssistantCampagne — décrire un objectif, lire ce que le fichier peut porter.
//
// LE TROISIÈME DÉPART. Le plan en prévoit trois pour créer une campagne :
// vierge, depuis un modèle, ou en décrivant l'objectif. Les deux premiers
// existent (« Nouvelle campagne » et la bibliothèque) ; voici le troisième.
//
// CE QU'IL MONTRE EN PREMIER N'EST PAS LA PROPOSITION, C'EST LA LECTURE.
// « Compris : sans site, WhatsApp » / « Non pris en compte : gironde ». Un
// assistant qui affiche d'emblée une belle campagne se fait croire ; celui-ci
// commence par avouer ce qu'il n'a pas su lire, et c'est ce qui rend le reste
// utilisable.
//
// ET IL NE CRÉE RIEN. Aucun bouton ici n'écrit en base : la proposition se lit,
// se recopie, et la campagne se monte dans le constructeur — qui a sa revue
// avant lancement. Un assistant qui se trompe doit coûter une relecture, pas un
// envoi.
import React, { useState } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { Intention, Proposition } from '@/lib/prospection/assistant'
import './lem-skin.css'

const EXEMPLES = [
  'relancer en WhatsApp les artisans sans site',
  'campagne e-mail sur la cohorte A',
  'appeler ceux qu’on n’a jamais touchés',
]

const LIBELLE_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'e-mail',
  call: 'appel',
  sms: 'SMS',
}

export function AssistantCampagne() {
  const [objectif, setObjectif] = useState('')
  const [reponse, setReponse] = useState<{ intention: Intention; proposition: Proposition } | null>(null)
  const [panne, setPanne] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const demander = async (phrase: string) => {
    if (!phrase.trim()) return
    setOccupe(true)
    setPanne(null)
    try {
      const r = await authedFetch('/api/prospection/assistant', {
        method: 'POST',
        body: JSON.stringify({ objectif: phrase }),
      })
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message || j?.error || 'lecture impossible')
        setReponse(null)
        return
      }
      setReponse({ intention: j.intention, proposition: j.proposition })
    } catch {
      setPanne('le serveur n’a pas répondu')
      setReponse(null)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="lem-carte" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Sparkles size={16} />
        <strong style={{ fontSize: 14 }}>Décrire l’objectif</strong>
        <span className="lem-second" style={{ fontSize: 12 }}>
          — la proposition est chiffrée sur le portefeuille d’aujourd’hui, et ne crée rien
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="lem-champ"
          style={{ flex: 1 }}
          value={objectif}
          placeholder="relancer en WhatsApp les artisans sans site"
          onChange={(e) => setObjectif(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void demander(objectif) }}
        />
        <button className="lem-btn principal" disabled={occupe || !objectif.trim()} onClick={() => void demander(objectif)}>
          {occupe ? 'Lecture…' : 'Proposer'}
        </button>
      </div>

      {!reponse && !panne && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {EXEMPLES.map((ex) => (
            <button
              key={ex}
              className="lem-btn"
              style={{ fontSize: 12 }}
              onClick={() => { setObjectif(ex); void demander(ex) }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {panne && (
        <div className="lem-alerte" data-gravite="attention" style={{ marginTop: 10 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>La proposition n’a pas pu être calculée.</b> {panne}. Ce n’est pas « aucune campagne
            possible » — on n’a pas pu compter.
          </div>
        </div>
      )}

      {reponse && (
        <div style={{ marginTop: 12 }}>
          {/* CE QUI A ÉTÉ LU, AVANT CE QUI EST PROPOSÉ. C'est l'ordre qui compte :
              une proposition qu'on lit sans savoir sur quoi elle repose est une
              proposition qu'on suit. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {reponse.intention.comprises.map((m) => (
              <span key={m} className="lem-pill" data-ton="ok">{m}</span>
            ))}
            {reponse.intention.ignorees.map((m) => (
              <span key={m} className="lem-pill" data-ton="attention" title="Ce critère n’existe pas dans l’explorateur — il ne filtre rien">
                {m} — non pris en compte
              </span>
            ))}
            {reponse.intention.comprises.length === 0 && (
              <span className="lem-pill" data-ton="danger">rien compris</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{reponse.proposition.cible}</div>
              <div className="lem-second" style={{ fontSize: 12 }}>fiches visées</div>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{reponse.proposition.nom}</div>
              <div className="lem-second" style={{ fontSize: 12 }}>
                {LIBELLE_CANAL[reponse.proposition.canal] ?? reponse.proposition.canal} ·{' '}
                {reponse.proposition.filtres.join(' · ')}
              </div>
            </div>
          </div>

          <ol style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 13 }}>
            {reponse.proposition.etapes.map((e, i) => (
              <li key={i} style={{ marginBottom: 3 }}>
                <span className="lem-second">J+{e.jour} · {LIBELLE_CANAL[e.canal] ?? e.canal} — </span>
                {e.quoi}
              </li>
            ))}
          </ol>

          {/* LES RÉSERVES SONT LA PARTIE UTILE. Une campagne lancée sans elles est
              une campagne dont on découvre les trous au premier envoi. */}
          {reponse.proposition.reserves.length > 0 && (
            <div className="lem-alerte" data-gravite="attention" style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b>Ce que cette proposition ne garantit pas</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {reponse.proposition.reserves.map((r, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
