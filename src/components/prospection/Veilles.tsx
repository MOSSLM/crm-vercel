'use client'
// Veilles — ce que le CRM surveille, ce qu'il a trouvé, et ce qu'il ne saura pas voir.
//
// TROIS BLOCS, ET LE TROISIÈME EST LE PLUS IMPORTANT :
//   1. les veilles qui tournent, avec leur état en toutes lettres ;
//   2. le catalogue de ce qu'on peut surveiller, avec sa densité MESURÉE — un
//      déclencheur qui vise 305 fiches sur 908 n'est pas un signal, c'est un
//      segment, et l'écran le range à part ;
//   3. ce qui est HORS DE PORTÉE, avec la raison. C'est ce bloc qui évite de
//      redemander « la note d'audit qui chute » tous les trimestres — la
//      réponse est écrite, mesurée, et elle tient en trois lignes.
//
// UNE VEILLE N'AGIT JAMAIS, ET L'ÉCRAN DOIT LE DIRE. Aucun bouton ici
// n'inscrit, n'envoie ni ne crée de tâche. « Traiter » veut dire « j'ai
// regardé ». Verser dans une campagne se fait depuis la campagne, où le geste
// est visible et réversible.
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Bell, Check, EyeOff, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { BilanPasse, Declencheur, EtatVeille, FicheDeclencheur, HorsPortee } from '@/lib/prospection/signaux'
import './lem-skin.css'

interface LigneVeille {
  id: string
  nom: string
  declencheur: Declencheur
  perimetre: 'attribuees' | 'parc'
  actif: boolean
  premierePasseLe: string | null
  dernierePasseLe: string | null
  bilan: BilanPasse | null
  etat: EtatVeille
  phrase: string
  aTraiter: number
}

interface LigneConstat {
  id: number
  entrepriseId: number
  nom: string
  ville: string | null
  telephone: string | null
  vuLe: string
  reprise: boolean
  valeur: Record<string, unknown>
  traiteLe: string | null
}

const TON_ETAT: Record<EtatVeille, string> = {
  jamais_passee: 'neutre',
  reprise_faite: 'attention',
  a_jour: 'ok',
  panne: 'danger',
}

const LIBELLE_ETAT: Record<EtatVeille, string> = {
  jamais_passee: 'jamais passée',
  reprise_faite: 'reprise faite',
  a_jour: 'à jour',
  panne: 'en panne',
}

const jour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'

/** La preuve, telle qu'elle se lit. Sans elle un signal n'est pas actionnable. */
function preuve(valeur: Record<string, unknown>): string {
  const bouts: string[] = []
  if (valeur.date_fin) bouts.push(`échéance ${jour(String(valeur.date_fin))}`)
  if (valeur.qualification) bouts.push(String(valeur.qualification))
  if (valeur.note_globale != null) bouts.push(`note ${valeur.note_globale}/100`)
  if (valeur.http_status != null) bouts.push(`HTTP ${valeur.http_status}`)
  if (valeur.vues_plaquette) bouts.push(`plaquette vue ${valeur.vues_plaquette}×`)
  if (valeur.vues_rapport) bouts.push(`rapport vu ${valeur.vues_rapport}×`)
  if (valeur.url) bouts.push(String(valeur.url))
  return bouts.join(' · ')
}

/* ── Le détail d'une veille ──────────────────────────────────────────────── */

