'use client'
// Lots — le marketing pipeline des POPULATIONS, pas des fiches.
//
// LA QUESTION À LAQUELLE CET ÉCRAN RÉPOND, et qu'aucun autre ne posait :
// « j'ai cinq cents entreprises, qu'est-ce qui leur manque, et par quoi je
// commence ». Le marketing pipeline travaille une fiche à la fois et le fait
// bien ; il ne dit rien d'un stock. Ici une ligne est un lot, une colonne est
// un axe de préparation, et la cellule dit combien il en manque.
//
// C'EST UN TABLEAU PARCE QUE LA QUESTION EST COMPARATIVE. « Lequel de mes lots
// est le plus près d'être attaquable » ne se lit que sur des colonnes alignées.
// Des cartes cacheraient le classement, qui est précisément l'information.
//
// UNE SEULE COLONNE EST MISE EN AVANT : le prochain geste. Montrer les sept
// trous à la fois laisse l'humain choisir par quoi commencer, et il choisira le
// plus gros — alors que chercher la présence web d'entreprises non rapprochées
// du registre, c'est chercher sur des noms faux. L'ordre du plan de lissage
// décide, cf. `prochainGeste`.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, ExternalLink, Layers, RefreshCw } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { piecesManquantes, type Blocage, type LigneContenu } from '@/lib/lots/contenu'
import {
  AXES,
  avancement,
  manque,
  parAvancement,
  pretADemarcher,
  prochainGeste,
  taux,
  type Couverture,
} from '@/lib/lots/couverture'
import './lem-skin.css'

const pourcent = (v: number): string => `${Math.round(v * 100)} %`
const nombre = (n: number): string => n.toLocaleString('fr-FR')

/**
 * La cellule d'un axe : la part couverte, et le manque en clair.
 *
 * Le manque est écrit en toutes lettres et pas seulement suggéré par une barre.
 * « 166 » est actionnable ; « 68 % » demande une soustraction avant de savoir
 * combien de travail c'est.
 */
function Cellule({ lot, cle }: { lot: Couverture; cle: (typeof AXES)[number]['cle'] }) {
  const part = taux(lot, cle)
  const reste = manque(lot, cle)
  const etat = reste === 0 ? 'plein' : part >= 0.5 ? 'moitie' : 'vide'
  return (
    <td className="lots-cell" data-etat={etat}>
      <span className="lots-part">{pourcent(part)}</span>
      <span className="lots-jauge" aria-hidden="true">
        <i style={{ width: `${Math.round(part * 100)}%` }} />
      </span>
      <span className="lots-reste">{reste === 0 ? 'complet' : `${nombre(reste)} à faire`}</span>
    </td>
  )
}

/** Une entreprise du lot, telle que la route la rend — blocage déjà calculé. */
type LigneDetail = LigneContenu & { blocage: Blocage }

/** Les marches, avec la couleur qui dit s'il y a un geste à faire. */
const MARCHES: { cle: Blocage['marche']; label: string }[] = [
  { cle: 'a_faire', label: 'à faire aujourd\'hui' },
  { cle: 'bloquee', label: 'bloquées' },
  { cle: 'garee', label: 'garées' },
  { cle: 'attente', label: 'en attente de réponse' },
  { cle: 'hors_sequence', label: 'hors séquence' },
  { cle: 'en_file', label: 'en file' },
]

/**
 * Le contenu d'un lot, déplié sous sa ligne.
 *
 * CHARGÉ AU CLIC, jamais à l'ouverture de l'écran : le détail d'un lot de cinq
 * cents lignes n'intéresse que celui qui l'a demandé, et le charger pour tous
 * les lots ferait payer l'inventaire à chaque affichage du tableau.
 */
