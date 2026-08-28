'use client'
// CampagnesListe — l'index des campagnes.
//
// L'ÉCRAN QUI MANQUAIT. Une séquence, jusqu'ici, ne disait ni qui elle vise, ni
// combien attendent d'être lancés, ni ce que sont devenus ceux qui sont partis.
// On inscrivait des prospects depuis quatre écrans et personne ne voyait le
// stock. Une campagne rassemble les quatre en un objet.
//
// DEUX DÉCOMPTES, JAMAIS FUSIONNÉS. La LISTE dit qui doit partir ; les
// INSCRIPTIONS disent ce que sont devenus ceux qui sont partis. Les additionner
// est précisément ce qui faisait compter deux fois le même prospect en haut de
// la page Démarchage — et personne ne savait plus combien de gens il y avait.
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Mail, MessageCircle, Phone, Linkedin, ListChecks, Clock, MessageSquare } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { CompteCampagne } from '@/lib/automations/campagne-db'
import { AssistantCampagne } from './AssistantCampagne'
import './lem-skin.css'

interface Campagne {
  id: string
  nom: string
  description: string
  statut: string
  canaux: string[]
  etapes: number
  liste: CompteCampagne | null
  inscriptions: {
    total: number
    vivantes: number
    ontRepondu: number
    gelees: number
    attenteSansReveil: number
    enlisees: number
    prochainReveil: string | null
  } | null
  majLe: string
}

const ICONE_CANAL: Record<string, React.ComponentType<{ size?: number }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  call: Phone,
  linkedin: Linkedin,
  task: ListChecks,
}

const LIBELLE_STATUT: Record<string, string> = {
  on: 'Active',
  paused: 'En pause',
  draft: 'Brouillon',
  archived: 'Archivée',
}

const TON_STATUT: Record<string, string> = { on: 'ok', paused: 'attention', draft: 'neutre', archived: 'neutre' }