function Detail({ veille, onFerme }: { veille: LigneVeille; onFerme: () => void }) {
  const [lignes, setLignes] = useState<LigneConstat[] | null>(null)
  const [fiche, setFiche] = useState<FicheDeclencheur | null>(null)
  const [panne, setPanne] = useState<string | null>(null)
  const [tronque, setTronque] = useState(false)

  const charger = useCallback(async () => {
    setPanne(null)
    try {
      const r = await authedFetch(`/api/prospection/veilles/${veille.id}`)
      const j = await r.json()
      if (!r.ok) { setPanne(j?.message || j?.error || 'lecture impossible'); setLignes(null); return }
      setLignes(j.lignes ?? [])
      setFiche(j.fiche ?? null)
      setTronque(Boolean(j.tronque))
    } catch {
      setPanne('le serveur n’a pas répondu')
      setLignes(null)
    }
  }, [veille.id])

  useEffect(() => { void charger() }, [charger])

  const traiter = async (constatIds: number[], traite: boolean) => {
    const r = await authedFetch(`/api/prospection/veilles/${veille.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ constatIds, traite }),
    })
    if (!r.ok) { toast.error('Impossible de marquer ce signal.'); return }
    void charger()
  }

  return (
    <div className="lem-carte" style={{ padding: 18, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong>{veille.nom}</strong>
        <span className="lem-pill" data-ton={TON_ETAT[veille.etat]}>{LIBELLE_ETAT[veille.etat]}</span>
        <button className="lem-btn" style={{ marginLeft: 'auto' }} onClick={onFerme}>Fermer</button>
      </div>

      {fiche && (
        <p className="lem-second" style={{ fontSize: 12.5, marginBottom: 12 }}>
          {fiche.accroche} <span style={{ opacity: 0.7 }}>— lu dans {fiche.source}.</span>
        </p>
      )}

      {/* LES QUATRE VIDES, ET ILS NE DISENT PAS LA MÊME CHOSE. Une lecture qui
          échoue, une veille jamais lancée, une veille qui n'a rien trouvé et
          une veille dont tout a été traité mènent à quatre décisions
          différentes. Les fondre en un seul « aucun signal » est exactement ce
          que cet écran ne doit pas faire. */}
      {panne ? (
        <div className="lem-vide" data-ton="danger">
          <strong>Les signaux n’ont pas pu être lus.</strong>
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 4 }}>
            {panne}. Ce n’est pas « aucun signal » — on ne sait pas.
          </div>
        </div>
      ) : lignes === null ? (
        <div className="lem-second">Lecture…</div>
      ) : lignes.length === 0 ? (
        <div className="lem-vide">
          <strong>
            {veille.etat === 'jamais_passee'
              ? 'Cette veille n’a jamais tourné.'
              : 'Cette veille a cherché et n’a rien trouvé.'}
          </strong>
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 4 }}>{veille.phrase}</div>
        </div>
      ) : (
        <>
          {tronque && (
            <div className="lem-pill" data-ton="attention" style={{ marginBottom: 8 }}>
              affichage limité à 500 lignes — le relevé en compte davantage
            </div>
          )}
          <table className="lem-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Ce qui a déclenché</th>
                <th>Vu le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} style={l.traiteLe ? { opacity: 0.5 } : undefined}>
                  <td>
                    {/* LE DOSSIER VIT À `/companies/[id]`, pas `/entreprises/[id]` — cette
                        seconde URL n'existe pas. Un signal qui ne s'ouvre pas sur une fiche
                        ne sert à rien : c'est le geste suivant du lecteur. */}
                    <a href={`/companies/${l.entrepriseId}`} style={{ fontWeight: 600 }}>{l.nom}</a>
                    <div className="lem-second" style={{ fontSize: 11.5 }}>
                      {[l.ville, l.telephone].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td className="lem-second" style={{ fontSize: 12.5 }}>{preuve(l.valeur) || '—'}</td>
                  <td className="lem-second" style={{ fontSize: 12.5 }}>
                    {jour(l.vuLe)}
                    {/* Une ligne d'arriéré n'est pas un événement du jour, et
                        elle doit le dire ligne à ligne — pas seulement en
                        en-tête, qu'on ne relit pas. */}
                    {l.reprise && <span className="lem-pill" data-ton="neutre" style={{ marginLeft: 6 }}>arriéré</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="lem-btn" onClick={() => traiter([l.id], !l.traiteLe)}>
                      {l.traiteLe ? 'Rouvrir' : <><Check size={13} /> Vu</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

/* ── L'écran ─────────────────────────────────────────────────────────────── */

export function Veilles() {
  const [veilles, setVeilles] = useState<LigneVeille[] | null>(null)
  const [declencheurs, setDeclencheurs] = useState<FicheDeclencheur[]>([])
  const [horsPortee, setHorsPortee] = useState<HorsPortee[]>([])
  const [panne, setPanne] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setPanne(null)
    try {
      const r = await authedFetch('/api/prospection/veilles')
      const j = await r.json()
      if (!r.ok) { setPanne(j?.message || j?.error || 'lecture impossible'); setVeilles(null); return }
      setVeilles(j.veilles ?? [])
      setDeclencheurs(j.declencheurs ?? [])
      setHorsPortee(j.horsPortee ?? [])
    } catch {
      setPanne('le serveur n’a pas répondu')
      setVeilles(null)
    }
  }, [])

  useEffect(() => { void charger() }, [charger])

  const creer = async (f: FicheDeclencheur) => {
    const r = await authedFetch('/api/prospection/veilles', {
      method: 'POST',
      body: JSON.stringify({ nom: f.libelle, declencheur: f.cle, perimetre: 'attribuees' }),
    })
    const j = await r.json()
    if (!r.ok) { toast.error(j?.message || j?.error || 'Création impossible.'); return }
    toast.success(`Veille « ${f.libelle} » créée — elle n’a pas encore tourné.`)
    void charger()
  }

  const passer = async (v: LigneVeille) => {
    setEnCours(v.id)
    try {
      const r = await authedFetch(`/api/prospection/veilles/${v.id}/passe`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { toast.error(j?.message || j?.error || 'La passe a échoué.'); return }
      toast.success(j.phrase ?? 'Passe terminée.')
      void charger()
    } finally {
      setEnCours(null)
    }
  }

  const supprimer = async (v: LigneVeille) => {
    const r = await authedFetch('/api/prospection/veilles', {
      method: 'DELETE',
      body: JSON.stringify({ id: v.id }),
    })
    if (!r.ok) { toast.error('Suppression impossible.'); return }
    void charger()
  }

  const dejaPrise = new Set((veilles ?? []).map((v) => v.declencheur))

  return (
    <div className="lem-skin"><div className="lem-page">
      <header style={{ marginBottom: 18 }}>
        <h1 className="lem-titre"><Bell size={19} /> Signaux</h1>
        <p className="lem-second" style={{ fontSize: 13, maxWidth: 760 }}>
          Une veille surveille un déclencheur sur un périmètre, et ne fait que le montrer :
          elle n’inscrit personne, n’envoie rien, ne crée aucune tâche.
          <strong> Sa première passe ramasse l’arriéré</strong> — les 220 sites injoignables
          ne sont pas tombés cette nuit.
        </p>
      </header>

      {/* Les veilles en service */}
      {panne ? (
        <div className="lem-vide" data-ton="danger">
          <strong>Les veilles n’ont pas pu être lues.</strong>
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 4 }}>
            {panne}. Ce n’est pas « aucune veille » — la liste est peut-être pleine.
          </div>
          <button className="lem-btn" style={{ marginTop: 10 }} onClick={() => void charger()}>
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      ) : veilles === null ? (
        <div className="lem-second">Lecture…</div>
      ) : veilles.length === 0 ? (
        <div className="lem-vide">
          <strong>Aucune veille en service.</strong>
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 4 }}>
            La lecture a réussi : rien n’a encore été mis sous surveillance. Le catalogue ci-dessous
            dit ce qu’on peut surveiller, et combien de fiches c’est aujourd’hui.
          </div>
        </div>
      ) : (
        veilles.map((v) => (
          <div key={v.id}>
            <div className="lem-carte" style={{ padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong>{v.nom}</strong>
                <span className="lem-pill" data-ton={TON_ETAT[v.etat]}>{LIBELLE_ETAT[v.etat]}</span>
                <span className="lem-pill" data-ton="neutre">
                  {v.perimetre === 'parc' ? 'tout le parc' : 'les attribuées'}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="lem-btn" disabled={enCours === v.id} onClick={() => void passer(v)}>
                    <Play size={13} /> {enCours === v.id ? 'Passe…' : v.premierePasseLe ? 'Passer' : 'Première passe'}
                  </button>
                  <button className="lem-btn" onClick={() => setOuverte(ouverte === v.id ? null : v.id)}>
                    {v.aTraiter} à regarder
                  </button>
                  <button className="lem-btn" onClick={() => void supprimer(v)} title="Supprimer la veille et sa mémoire">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="lem-second" style={{ fontSize: 12.5, marginTop: 6 }}>
                {v.phrase} <span style={{ opacity: 0.7 }}>Dernière passe : {jour(v.dernierePasseLe)}.</span>
              </div>
            </div>
            {ouverte === v.id && <Detail veille={v} onFerme={() => setOuverte(null)} />}
          </div>
        ))
      )}

      {/* Le catalogue — signaux d'abord, segments ensuite, densité mesurée */}
      <h2 className="lem-titre" style={{ fontSize: 15, marginTop: 26 }}>Ce qu’on sait surveiller</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {declencheurs.map((f) => (
          <div key={f.cle} className="lem-carte" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{f.libelle}</strong>
              <span className="lem-pill" data-ton={f.nature === 'signal' ? 'ok' : 'neutre'}>
                {f.nature === 'signal' ? 'signal' : 'segment — à verser dans une campagne'}
              </span>
              <span className="lem-pill" data-ton="neutre">
                {f.densite.attribuees} attribuée{f.densite.attribuees > 1 ? 's' : ''}
                {f.densite.parc != null && f.densite.parc !== f.densite.attribuees && ` · ${f.densite.parc} au parc`}
              </span>
              <button
                className="lem-btn"
                style={{ marginLeft: 'auto' }}
                disabled={dejaPrise.has(f.cle)}
                onClick={() => void creer(f)}
              >
                <Plus size={13} /> {dejaPrise.has(f.cle) ? 'déjà surveillé' : 'Surveiller'}
              </button>
            </div>
            <div className="lem-second" style={{ fontSize: 12.5, marginTop: 6 }}>{f.accroche}</div>
            <div className="lem-second" style={{ fontSize: 11.5, marginTop: 4, opacity: 0.75 }}>{f.source}</div>
          </div>
        ))}
      </div>

      {/* CE QU'ON NE SAIT PAS VOIR. Le bloc qui empêche de le redemander. */}
      <h2 className="lem-titre" style={{ fontSize: 15, marginTop: 26 }}>
        <EyeOff size={16} /> Ce qu’on ne sait pas voir, et pourquoi
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {horsPortee.map((h) => (
          <div key={h.cle} className="lem-carte" style={{ padding: 14, opacity: 0.8 }}>
            <strong style={{ fontSize: 14 }}>{h.libelle}</strong>
            <div className="lem-second" style={{ fontSize: 12.5, marginTop: 6 }}>{h.raison}</div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              <span className="lem-pill" data-ton="attention">ce qu’il faudrait</span>{' '}
              <span className="lem-second">{h.ceQuIlFaudrait}</span>
            </div>
          </div>
        ))}
      </div>
    </div></div>
  )
}
