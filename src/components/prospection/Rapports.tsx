'use client'
// Rapports — « où en est-on ? », et la réponse est une PARTITION.
//
// LE GRIEF N° 2, MOT POUR MOT : « les chiffres du haut comptent deux fois le
// même prospect ». Un prospect à la fois chaud et en discussion figurait dans
// les deux compteurs ; on les additionnait, et le total dépassait le nombre de
// gens. Impossible de dire où on en est sans recompter à la main.
//
// LA RÈGLE QUI CORRIGE ÇA TIENT EN UNE PHRASE : un lead est à UN SEUL étage,
// le plus loin qu'il ait atteint. La somme des étages égale le nombre de leads,
// et l'écran l'affiche — pas par pédagogie, mais parce qu'un total qu'on peut
// vérifier d'un coup d'œil est un total auquel on se fie.
//
// CE QU'ON N'AFFICHE PAS : les ouvertures et les clics. Ils ne se mesurent pas
// ici (ni pixel, ni réécriture de liens — ils abîment la réputation de la
// boîte), et un « 0 ouverture » ferait lire une absence de réaction là où il
// n'y a qu'une absence de mesure.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { Etage } from '@/lib/automations/statut-lead'
import './lem-skin.css'

interface Palier {
  etage: Etage
  n: number
  label: string
}

interface Rapport {
  total: number
  tronque: boolean
  entonnoir: Palier[]
  parCohorte: { cohorte: string; label: string; total: number; etages: Palier[] }[]
  campagnes: { id: string; name: string; status: string }[]
  campagne: string | null
}

/**
 * La teinte de chaque étage.
 *
 * « Écartés » et « injoignables » ne sont PAS des échecs peints en rouge : ce
 * sont des réponses, et souvent des réponses réparables (« aucun canal » est
 * une tâche d'enrichissement, pas un refus). Le seul rouge est le refus
 * explicite — le seul endroit où le prospect a tranché contre nous.
 */
const TON: Readonly<Record<Etage, string>> = {
  a_preparer: 'attention',
  a_lancer: 'neutre',
  ecarte: 'neutre',
  contacte: 'default',
  consulte: 'ok',
  repondu: 'ok',
  interesse: 'ok',
  refuse: 'danger',
  injoignable: 'neutre',
}

export function Rapports() {
  const [campagne, setCampagne] = useState('')
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [chargement, setChargement] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    setPanne(null)
    try {
      const r = await authedFetch(`/api/prospection/rapports${campagne ? `?campagne=${campagne}` : ''}`)
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message ?? 'La lecture a échoué.')
        setRapport(null)
        return
      }
      setRapport(j as Rapport)
    } catch {
      // Une panne de lecture n'est pas un entonnoir vide. Les confondre, c'est
      // annoncer « 0 prospect » à quelqu'un qui en a neuf cents.
      setPanne('La lecture a échoué.')
      setRapport(null)
    } finally {
      setChargement(false)
    }
  }, [campagne])

  useEffect(() => {
    void charger()
  }, [charger])

  const somme = useMemo(
    () => (rapport?.entonnoir ?? []).reduce((n, p) => n + p.n, 0),
    [rapport],
  )

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Rapports</h1>
            <p className="lem-sous">
              Chaque prospect est à un seul étage — le plus loin qu’il ait atteint. Les étages
              s’additionnent&nbsp;; les signaux, eux, se croisent et ne se comptent pas.
            </p>
          </div>
          <select
            className="lem-btn"
            value={campagne}
            onChange={(e) => setCampagne(e.target.value)}
            aria-label="Campagne"
          >
            <option value="">Toutes les campagnes</option>
            {(rapport?.campagnes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{panne}</div>
          </div>
        )}

        {rapport?.tronque && (
          <div className="lem-alerte" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              La lecture s’est arrêtée au plafond&nbsp;: <b>ce n’est plus une partition</b>, c’est un
              échantillon. Filtrez sur une campagne pour retrouver un compte exact.
            </div>
          </div>
        )}

        {/* UNE PANNE N'EST PAS UN ENTONNOIR VIDE. Sans ce garde, une lecture
            refusée affichait « Aucune liste à mesurer » — donc « vous n'avez
            aucun prospect » à quelqu'un qui en a neuf cents. C'est le même
            piège que le tableau des tâches et la liste des fils ont déjà posé :
            l'écran doit dire ce qu'il ne sait pas, pas conclure à zéro. */}
        {chargement ? (
          <div className="lem-carte">
            <div className="lem-vide">Chargement…</div>
          </div>
        ) : panne ? null : !rapport || rapport.total === 0 ? (
          <div className="lem-carte">
            <div className="lem-vide">
              <h3>Aucune liste à mesurer</h3>
              <p>
                Un entonnoir se calcule sur la liste d’une campagne. Ajoutez-en une depuis un
                segment, un lot, ou en reprenant les inscriptions déjà en cours.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="lem-carte" style={{ padding: 18 }}>
              <Entonnoir titre={`${rapport.total} prospects`} paliers={rapport.entonnoir} total={rapport.total} />
              {/* LE TOTAL SE VÉRIFIE À L'ŒIL. C'est la réponse au grief : on
                  peut additionner les étages et retomber sur ses pieds. */}
              <p className="lem-decor" style={{ fontSize: 12, marginTop: 12 }}>
                {rapport.entonnoir.map((p) => p.n).join(' + ')} = {somme} — chaque prospect compté une
                fois, et une seule.
              </p>
            </div>

            {rapport.parCohorte.length > 1 && (
              <div className="lem-carte" style={{ padding: 18, marginTop: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Par cohorte</h2>
                {/* Les deux cohortes se comparent à l'ÂGE, pas à date fixe : la
                    B a commencé après la A, et lire les deux colonnes au même
                    jour calendaire fait paraître la B en retard alors qu'elle
                    est simplement plus jeune. */}
                <p className="lem-decor" style={{ fontSize: 12, margin: '0 0 14px' }}>
                  Même règle des deux côtés. À lire à âge égal — la cohorte B est partie après la A.
                </p>
                {rapport.parCohorte.map((c) => (
                  <div key={c.cohorte} style={{ marginTop: 14 }}>
                    <Entonnoir
                      titre={`${c.label} · ${c.total}`}
                      paliers={c.etages}
                      total={c.total}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Une barre segmentée, plus son détail. La barre dit la forme, le détail dit le chiffre. */
function Entonnoir({ titre, paliers, total }: { titre: string; paliers: Palier[]; total: number }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{titre}</div>
      <div className="lem-entonnoir" role="img" aria-label={paliers.map((p) => `${p.label} ${p.n}`).join(', ')}>
        {paliers.map((p) => (
          <span
            key={p.etage}
            className="part"
            data-ton={TON[p.etage]}
            style={{ flexGrow: p.n, flexBasis: 0 }}
            title={`${p.label} — ${p.n}`}
          />
        ))}
      </div>
      <ul className="lem-legende">
        {paliers.map((p) => (
          <li key={p.etage}>
            <span className="puce" data-ton={TON[p.etage]} />
            <span className="l">{p.label}</span>
            <b>{p.n}</b>
            <span className="pc">{total > 0 ? `${Math.round((p.n / total) * 100)} %` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
