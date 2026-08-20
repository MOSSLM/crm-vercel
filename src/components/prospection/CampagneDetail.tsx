'use client'
// CampagneDetail — la campagne : sa liste, et sa revue avant lancement.
//
// C'EST LE SEUL ÉCRAN VRAIMENT NEUF DE LA REFONTE. Le constructeur de séquence,
// les tâches, les statistiques existent déjà et se raccordent. Ce qui n'existait
// nulle part, c'est la liste de leads d'une campagne : qui est dedans, qui part,
// et pourquoi les autres ne partent pas.
//
// DEUX ONGLETS, DEUX QUESTIONS. « Leads » répond à *qui* ; « Lancement » répond
// à *qu'est-ce qui part*. Un écran qui répond à deux questions à la fois est
// l'écran surchargé qu'on remplace.
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Plus, Rocket, RotateCcw, X } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { MotifEcart, RevueCampagne, StatutListe } from '@/lib/automations/campagne'
import {
  ENGAGEMENT_LABEL,
  PROGRESSION_LABEL,
  type Engagement,
  type Etage,
  type Progression,
} from '@/lib/automations/statut-lead'
import type { ControleLancement } from '@/lib/automations/campagne'
import './lem-skin.css'

interface LeadLigne {
  id: number
  entrepriseId: number
  entreprise: { id: number; name: string | null; ville: string | null; email: string | null; telephone: string | null } | null
  origine: string
  statut: StatutListe
  motifEcart: MotifEcart | null
  motifLibelle: string | null
  rattrapable: boolean
  enrollmentId: string | null
  /** Les deux axes de la couche 3. `null` = le relevé n'a rien rendu. */
  statutLead: {
    progression: Progression
    engagement: Engagement
    etage: Etage
    mesure: boolean
    motif: string | null
  } | null
}

interface Revue {
  campagne: { id: string; nom: string; statut: string; etapes: number; canaux: string[] }
  controles: ControleLancement[]
  peutLancer: boolean
  decompte: RevueCampagne
  prochains: { entrepriseId: number; entreprise: { name: string | null; ville: string | null } | null }[]
}

interface Segment { id: string; nom: string }
interface Lot { id: string; nom: string; taille: number }

const LIBELLE_STATUT_LISTE: Record<StatutListe, string> = {
  a_lancer: 'À lancer',
  inscrit: 'Inscrit',
  ecarte: 'Écarté',
  termine: 'Terminé',
}

const TON_STATUT_LISTE: Record<StatutListe, string> = {
  a_lancer: 'default',
  inscrit: 'ok',
  ecarte: 'neutre',
  termine: 'neutre',
}

/**
 * DEUX COLONNES, PAS UN BADGE. lemlist aplatit ses seize statuts sur une ligne,
 * et c'est ce qui les rend ambigus : un lead peut être « envoyé » ET « en
 * pause ». Ici la progression dit ce que le CRM fait, l'engagement dit ce que
 * le prospect a fait. Elles ne se contredisent jamais parce qu'elles ne
 * répondent pas à la même question.
 */
const TON_PROGRESSION: Readonly<Record<Progression, string>> = {
  a_preparer: 'attention',
  a_lancer: 'default',
  ecarte: 'neutre',
  en_cours: 'ok',
  // Un gel se voit, ou 59 inscriptions dorment trois semaines sans que
  // personne ne le sache. C'est le seul rouge de la colonne.
  gele: 'danger',
  en_pause: 'neutre',
  termine: 'neutre',
}

const TON_ENGAGEMENT: Readonly<Record<Engagement, string>> = {
  non_mesure: 'neutre',
  envoye: 'default',
  remis: 'default',
  echec: 'danger',
  rebond: 'danger',
  vu: 'ok',
  repondu: 'ok',
  plus_tard: 'attention',
  interesse: 'ok',
  pas_interesse: 'neutre',
  desabonne: 'danger',
}

const PAGE = 50

