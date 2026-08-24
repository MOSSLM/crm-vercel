'use client'
// PlaquettesDuJour — la chaîne d'envoi des plaquettes.
//
// LE BESOIN, DIT PAR MATTEO : « un bouton "Envoyer les plaquettes du jour" qui
// va créer les brouillons de conversation pour chaque conversation et on a plus
// qu'à cliquer sur le bouton d'envoi après avoir chargé le PDF ».
//
// CE QUE CET ÉCRAN NE FERA JAMAIS, ET IL FAUT LE SAVOIR AVANT DE LIRE LA SUITE :
// envoyer. WhatsApp n'accepte un message que d'un doigt humain, dans WhatsApp.
// Aucun lien, aucune API tierce ne pose une pièce jointe à votre place. Tout ce
// qui est automatisable ici, c'est la PRÉPARATION — et c'est déjà l'essentiel du
// temps perdu.
//
// LA PASSE RÉUTILISE UNE SEULE FENÊTRE, et c'est le cœur technique. Un
// `window.open` par prospect serait coupé par le bloqueur de pop-up dès le
// deuxième : le navigateur n'autorise qu'une ouverture par geste de
// l'utilisateur. On ouvre donc UNE fenêtre au clic, puis on la RENAVIGUE à
// chaque tour — renaviguer une fenêtre qu'on possède déjà n'est pas bloqué.
//
// LES DÉLAIS SONT ALÉATOIRES, mais pas pour la raison qu'on croit. Ouvrir une
// conversation n'est pas envoyer : le risque de blocage est dans l'envoi, et
// l'envoi reste manuel. Le délai sert à ce que la passe soit REGARDABLE — sans
// lui, l'écran clignote quarante-neuf fois en dix secondes et on ne sait plus où
// on en est.
//
// LA FENÊTRE VOLE LE FOCUS à chaque tour, puisqu'elle réveille l'application
// WhatsApp. C'est une passe qu'on lance en allant chercher un café, pas en
// travaillant à côté. L'écran le dit avant de démarrer plutôt que de le faire
// découvrir.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Download, MessageCircle, Play, Square } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import './lem-skin.css'

interface Plaquette {
  id: string
  entreprise: string
  ville: string | null
  prenom: string | null
  tel: string | null
  message: string
  whatsapp: string | null
  pdf: string | null
  pdfNom: string | null
  pdfLe: string | null
  reportee: boolean
  dueAt: string | null
}

/** Entre deux ouvertures. Assez pour suivre des yeux, assez court pour finir. */
const DELAI_MIN_MS = 2_500
const DELAI_MAX_MS = 5_000

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))
const delaiAleatoire = () => DELAI_MIN_MS + Math.random() * (DELAI_MAX_MS - DELAI_MIN_MS)

/**
 * Déclencher un téléchargement sans quitter la page.
 *
 * L'URL signée porte déjà `Content-Disposition: attachment` (c'est l'option
 * `download` du lien signé, posée par la route) : le navigateur enregistre donc
 * le fichier sous SON nom, et non « plaquette.pdf (12) ». L'attribut `download`
 * d'un lien, lui, est ignoré en cross-origin — il est là par ceinture, pas parce
 * qu'il suffirait.
 */
