'use client'
// Lots — le pipeline des POPULATIONS, pas des fiches.
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
//
// LE DÉTAIL EST UNE PAGE, PAS UN TIROIR. Il l'a été : replié sous sa ligne, il
// poussait le tableau de cinq cents lignes vers le bas, ne se partageait pas
// par un lien, et ne survivait pas à un rafraîchissement. Un écran sur lequel
// on passe dix minutes à filtrer mérite sa propre adresse.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Layers, PackagePlus, RefreshCw } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import {
  AXES,
  avancement,
  manque,
  parAvancement,
  pretADemarcher,
  prochainGeste,
  taux,
  type CleAxe,
  type Couverture,
} from '@/lib/lots/couverture'
import './lem-skin.css'

const pourcent = (v: number): string => `${Math.round(v * 100)} %`
const nombre = (n: number): string => n.toLocaleString('fr-FR')

/**
 * La cellule d'un axe : la part couverte, et le manque en clair.
 *
 * Le manque est écrit en toutes lettres et pas seulement suggéré par la jauge.
 * « 166 » est actionnable ; « 68 % » demande une soustraction avant de savoir
 * combien de travail c'est.
 */
function Cellule({ lot, cle }: { lot: Couverture; cle: CleAxe }) {
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

export function Lots() {
  const [lots, setLots] = useState<Couverture[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)

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
            la démarcher — la dernière dit par quoi commencer.
          </p>
        </div>
        <div className="lots-actions">
          {/* CRÉER EST L'ACTION PRINCIPALE, ET ELLE MÈNE AILLEURS. Cet écran
              MESURE des populations, il n'en fabrique pas : ce qui les fabrique
              est l'explorateur, seul endroit où l'on voit ce qu'on est en train
              de choisir. Un formulaire de création ici demanderait de recopier
              vingt-sept filtres pour ne rien montrer de leur résultat. */}
          <Link className="lem-btn principal" href="/entreprises/explorateur">
            <PackagePlus size={14} aria-hidden="true" /> Créer un lot
          </Link>
          <button
            type="button"
            className="lem-btn"
            onClick={() => void charger()}
            disabled={chargement}
          >
            <RefreshCw size={14} aria-hidden="true" /> Rafraîchir
          </button>
        </div>
      </div>

      {erreur && <div className="lem-alerte">{erreur}</div>}

      {lots === null && <div className="lem-vide">Lecture des lots…</div>}

      {lots !== null && classes.length === 0 && !erreur && (
        <div className="lem-vide">
          <p>
            <strong>Aucun lot pour l&apos;instant.</strong>
          </p>
          <p>
            Un lot se fabrique dans l&apos;<Link className="lots-lien-simple" href="/entreprises/explorateur">explorateur</Link> :
            on filtre jusqu&apos;à voir la population qu&apos;on veut travailler, on la coche, et on
            la fige sous un nom. Le marketing pipeline sait le faire aussi, sur une sélection de
            fiches, et l&apos;<Link className="lots-lien-simple" href="/atelier">atelier</Link> le
            fait au pouce, sur quelques critères.
          </p>
          <p>
            Un segment reste une requête vivante — c&apos;est le lot, figé, qu&apos;on mesure et
            qu&apos;on traite, pour qu&apos;un traitement lancé dessus se rejoue à l&apos;identique.
          </p>
        </div>
      )}

      {classes.length > 0 && (
        <div className="lots-carte lots-enveloppe">
          <table>
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col" className="lots-num">
                  Entreprises
                </th>
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
                return (
                  <tr key={lot.lotId}>
                    <th scope="row" className="lots-nom">
                      <Link className="lots-lien" href={`/prospection/lots/${lot.lotId}`}>
                        <ChevronRight size={14} aria-hidden="true" />
                        <span>
                          <span className="lots-titre">{lot.nom}</span>
                          {lot.note && <span className="lots-note">{lot.note}</span>}
                          <span className="lots-avancement">
                            préparé à {pourcent(avancement(lot))}
                          </span>
                        </span>
                      </Link>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {classes.length > 0 && (
        <p className="lem-legende">
          « Prêt à démarcher » ne regarde que les quatre premiers axes. L&apos;audit ne concerne que
          les entreprises qui ont déjà un site à mesurer ; attribuer et mettre en séquence sont des
          gestes de lancement, pas de préparation.
        </p>
      )}
    </div>
  )
}