function Detail({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<LigneDetail[] | null>(null)
  const [tronque, setTronque] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    void (async () => {
      const res = await authedFetch(`/api/entreprises/lots/${lotId}`)
      const corps = (await res.json().catch(() => ({}))) as {
        entreprises?: LigneDetail[]
        tronque?: boolean
        error?: string
        message?: string
      }
      if (!vivant) return
      if (!res.ok) {
        setErreur(corps?.message || corps?.error || 'Lecture impossible.')
        setLignes([])
        return
      }
      setLignes(corps.entreprises ?? [])
      setTronque(!!corps.tronque)
    })()
    return () => {
      vivant = false
    }
  }, [lotId])

  const comptes = useMemo(() => {
    const par = new Map<Blocage['marche'], number>()
    for (const l of lignes ?? []) par.set(l.blocage.marche, (par.get(l.blocage.marche) ?? 0) + 1)
    return par
  }, [lignes])

  if (erreur) return <div className="lem-alerte">{erreur}</div>
  if (lignes === null) return <div className="lem-vide">Lecture du lot…</div>
  if (lignes.length === 0) return <div className="lem-vide">Ce lot ne porte aucune entreprise.</div>

  return (
    <div className="lots-detail">
      <div className="lots-marches">
        {MARCHES.filter((m) => (comptes.get(m.cle) ?? 0) > 0).map((m) => (
          <span key={m.cle} className="lots-marche" data-marche={m.cle}>
            <b>{nombre(comptes.get(m.cle) ?? 0)}</b> {m.label}
          </span>
        ))}
      </div>

      <div className="lem-table lots-enveloppe">
        <table>
          <thead>
            <tr>
              <th scope="col">Entreprise</th>
              <th scope="col">Séquence · étape</th>
              <th scope="col">Ce qui se passe</th>
              <th scope="col">Le geste qui débloque</th>
              <th scope="col">Il manque</th>
              <th scope="col" aria-label="Fiche" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const manquantes = piecesManquantes(l)
              return (
                <tr key={l.entreprise_id}>
                  <th scope="row" className="lots-nom">
                    <span className="lots-titre">{l.nom ?? `#${l.entreprise_id}`}</span>
                    {l.ville && <span className="lots-note">{l.ville}</span>}
                  </th>
                  <td className="lots-etape">
                    {l.sequence ? (
                      <>
                        <span className="lots-geste-quoi">{l.sequence}</span>
                        <span className="lots-geste-ou">
                          étape {(l.rang ?? 0) + 1} · {l.etape ?? '—'}
                          {l.etape_genre ? ` (${l.etape_genre})` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="lots-geste-ou">—</span>
                    )}
                  </td>
                  <td>
                    <span className="lots-marche" data-marche={l.blocage.marche}>
                      {l.blocage.libelle}
                    </span>
                  </td>
                  <td className="lots-geste-ou">{l.blocage.quoiFaire || '—'}</td>
                  <td className="lots-manques">
                    {manquantes.length === 0
                      ? '—'
                      : manquantes
                          .map((c) => AXES.find((a) => a.cle === c)?.colonne ?? c)
                          .join(' · ')}
                  </td>
                  <td>
                    <a
                      className="lem-btn"
                      href={`/entreprises/${l.entreprise_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={13} aria-hidden="true" /> Fiche
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {tronque && (
        <p className="lem-legende">
          Les 500 premières lignes seulement — celles qui demandent un geste sont en tête. Le compte
          exact du lot reste celui de la ligne au-dessus.
        </p>
      )}
    </div>
  )
}

export function Lots() {
  const [lots, setLots] = useState<Couverture[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [ouvert, setOuvert] = useState<number | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const res = await authedFetch('/api/entreprises/lots')
      const corps = (await res.json().catch(() => ({}))) as {
        lots?: Couverture[]
        error?: string
        message?: string
      }
      if (!res.ok) {
        // La migration non appliquée se dit autrement qu'une panne : l'une se
        // corrige en jouant un fichier, l'autre se débogue.
        setErreur(corps?.message || corps?.error || 'Lecture impossible.')
        setLots([])
        return
      }
      setErreur(null)
      setLots(corps.lots ?? [])
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  const classes = useMemo(() => (lots ? parAvancement(lots) : []), [lots])

  return (
    <div className="lem-skin lem-page">
      <div className="lem-entete">
        <div>
          <h1 className="lem-titre">
            <Layers size={19} aria-hidden="true" /> Lots
          </h1>
          <p className="lem-sous">
            Une ligne par population figée. Les colonnes disent ce qui lui manque avant de pouvoir
            la démarcher — et la dernière dit par quoi commencer.
          </p>
        </div>
        <button
          type="button"
          className="lem-btn"
          onClick={() => void charger()}
          disabled={chargement}
        >
          <RefreshCw size={14} aria-hidden="true" /> Rafraîchir
        </button>
      </div>

      {erreur && <div className="lem-alerte">{erreur}</div>}

      {lots === null && <div className="lem-vide">Lecture des lots…</div>}

      {lots !== null && classes.length === 0 && !erreur && (
        <div className="lem-vide">
          <p>
            <strong>Aucun lot pour l'instant.</strong>
          </p>
          <p>
            Un lot se fabrique depuis une sélection : va dans le marketing pipeline ou dans
            l'explorateur, coche ce que tu veux travailler, et fige-le sous un nom. Un segment reste
            une requête vivante — c'est le lot, figé, qu'on mesure et qu'on traite, pour qu'un
            traitement lancé dessus se rejoue à l'identique.
          </p>
        </div>
      )}

      {classes.length > 0 && (
        <div className="lem-table lots-enveloppe">
          <table>
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col" className="lots-num">Entreprises</th>
                {AXES.map((a) => (
                  <th key={a.cle} scope="col" title={a.aide}>
                    {a.colonne}
                  </th>
                ))}
                <th scope="col">Par quoi commencer</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((lot) => {
                const geste = prochainGeste(lot)
                const pret = pretADemarcher(lot)
                const deplie = ouvert === lot.lotId
                return (
                  <React.Fragment key={lot.lotId}>
                  <tr className="lots-ligne" data-deplie={deplie ? '1' : undefined}>
                    <th scope="row" className="lots-nom">
                      <button
                        type="button"
                        className="lots-deplier"
                        aria-expanded={deplie}
                        onClick={() => setOuvert(deplie ? null : lot.lotId)}
                      >
                        {deplie ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="lots-titre">{lot.nom}</span>
                      </button>
                      {lot.note && <span className="lots-note">{lot.note}</span>}
                      <span className="lots-avancement">
                        préparé à {pourcent(avancement(lot))}
                      </span>
                    </th>
                    <td className="lots-num">{nombre(lot.total)}</td>
                    {AXES.map((a) => (
                      <Cellule key={a.cle} lot={lot} cle={a.cle} />
                    ))}
                    <td className="lots-geste">
                      {pret && !geste && <span className="lem-pill">Prêt à démarcher</span>}
                      {geste && (
                        <>
                          <span className="lots-geste-quoi">{geste.geste}</span>
                          <span className="lots-geste-ou">{geste.ou}</span>
                          <span className="lots-geste-combien">
                            {nombre(manque(lot, geste.cle))} entreprises
                          </span>
                        </>
                      )}
                      {!geste && !pret && <span className="lots-geste-ou">Lot vide</span>}
                    </td>
                  </tr>
                  {deplie && (
                    <tr className="lots-tiroir">
                      <td colSpan={AXES.length + 3}>
                        <Detail lotId={lot.lotId} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {classes.length > 0 && (
        <p className="lem-legende">
          « Prêt à démarcher » ne regarde que les quatre premiers axes. L'audit ne concerne que les
          entreprises qui ont déjà un site à mesurer ; attribuer et mettre en séquence sont des
          gestes de lancement, pas de préparation.
        </p>
      )}
    </div>
  )
}
