'use client'
// EtatSequences — la carte des inscrits, bloc par bloc.
//
// LE MANQUE, DIT PAR MATTEO : « j'ai besoin de voir où dans la séquence on en
// est pour chaque tâche […] voir combien de tâches en cours pour chaque bloc.
// Ce qui manque c'est vraiment une vue concrète sur ce qu'il se passe dans les
// séquences, où on en est. »
//
// DEUX ÉCRANS RÉPONDAIENT À CÔTÉ. Les statistiques disent la PERFORMANCE
// (envoyés, réponses, RDV) — du passé, agrégé. La frise de « Ma journée » dit
// la position d'UN prospect. Entre les deux, personne ne savait combien de gens
// sont arrêtés sur l'étape 6, ni depuis quand, ni ce qui les y retient.
//
// POURQUOI UNE FRISE ET PAS UN TABLEAU. Une séquence se lit dans son ordre. Un
// tableau trié par nombre d'occupants répondrait à la lettre et raterait le
// fait le plus utile : le trou entre deux blocs, et l'endroit précis où tout le
// monde s'entasse.
//
// LE CHIFFRE QUI COMPTE EST « GARÉES ». Ni tâche, ni horloge : rien ne les fera
// bouger. C'est un état que le moteur documente déjà (`garerTacheAnnulee`) mais
// qu'aucun écran ne montrait — 524 inscriptions dans ce cas au 23/08/2026.
// L'encart le dit en toutes lettres plutôt que de le laisser dans une colonne.
//
// CE QUE CET ÉCRAN NE FAIT PAS : relancer. Réveiller cinq cents inscriptions
// est une écriture de masse, donc un geste qui s'archive avant et se fait par
// lots — pas un bouton posé au bout d'un compteur.
import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { holdReasonLabel, NATURE_LABEL, type HoldReason } from '@/lib/automations/regulator'
import { BLOCS_DE_STRUCTURE, type EtatSequence } from '@/lib/prospection/etat-sequences'
import './lem-skin.css'

const nb = (n: number): string => n.toLocaleString('fr-FR')