/** Une date lisible, ou un tiret. Jamais « Invalid Date » au milieu d'un tableau. */
const quand = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function CampagnesListe() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([])
  const [chargement, setChargement] = useState(true)
  /**
   * LA LECTURE A-T-ELLE ÉCHOUÉ ?
   *
   * Sans cet état, un 503 « migration non appliquée » ou une session expirée
   * laissait `campagnes` à `[]`, et l'écran répondait « Aucune campagne » avec
   * une invitation à en créer une — alors que la campagne WhatsApp et ses 153
   * leads existent. Pire : la bannière rouge des inscriptions garées se calcule
   * SUR cette liste, donc les 59 que toute la couche existe pour rendre
   * visibles redevenaient silencieuses. Le toast, lui, s'efface.
   */
  const [panne, setPanne] = useState<string | null>(null)

  const charger = useCallback(() => {
    setPanne(null)
    setChargement(true)
    authedFetch('/api/automations/campagnes')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Chargement impossible')
        setCampagnes(j.campagnes ?? [])
      })
      .catch((e: Error) => {
        setPanne(e.message)
        toast.error(e.message)
      })
      .finally(() => setChargement(false))
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // Ce qui bloque se dit à l'endroit où ça bloque, et le total se dit en haut :
  // 59 inscriptions ont dormi des semaines faute d'un compteur qui les nomme.
  const garees = campagnes.reduce((n, c) => n + (c.inscriptions?.attenteSansReveil ?? 0), 0)
  const enlisees = campagnes.reduce((n, c) => n + (c.inscriptions?.enlisees ?? 0), 0)

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Campagnes</h1>
            {/* LE LIEN VERS L'AUTRE FACE FERME LA BOUCLE. Les deux écrans
                listent les mêmes lignes d'`automations` — il n'y a pas de table
                `campagnes` — et ne le disaient nulle part. Le nommer coûte une
                phrase et évite de chercher lequel des deux fait foi. */}
            <p className="lem-sous">
              Une campagne, c’est une séquence <em>et</em> sa liste de leads — qui part, qui reste,
              et pourquoi. Les deux décomptes ci-dessous ne s’additionnent pas : la liste dit ce qui
              doit partir, les inscriptions ce qui est parti. Les étapes, elles, se règlent dans{' '}
              <Link href="/automations/sequences" className="lem-lien">l’éditeur de séquences</Link> —
              même objet, vu par ce qu’il fait plutôt que par à qui.
            </p>
          </div>
          <Link href="/automations/sequences" className="lem-btn principal">
            Nouvelle campagne
          </Link>
        </header>

        {/* LE TROISIÈME DÉPART : décrire l'objectif. « Nouvelle campagne » ouvre
            le constructeur (vierge), la bibliothèque donne les modèles ; il
            manquait la phrase. L'assistant ne crée rien — il chiffre. */}
        <AssistantCampagne />

        {panne && !chargement && (
          <div className="lem-alerte" data-gravite="attention" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>Les inscriptions garées n’ont pas pu être comptées.</b> Ce n’est pas « zéro » —
              c’est « on n’a pas pu lire ». Le compte revient dès que la lecture passe.
            </div>
          </div>
        )}

        {!panne && (garees > 0 || enlisees > 0) && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              {garees > 0 && (
                <div>
                  <b>{garees} inscription{garees > 1 ? 's' : ''} garée{garees > 1 ? 's' : ''} sans réveil.</b>{' '}
                  Elles attendent une réponse sur une étape sans délai : plus rien ne les réveillera.
                  Posez un délai sur l’attente, après avoir écrit ce qu’on dit à quelqu’un qui ne
                  répond pas.
                </div>
              )}
              {enlisees > 0 && (
                <div style={{ marginTop: garees > 0 ? 6 : 0 }}>
                  <b>{enlisees} inscription{enlisees > 1 ? 's' : ''} enlisée{enlisees > 1 ? 's' : ''}.</b>{' '}
                  Ni réveil, ni motif, ni tâche en attente : invisibles partout ailleurs.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="lem-carte">
          {chargement ? (
            <div className="lem-vide">Chargement…</div>
          ) : panne ? (
            <div className="lem-vide" data-ton="danger">
              <h3>Les campagnes n’ont pas pu être lues</h3>
              <p>
                Ce n’est pas une liste vide : on ne sait pas ce qu’elle contient — et le compte des
                inscriptions garées ci-dessus n’a donc pas pu être fait non plus. {panne}
              </p>
              <button className="lem-btn" onClick={charger}>
                Réessayer
              </button>
            </div>
          ) : campagnes.length === 0 ? (
            <div className="lem-vide">
              <h3>Aucune campagne</h3>
              <p>
                On ne part jamais d’une page blanche : ouvrez une séquence existante, elle devient
                une campagne dès qu’on lui donne une liste.
              </p>
              <Link href="/automations/sequences" className="lem-btn principal">
                Voir les séquences
              </Link>
            </div>
          ) : (
            <table className="lem-table">
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>Canaux</th>
                  <th className="num">Liste</th>
                  <th className="num">À lancer</th>
                  <th className="num">Inscrits</th>
                  <th className="num">Ont répondu</th>
                  <th>Prochain envoi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campagnes.map((c) => {
                  const alerte = (c.inscriptions?.attenteSansReveil ?? 0) + (c.inscriptions?.enlisees ?? 0)
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/prospection/campagnes/${c.id}`} style={{ fontWeight: 600, color: 'inherit' }}>
                          {c.nom}
                        </Link>
                        <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="lem-pill" data-ton={TON_STATUT[c.statut] ?? 'neutre'}>
                            {LIBELLE_STATUT[c.statut] ?? c.statut}
                          </span>
                          <span className="lem-decor" style={{ fontSize: 12 }}>
                            {c.etapes} étape{c.etapes > 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
                          {c.canaux.length === 0 ? (
                            <span className="lem-decor" style={{ fontSize: 12 }}>aucun</span>
                          ) : (
                            c.canaux.map((k) => {
                              const I = ICONE_CANAL[k]
                              return I ? <I key={k} size={15} /> : <span key={k}>{k}</span>
                            })
                          )}
                        </span>
                      </td>
                      <td className="num">{c.liste?.total ?? 0}</td>
                      <td className="num">
                        {c.liste?.aLancer ?? 0}
                        {/* Un écart réparable n'est pas un refus : c'est une tâche
                            d'enrichissement, et elle doit se voir depuis l'index. */}
                        {(c.liste?.ecartesRattrapables ?? 0) > 0 && (
                          <span className="lem-decor" style={{ fontSize: 11.5, marginLeft: 6 }}>
                            +{c.liste?.ecartesRattrapables} à préparer
                          </span>
                        )}
                      </td>
                      <td className="num">{c.inscriptions?.vivantes ?? 0}</td>
                      <td className="num">{c.inscriptions?.ontRepondu ?? 0}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {alerte > 0 ? (
                          <span className="lem-pill" data-ton="danger">
                            <AlertTriangle size={12} /> {alerte} sans réveil
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                            <Clock size={13} className="lem-decor" />
                            {quand(c.inscriptions?.prochainReveil ?? null)}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/prospection/campagnes/${c.id}`} className="lem-btn">
                          Ouvrir
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