function telecharger(url: string, nom: string | null): void {
  const a = document.createElement('a')
  a.href = url
  if (nom) a.download = nom
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function PlaquettesDuJour({
  endpoint = '/api/agent/plaquettes',
  endpointTaches = '/api/agent/tasks',
}: {
  endpoint?: string
  endpointTaches?: string
} = {}) {
  const [liste, setListe] = useState<Plaquette[] | null>(null)
  const [panne, setPanne] = useState<string | null>(null)
  const [faites, setFaites] = useState<Set<string>>(new Set())

  // La passe en cours : l'index atteint, et la fenêtre qu'on renavigue.
  const [enPasse, setEnPasse] = useState(false)
  const [avancement, setAvancement] = useState(0)
  const stop = useRef(false)
  const fenetre = useRef<Window | null>(null)

  const charger = useCallback(async () => {
    setPanne(null)
    try {
      const r = await authedFetch(endpoint)
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.error ?? 'La lecture a échoué.')
        return
      }
      setListe(Array.isArray(j?.plaquettes) ? j.plaquettes : [])
    } catch {
      setPanne('La lecture a échoué.')
    }
  }, [endpoint])

  useEffect(() => {
    void charger()
  }, [charger])

  const restantes = (liste ?? []).filter((p) => !faites.has(p.id))
  const pretes = restantes.filter((p) => p.pdf && p.whatsapp)
  const sansPdf = restantes.filter((p) => !p.pdf).length
  const sansNumero = restantes.filter((p) => !p.whatsapp).length

  /**
   * La passe. Elle ouvre la première conversation SUR LE CLIC — c'est ce geste
   * qui autorise la fenêtre — puis renavigue la même fenêtre pour les suivantes.
   */
  const preparer = async () => {
    if (pretes.length === 0) return
    stop.current = false
    setEnPasse(true)
    setAvancement(0)

    try {
      for (let i = 0; i < pretes.length; i++) {
        if (stop.current) break
        const p = pretes[i]

        // Le fichier d'abord : il doit être sur le disque quand la conversation
        // s'ouvre, sinon on se retrouve devant une discussion sans rien à
        // joindre.
        if (p.pdf) telecharger(p.pdf, p.pdfNom)

        if (i === 0) {
          fenetre.current = window.open(p.whatsapp!, 'sama-plaquettes')
          if (!fenetre.current) {
            toast.error('Le navigateur a bloqué la fenêtre. Autorise les pop-ups pour ce site, puis relance.')
            break
          }
        } else if (fenetre.current && !fenetre.current.closed) {
          fenetre.current.location.href = p.whatsapp!
        } else {
          // La fenêtre a été fermée en cours de route : on s'arrête plutôt que
          // d'ouvrir en rafale, ce que le bloqueur couperait de toute façon.
          toast.message('Fenêtre fermée — la passe s’arrête ici.')
          break
        }

        setAvancement(i + 1)
        if (i < pretes.length - 1) await attendre(delaiAleatoire())
      }
    } finally {
      setEnPasse(false)
    }
  }

  const marquerFait = async (p: Plaquette) => {
    try {
      const r = await authedFetch(endpointTaches, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, status: 'done' }),
      })
      if (!r.ok) throw new Error()
      setFaites((s) => new Set(s).add(p.id))
    } catch {
      toast.error('Impossible de marquer cette plaquette comme envoyée.')
    }
  }

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Les plaquettes du jour</h1>
            <p className="lem-sous">
              La passe télécharge chaque PDF et ouvre chaque conversation avec son message déjà
              tapé. Il reste à joindre le fichier et à appuyer sur Envoyer — ça, WhatsApp ne
              l’accepte que d’une main humaine.
            </p>
          </div>
          <button className="lem-btn" onClick={() => void charger()} disabled={enPasse}>
            Relire
          </button>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{panne}</div>
          </div>
        )}

        {sansPdf > 0 && (
          <div className="lem-alerte" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>{sansPdf} plaquette(s) sans PDF.</b> Elles restent dans la liste mais la passe les
              saute&nbsp;: relance <code>scripts/prospection/plaquettes-pdf.ts</code> pour les
              fabriquer, puis reviens ici.
            </div>
          </div>
        )}

        {sansNumero > 0 && (
          <div className="lem-alerte" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>{sansNumero} sans numéro exploitable sur WhatsApp.</b> Il n’y a pas de
              conversation à ouvrir&nbsp;: à traiter autrement.
            </div>
          </div>
        )}

        <div className="lem-carte" style={{ padding: 16, marginBottom: 16 }}>
          {enPasse ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <strong style={{ fontSize: 15 }}>
                  Préparation {avancement} / {pretes.length}
                </strong>
                <span className="lem-pill">{pretes[avancement]?.entreprise ?? 'terminé'}</span>
                <button
                  className="lem-btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    stop.current = true
                  }}
                >
                  <Square size={13} /> Arrêter
                </button>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--lem-survol)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pretes.length ? (avancement / pretes.length) * 100 : 0}%`,
                    background: 'var(--lem-bleu)',
                    transition: 'width .3s ease',
                  }}
                />
              </div>
              <p className="lem-second" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                Laisse la machine tranquille pendant la passe&nbsp;: chaque ouverture réveille
                WhatsApp et prend le premier plan.
              </p>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>
                  {pretes.length} plaquette(s) prête(s) à préparer
                </strong>
                {faites.size > 0 && (
                  <span className="lem-pill" data-ton="ok">{faites.size} envoyée(s)</span>
                )}
                <button
                  className="lem-btn principal"
                  style={{ marginLeft: 'auto' }}
                  disabled={pretes.length === 0}
                  onClick={() => void preparer()}
                >
                  <Play size={14} /> Préparer les {pretes.length} conversations
                </button>
              </div>
              <p className="lem-second" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                Le navigateur demandera une fois l’autorisation de télécharger plusieurs
                fichiers&nbsp;: accepte, sinon seul le premier PDF arrivera. Compte environ{' '}
                {Math.round((pretes.length * (DELAI_MIN_MS + DELAI_MAX_MS)) / 2 / 60000)} minute(s).
              </p>
            </>
          )}
        </div>

        {liste?.length === 0 && !panne && (
          <div className="lem-carte lem-vide">
            <h3>Aucune plaquette à envoyer</h3>
            <p>Les tâches qui joignent une plaquette apparaissent ici dès qu’elles sont dues.</p>
          </div>
        )}

        {(liste ?? []).length > 0 && (
          <div className="lem-carte" style={{ overflow: 'hidden' }}>
            <table className="lem-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Document</th>
                  <th style={{ textAlign: 'right' }}>Envoi</th>
                </tr>
              </thead>
              <tbody>
                {(liste ?? []).map((p) => {
                  const fait = faites.has(p.id)
                  return (
                    <tr key={p.id} style={fait ? { opacity: 0.5 } : undefined}>
                      <td>
                        <div>{p.entreprise}</div>
                        <div className="lem-second" style={{ fontSize: 11.5 }}>
                          {p.prenom ? `${p.prenom} · ` : ''}
                          {p.ville ?? ''}
                          {p.tel ? ` · ${p.tel}` : ' · aucun numéro'}
                          {p.reportee ? ' · reportée' : ''}
                        </div>
                      </td>
                      <td style={{ width: 190 }}>
                        {p.pdf ? (
                          <button className="lem-btn" onClick={() => telecharger(p.pdf!, p.pdfNom)}>
                            <Download size={13} /> Le PDF
                          </button>
                        ) : (
                          <span className="lem-pill" data-ton="attention">à fabriquer</span>
                        )}
                      </td>
                      <td style={{ width: 300, textAlign: 'right' }}>
                        {fait ? (
                          <span className="lem-pill" data-ton="ok">
                            <Check size={12} /> envoyée
                          </span>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {p.whatsapp && (
                              <button
                                className="lem-btn"
                                onClick={() => window.open(p.whatsapp!, 'sama-plaquettes')}
                              >
                                <MessageCircle size={13} /> La conversation
                              </button>
                            )}
                            <button className="lem-btn" onClick={() => void marquerFait(p)}>
                              <Check size={13} /> Envoyée
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