/** « dans 3 h », « demain », « le 02/09 » — l'horizon, pas l'horodatage. */
function horizon(iso: string | null): string | null {
  if (!iso) return null
  const quand = Date.parse(iso)
  if (Number.isNaN(quand)) return null
  const minutes = Math.round((quand - Date.now()) / 60000)
  if (minutes <= 0) return 'maintenant'
  if (minutes < 60) return `dans ${minutes} min`
  if (minutes < 60 * 24) return `dans ${Math.round(minutes / 60)} h`
  const jours = Math.round(minutes / (60 * 24))
  if (jours === 1) return 'demain'
  if (jours < 8) return `dans ${jours} jours`
  return `le ${new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

function Bloc({ bloc }: { bloc: EtatSequence['blocs'][number] }) {
  const structure = BLOCS_DE_STRUCTURE.includes(bloc.kind)
  const quand = horizon(bloc.prochain)
  return (
    <div
      className="lem-bloc"
      data-vide={bloc.inscrits === 0 ? 'oui' : undefined}
      data-garees={bloc.garees > 0 ? 'oui' : undefined}
    >
      <div className="rang">
        <span className="n">{bloc.index + 1}</span>
        {structure ? 'aiguillage' : bloc.kind === 'wait' ? 'attente' : bloc.kind}
      </div>
      <div className="titre">{bloc.label}</div>

      <div className="compte">
        {bloc.inscrits === 0 ? '—' : nb(bloc.inscrits)}
        {bloc.inscrits > 0 && <small>ici</small>}
      </div>

      <div className="etats">
        {bloc.garees > 0 && (
          <span className="lem-pill" data-ton="danger" title="Ni tâche, ni date de reprise : rien ne les fera bouger.">
            {nb(bloc.garees)} garées
          </span>
        )}
        {bloc.enRetard > 0 && (
          <span className="lem-pill" data-ton="attention">{nb(bloc.enRetard)} en retard</span>
        )}
        {bloc.taches - bloc.enRetard > 0 && (
          <span className="lem-pill" data-ton="neutre">
            {nb(bloc.taches - bloc.enRetard)} à faire
          </span>
        )}
        {bloc.programmes > 0 && (
          <span className="lem-pill" data-ton="ok" title={quand ? `Prochain départ ${quand}` : undefined}>
            {nb(bloc.programmes)} {quand ?? 'programmées'}
          </span>
        )}
      </div>
    </div>
  )
}

function Carte({ seq }: { seq: EtatSequence }) {
  // Le motif dominant des inscriptions garées, tous blocs confondus : c'est lui
  // qui dit quoi lever, et c'est la seule chose à faire de cette carte.
  const motifs = new Map<string, { n: number; nature: string }>()
  for (const bloc of seq.blocs) {
    if (bloc.garees === 0) continue
    for (const m of bloc.motifs) {
      const vu = motifs.get(m.motif)
      motifs.set(m.motif, { n: (vu?.n ?? 0) + m.n, nature: m.nature })
    }
  }
  const dominant = [...motifs.entries()].sort((a, b) => b[1].n - a[1].n)[0]

  return (
    <div className="lem-carte" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', padding: '13px 16px',
        }}
      >
        <strong style={{ fontSize: 14.5 }}>{seq.nom}</strong>
        <span className="lem-pill" data-ton={seq.statut === 'on' ? 'ok' : 'attention'}>
          {seq.statut === 'on' ? 'active' : 'en pause'}
        </span>
        <span className="lem-second" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          {nb(seq.actives)} en cours · {nb(seq.taches)} à faire
          {seq.enRetard > 0 ? ` · ${nb(seq.enRetard)} en retard` : ''}
          {seq.termines > 0 ? ` · ${nb(seq.termines)} terminées` : ''}
          {seq.sorties > 0 ? ` · ${nb(seq.sorties)} sorties` : ''}
        </span>
      </div>

      {seq.garees > 0 && (
        <div className="lem-alerte" data-gravite="bloquant" style={{ margin: '0 16px 12px' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>{nb(seq.garees)} inscription(s) garée(s).</b> Elles ne portent aucune tâche et
            aucune date de reprise&nbsp;: aucun passage du moteur ne les reprendra, elles
            resteront là tant qu’on ne les relance pas à la main.
            {dominant && (
              <>
                {' '}Motif le plus fréquent&nbsp;: «&nbsp;{holdReasonLabel(dominant[0] as HoldReason, null)}
                &nbsp;» ({nb(dominant[1].n)}) — {NATURE_LABEL[dominant[1].nature as keyof typeof NATURE_LABEL]}.
              </>
            )}
          </div>
        </div>
      )}

      {seq.horsPlan > 0 && (
        <div className="lem-alerte" style={{ margin: '0 16px 12px' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>{nb(seq.horsPlan)} inscription(s) hors plan.</b> Leur étape courante n’existe plus
            dans la définition — la séquence a été raccourcie pendant qu’elles y étaient. Elles ne
            sont comptées dans aucun bloc, volontairement&nbsp;: ce n’est pas un état, c’est une
            incohérence.
          </div>
        </div>
      )}

      {seq.blocs.length === 0 ? (
        <div className="lem-second" style={{ padding: '0 16px 14px', fontSize: 13 }}>
          Cette séquence n’a aucune étape.
        </div>
      ) : (
        <div className="lem-frise">
          {seq.blocs.map((bloc) => (
            <Bloc key={bloc.id || bloc.index} bloc={bloc} />
          ))}
        </div>
      )}
    </div>
  )
}

export function EtatSequences({
  endpoint = '/api/prospection/sequences/etat',
}: {
  endpoint?: string
} = {}) {
  const [sequences, setSequences] = useState<EtatSequence[] | null>(null)
  const [chargement, setChargement] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    setPanne(null)
    try {
      const r = await authedFetch(endpoint)
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.error ?? j?.message ?? 'La lecture a échoué.')
        setSequences(null)
        return
      }
      setSequences(Array.isArray(j?.sequences) ? j.sequences : [])
    } catch {
      // Une panne de lecture n'est pas une séquence vide : les confondre, c'est
      // annoncer « plus personne en séquence » à quelqu'un qui en a six cents.
      setPanne('La lecture a échoué.')
      setSequences(null)
    } finally {
      setChargement(false)
    }
  }, [endpoint])

  useEffect(() => {
    void charger()
  }, [charger])

  const garees = (sequences ?? []).reduce((n, s) => n + s.garees, 0)

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Où on en est</h1>
            <p className="lem-sous">
              Chaque inscription est arrêtée sur un bloc, et sur un seul. Sous chaque bloc&nbsp;:
              combien de gens y sont, combien portent une tâche à faire, et combien n’attendent
              plus rien du tout.
            </p>
          </div>
          <button className="lem-btn" onClick={() => void charger()} disabled={chargement}>
            <RefreshCw size={14} /> {chargement ? 'Lecture…' : 'Relire'}
          </button>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{panne}</div>
          </div>
        )}

        {garees > 0 && (
          <div className="lem-alerte" style={{ marginBottom: 14 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>{nb(garees)} inscription(s) garée(s) au total.</b> C’est le seul chiffre de cet
              écran qui demande une décision&nbsp;: le reste avance, elles non.
            </div>
          </div>
        )}

        {sequences?.length === 0 && !panne && (
          <div className="lem-carte lem-vide">
            <h3>Aucune séquence à suivre</h3>
            <p>Les séquences archivées ne sont pas lues ici — seulement celles qui tournent ou qui sont en pause.</p>
          </div>
        )}

        {(sequences ?? []).map((seq) => (
          <Carte key={seq.id} seq={seq} />
        ))}
      </div>
    </div>
  )
}