export function CampagneDetail({ id }: { id: string }) {
  const [onglet, setOnglet] = useState<'leads' | 'lancement'>('leads')
  const [leads, setLeads] = useState<LeadLigne[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filtreStatut, setFiltreStatut] = useState<StatutListe | ''>('')
  const [revue, setRevue] = useState<Revue | null>(null)
  const [chargement, setChargement] = useState(true)
  /**
   * LA LECTURE A-T-ELLE ÉCHOUÉ ? Sans cet état, `leads` restait à `[]` et
   * l'écran affirmait « cette campagne n'a pas encore de liste » — sur une
   * campagne qui en a 153 — en invitant à en verser une. Un toast qui s'efface
   * ne rattrape pas une phrase qui reste.
   */
  const [panne, setPanne] = useState<string | null>(null)
  const [travail, setTravail] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [taille, setTaille] = useState(25)

  const chargerLeads = useCallback(async () => {
    const p = new URLSearchParams({ limite: String(PAGE), offset: String(offset) })
    if (filtreStatut) p.set('statut', filtreStatut)
    const r = await authedFetch(`/api/automations/campagnes/${id}/leads?${p}`)
    const j = await r.json()
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Chargement impossible')
    setLeads(j.items ?? [])
    setTotal(j.total ?? 0)
  }, [id, offset, filtreStatut])

  const chargerRevue = useCallback(async () => {
    const r = await authedFetch(`/api/automations/campagnes/${id}/revue`)
    const j = await r.json()
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Chargement impossible')
    setRevue(j)
  }, [id])

  useEffect(() => {
    setPanne(null)
    Promise.all([chargerLeads(), chargerRevue()])
      .catch((e: Error) => {
        setPanne(e.message)
        toast.error(e.message)
      })
      .finally(() => setChargement(false))
  }, [chargerLeads, chargerRevue])

  // Les sources d'audience ne se chargent qu'une fois : elles ne dépendent pas
  // de la page de leads qu'on regarde.
  useEffect(() => {
    authedFetch('/api/entreprises/segments')
      .then((r) => r.json())
      .then((j) => setSegments(j?.segments ?? []))
      .catch(() => {})
    authedFetch('/api/entreprises/lots')
      .then((r) => r.json())
      .then((j) => setLots(j?.lots ?? []))
      .catch(() => {})
  }, [])

  const ajouter = async (corps: Record<string, unknown>) => {
    setTravail(true)
    try {
      const r = await authedFetch(`/api/automations/campagnes/${id}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Ajout impossible')

      if (corps.origine === 'reprise') {
        toast.success(`${j.reprises} inscription(s) reprise(s), ${j.misAJour} mise(s) à jour`)
      } else {
        // « restant » n'est pas un détail : sans lui, un segment plus large que
        // la page s'ajouterait tronqué sans que rien ne le dise, et la campagne
        // mesurerait une population qu'elle croit complète.
        const suite = j.restant > 0 ? ` — ${j.restant} encore à ajouter` : ''
        toast.success(`${j.ajoutes} lead(s) ajouté(s), ${j.deja} déjà présent(s)${suite}`)
      }
      await Promise.all([chargerLeads(), chargerRevue()])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTravail(false)
    }
  }

  const majLead = async (entrepriseId: number, action: 'ecarter' | 'reintegrer') => {
    try {
      const r = await authedFetch(`/api/automations/campagnes/${id}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entreprise_id: entrepriseId, action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Modification impossible')
      await Promise.all([chargerLeads(), chargerRevue()])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const lancer = async () => {
    setTravail(true)
    try {
      const r = await authedFetch(`/api/automations/campagnes/${id}/lancer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taille }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Lancement refusé')
      toast.success(`${j.lances} inscrit(s) — ${j.restant} encore à lancer`)
      await Promise.all([chargerLeads(), chargerRevue()])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTravail(false)
    }
  }

  const bloquants = revue?.controles.filter((c) => c.gravite === 'bloquant') ?? []
  const avertissements = revue?.controles.filter((c) => c.gravite === 'avertissement') ?? []

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <Link href="/prospection/campagnes" className="lem-btn discret" style={{ marginBottom: 8, paddingLeft: 0 }}>
              <ArrowLeft size={15} /> Campagnes
            </Link>
            <h1 className="lem-titre">{revue?.campagne.nom ?? 'Campagne'}</h1>
            <p className="lem-sous">
              {revue?.campagne.etapes ?? 0} étape(s) · {revue?.campagne.canaux.join(', ') || 'aucun canal'}
            </p>
          </div>
          <Link href={`/automations/${id}`} className="lem-btn">
            Ouvrir la séquence
          </Link>
        </header>

        <nav style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['leads', 'lancement'] as const).map((o) => (
            <button
              key={o}
              className={`lem-btn${onglet === o ? ' principal' : ' discret'}`}
              onClick={() => setOnglet(o)}
            >
              {o === 'leads' ? `Leads ${total}` : 'Lancement'}
            </button>
          ))}
        </nav>

        {/* Ce qui bloque se dit EN FRANÇAIS, à l'endroit où ça bloque. Un
            lancement refusé sans motif lisible est ce qui fait recliquer. */}
        {bloquants.map((c) => (
          <div key={c.code} className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 10 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{c.message}</div>
          </div>
        ))}
        {avertissements.map((c) => (
          <div key={c.code} className="lem-alerte" style={{ marginBottom: 10 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{c.message}</div>
          </div>
        ))}

        {onglet === 'leads' ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <select
                className="lem-btn"
                value={filtreStatut}
                onChange={(e) => {
                  setOffset(0)
                  setFiltreStatut(e.target.value as StatutListe | '')
                }}
              >
                <option value="">Tous les statuts</option>
                {(Object.keys(LIBELLE_STATUT_LISTE) as StatutListe[]).map((s) => (
                  <option key={s} value={s}>{LIBELLE_STATUT_LISTE[s]}</option>
                ))}
              </select>

              <select
                className="lem-btn"
                value=""
                disabled={travail}
                onChange={(e) => e.target.value && ajouter({ origine: 'segment', segment_id: e.target.value })}
              >
                <option value="">Ajouter depuis un segment…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>

              <select
                className="lem-btn"
                value=""
                disabled={travail}
                onChange={(e) => e.target.value && ajouter({ origine: 'lot', lot_id: e.target.value })}
              >
                <option value="">Ajouter depuis un lot…</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>{l.nom} ({l.taille})</option>
                ))}
              </select>

              {/* LA REPRISE, C'EST « MES LEADS NE SERONT PAS PERDUS ». Les
                  prospects déjà inscrits à cette séquence entrent dans sa liste
                  tels quels, sans repasser par un premier contact. */}
              <button className="lem-btn" disabled={travail} onClick={() => ajouter({ origine: 'reprise' })}>
                <Plus size={14} /> Reprendre les inscriptions en cours
              </button>
            </div>

            <div className="lem-carte">
              {/*
                TROIS VIDES, TROIS PHRASES. Ils étaient confondus en une seule,
                et c'est la plus grave des trois qui s'affichait toujours :
                « cette campagne n'a pas encore de liste », avec une invitation
                à verser un segment — y compris sur une campagne de 153 leads
                qu'on venait simplement de filtrer sur « Écarté ».
              */}
              {chargement ? (
                <div className="lem-vide">Chargement…</div>
              ) : panne ? (
                <div className="lem-vide" data-ton="danger">
                  <h3>La liste n’a pas pu être lue</h3>
                  <p>
                    Ce n’est pas une campagne vide : on ne sait pas ce qu’elle contient. {panne}
                  </p>
                  <button className="lem-btn" onClick={() => { setPanne(null); setChargement(true); chargerLeads().catch((e: Error) => setPanne(e.message)).finally(() => setChargement(false)) }}>
                    Réessayer
                  </button>
                </div>
              ) : leads.length === 0 && filtreStatut ? (
                <div className="lem-vide">
                  <h3>Aucun lead « {LIBELLE_STATUT_LISTE[filtreStatut]} »</h3>
                  <p>
                    La campagne a une liste — c’est ce filtre qui n’y trouve personne.
                  </p>
                  <button className="lem-btn" onClick={() => { setFiltreStatut(''); setOffset(0) }}>
                    Voir tous les statuts
                  </button>
                </div>
              ) : leads.length === 0 ? (
                <div className="lem-vide">
                  <h3>Cette campagne n’a pas encore de liste</h3>
                  <p>
                    Ajoutez-en une depuis un segment (une requête qu’on rejoue), un lot (une photo
                    figée), ou reprenez les prospects déjà inscrits à cette séquence.
                  </p>
                </div>
              ) : (
                <table className="lem-table">
                  <thead>
                    <tr>
                      <th>Entreprise</th>
                      <th>Canaux</th>
                      <th>Où en est l’envoi</th>
                      <th>Ce qu’il a fait</th>
                      <th>Dans la liste</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{l.entreprise?.name ?? `#${l.entrepriseId}`}</div>
                          <div className="lem-decor" style={{ fontSize: 12 }}>{l.entreprise?.ville ?? '—'}</div>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {[l.entreprise?.email && 'e-mail', l.entreprise?.telephone && 'téléphone']
                            .filter(Boolean)
                            .join(' · ') || <span className="lem-decor">aucun</span>}
                        </td>
                        <td>
                          {l.statutLead ? (
                            <>
                              <span className="lem-pill" data-ton={TON_PROGRESSION[l.statutLead.progression]}>
                                {PROGRESSION_LABEL[l.statutLead.progression]}
                              </span>
                              {/* « Gelé » tout court accuse sans instruire, et
                                  mélange une attente qui se termine dans trois
                                  jours avec une attente que rien ne réveillera.
                                  Le motif tranche, et il dit le geste suivant. */}
                              {l.statutLead.motif && (
                                <div style={{ fontSize: 12, marginTop: 3, color: 'var(--lem-gris-2)' }}>
                                  {l.statutLead.motif}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="lem-decor" style={{ fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td>
                          {/* NON MESURÉ N'EST PAS UN ZÉRO. Depuis qu'on n'active
                              ni pixel d'ouverture ni réécriture de liens, c'est
                              la valeur la plus fréquente — et l'afficher comme
                              « aucune réaction » ferait condamner des prospects
                              dont on n'a simplement rien su. */}
                          {l.statutLead ? (
                            <span
                              className="lem-pill"
                              data-ton={TON_ENGAGEMENT[l.statutLead.engagement]}
                              title={
                                l.statutLead.mesure
                                  ? undefined
                                  : 'Rien n’a été mesuré pour ce prospect — ce n’est pas une absence de réaction.'
                              }
                            >
                              {ENGAGEMENT_LABEL[l.statutLead.engagement]}
                            </span>
                          ) : (
                            <span className="lem-decor" style={{ fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className="lem-pill" data-ton={TON_STATUT_LISTE[l.statut]}>
                            {LIBELLE_STATUT_LISTE[l.statut]}
                          </span>
                          {/* Le motif ne s'affiche jamais nu : « 41 écartés » ne
                              dit rien, « 22 sans canal » désigne le geste suivant. */}
                          {l.motifLibelle && (
                            <div style={{ fontSize: 12, marginTop: 3, color: l.rattrapable ? 'var(--lem-attention)' : 'var(--lem-gris-2)' }}>
                              {l.motifLibelle}{l.rattrapable ? ' — réparable' : ''}
                            </div>
                          )}
                          <div className="lem-decor" style={{ fontSize: 12, marginTop: 3 }}>{l.origine}</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {l.statut === 'a_lancer' && (
                            <button className="lem-btn discret" onClick={() => majLead(l.entrepriseId, 'ecarter')}>
                              <X size={14} /> Écarter
                            </button>
                          )}
                          {l.statut === 'ecarte' && (
                            <button className="lem-btn discret" onClick={() => majLead(l.entrepriseId, 'reintegrer')}>
                              <RotateCcw size={14} /> Réintégrer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {total > PAGE && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                <button className="lem-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - PAGE, 0))}>
                  Précédent
                </button>
                <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--lem-gris-2)' }}>
                  {offset + 1}–{Math.min(offset + PAGE, total)} sur {total}
                </span>
                <button className="lem-btn" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
                  Suivant
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
            <div className="lem-carte" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Qui part</h3>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--lem-gris-2)' }}>
                Recalculé à l’instant, jamais lu dans la liste : entre l’ajout et le lancement, un
                prospect a pu être enrichi, archivé, ou répondre.
              </p>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{revue?.decompte.aLancer ?? 0}</div>
              <div style={{ fontSize: 13, color: 'var(--lem-gris-2)', marginBottom: 14 }}>
                sur {revue?.decompte.total ?? 0} leads de la liste
              </div>

              {(revue?.decompte.parMotif.length ?? 0) > 0 && (
                <table className="lem-table">
                  <thead>
                    <tr><th>Écartés</th><th className="num">Nombre</th><th /></tr>
                  </thead>
                  <tbody>
                    {revue?.decompte.parMotif.map((m) => (
                      <tr key={m.motif}>
                        <td>{m.label}</td>
                        <td className="num">{m.n}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="lem-pill" data-ton={m.rattrapable ? 'attention' : 'neutre'}>
                            {m.rattrapable ? 'réparable' : 'définitif'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="lem-carte" style={{ padding: 18, alignSelf: 'start' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Lancer un paquet</h3>
              {/* PAR PAQUETS, ET CE N'EST PAS UN CONFORT. Le régulateur espace
                  les e-mails, mais une étape manuelle crée sa tâche tout de
                  suite : 300 WhatsApp lancés d'un coup, c'est 300 cartes le
                  même matin dans la file d'un agent qui en fait 60. */}
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--lem-gris-2)' }}>
                Les étapes manuelles créent leur tâche immédiatement. Un agent en traite 60 par
                jour : mieux vaut plusieurs paquets qu’une file illisible.
              </p>
              <label style={{ display: 'block', fontSize: 12.5, marginBottom: 6 }}>Taille du paquet</label>
              <input
                type="number"
                min={1}
                max={200}
                value={taille}
                onChange={(e) => setTaille(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="lem-btn"
                style={{ width: '100%', marginBottom: 12 }}
              />
              <button
                className="lem-btn principal"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={travail || !revue?.peutLancer}
                onClick={lancer}
              >
                <Rocket size={15} /> Lancer {Math.min(taille, revue?.decompte.aLancer ?? 0)} lead(s)
              </button>

              {(revue?.prochains.length ?? 0) > 0 && (
                <>
                  <div style={{ fontSize: 12.5, color: 'var(--lem-gris-2)', margin: '16px 0 6px' }}>
                    Les premiers à partir
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7 }}>
                    {revue?.prochains.slice(0, 8).map((p) => (
                      <li key={p.entrepriseId}>{p.entreprise?.name ?? `#${p.entrepriseId}`}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
