'use client'
// LotDetail — où en est chaque entreprise d'un lot, et pourquoi elle ne bouge pas.
//
// POURQUOI CETTE PAGE EXISTE. La couverture d'un lot dit « 206 sans constat ».
// Elle ne dit pas LESQUELLES, ni si l'entreprise attend un site à fabriquer,
// une adresse à vérifier, ou simplement que la séquence est restée en
// brouillon. Ces trois-là ne se corrigent pas du même endroit : la première est
// du travail de production, la deuxième une donnée à collecter, la troisième un
// interrupteur. Les afficher pareil est ce qui a laissé 59 inscriptions dormir
// des semaines sans que personne ne voie la différence.
//
// LES FILTRES SONT DES PASTILLES QUI COMPTENT, et une pastille à zéro ne
// s'affiche pas : proposer un filtre qui ne rendrait rien fait douter du
// tableau, pas du filtre. Elles se cumulent en OU dans leur groupe et en ET
// entre les groupes — la même grammaire que partout ailleurs dans le CRM, celle
// qu'on attend d'une liste de cases.
//
// LE TRI PAR DÉFAUT EST L'URGENCE, pas le nom. Sur cinq cents lignes, chercher
// alphabétiquement les trois qui coincent n'a aucun sens : ce qui demande un
// geste passe devant ce qui tourne tout seul.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ExternalLink, Layers, RefreshCw, X } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { piecesManquantes, type Blocage, type LigneContenu } from '@/lib/lots/contenu'
import { AXES, type CleAxe, type Couverture } from '@/lib/lots/couverture'
import type { PretDemo } from '@/lib/lots/pret-demo'
import { GestesDuLot } from './GestesDuLot'
import './lem-skin.css'

type LigneDetail = LigneContenu & { blocage: Blocage }

const nombre = (n: number): string => n.toLocaleString('fr-FR')

/** Les marches, dans l'ordre où on veut les proposer en filtre. */
const MARCHES: { cle: Blocage['marche']; label: string }[] = [
  { cle: 'a_faire', label: 'à faire' },
  { cle: 'bloquee', label: 'bloquées' },
  { cle: 'garee', label: 'garées' },
  { cle: 'attente', label: 'en attente de réponse' },
  { cle: 'hors_sequence', label: 'hors séquence' },
  { cle: 'en_file', label: 'en file' },
]

/** Sans accent ni casse : « Élan » se trouve en tapant « elan ». */
const sansAccent = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function LotDetail({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<LigneDetail[] | null>(null)
  const [lot, setLot] = useState<Couverture | null>(null)
  const [pretDemo, setPretDemo] = useState<PretDemo | null>(null)
  const [tronque, setTronque] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)

  const [marches, setMarches] = useState<Set<Blocage['marche']>>(new Set())
  const [manques, setManques] = useState<Set<CleAxe>>(new Set())
  const [texte, setTexte] = useState('')

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const res = await authedFetch(`/api/entreprises/lots/${lotId}`)
      const corps = (await res.json().catch(() => ({}))) as {
        lot?: Couverture | null
        pretDemo?: PretDemo | null
        entreprises?: LigneDetail[]
        tronque?: boolean
        error?: string
        message?: string
      }
      if (!res.ok) {
        setErreur(corps?.message || corps?.error || 'Lecture impossible.')
        setLignes([])
        return
      }
      setErreur(null)
      setLot(corps.lot ?? null)
      setPretDemo(corps.pretDemo ?? null)
      setLignes(corps.entreprises ?? [])
      setTronque(!!corps.tronque)
    } finally {
      setChargement(false)
    }
  }, [lotId])

  useEffect(() => {
    void charger()
  }, [charger])

  /** Les manques de chaque ligne, calculés une fois — la liste est longue. */
  const avecManques = useMemo(
    () => (lignes ?? []).map((l) => ({ ligne: l, manquantes: piecesManquantes(l) })),
    [lignes],
  )

  // Les comptes sont faits sur TOUT le lot, pas sur ce que le filtre laisse :
  // une pastille qui compterait le résultat filtré tomberait à zéro dès qu'on
  // clique dessus, et il deviendrait impossible d'en cocher une deuxième.
  const comptesMarche = useMemo(() => {
    const par = new Map<Blocage['marche'], number>()
    for (const { ligne } of avecManques)
      par.set(ligne.blocage.marche, (par.get(ligne.blocage.marche) ?? 0) + 1)
    return par
  }, [avecManques])

  const comptesManque = useMemo(() => {
    const par = new Map<CleAxe, number>()
    for (const { manquantes } of avecManques)
      for (const c of manquantes) par.set(c, (par.get(c) ?? 0) + 1)
    return par
  }, [avecManques])

  const visibles = useMemo(() => {
    const q = sansAccent(texte.trim())
    return avecManques.filter(({ ligne, manquantes }) => {
      if (marches.size && !marches.has(ligne.blocage.marche)) return false
      if (manques.size && !manquantes.some((c) => manques.has(c))) return false
      if (q && !sansAccent(`${ligne.nom ?? ''} ${ligne.ville ?? ''}`).includes(q)) return false
      return true
    })
  }, [avecManques, marches, manques, texte])

  const bascule = <T,>(ens: Set<T>, poser: (s: Set<T>) => void, v: T) => {
    const suivant = new Set(ens)
    if (suivant.has(v)) suivant.delete(v)
    else suivant.add(v)
    poser(suivant)
  }

  const filtre = marches.size > 0 || manques.size > 0 || texte.trim() !== ''

  return (
    <div className="lem-skin lem-page">
      <div className="lots-fil">
        <Link href="/prospection/lots">
          <ChevronLeft size={13} aria-hidden="true" /> Lots
        </Link>
        <span aria-hidden="true">·</span>
        <span>Contenu du lot</span>
      </div>

      <div className="lem-entete">
        <div>
          <h1 className="lem-titre">
            <Layers size={19} aria-hidden="true" /> {lot?.nom ?? 'Contenu du lot'}
          </h1>
          <p className="lem-sous">
            {lot?.note ??
              'Une ligne par entreprise : son étape dans la séquence, ce qui la retient, et le geste qui la débloque. Ce qui demande une action est en tête.'}
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

      {/* LES GESTES AVANT LA TABLE. On ouvre cet écran pour faire avancer un
          lot, pas pour l'inventorier : ce qu'on peut lancer doit être lisible
          sans défiler. La table répond à « pourquoi ça coince », qui vient
          après « qu'est-ce que je lance ». */}
      {lot && <GestesDuLot lot={lot} pretDemo={pretDemo} onLance={() => void charger()} />}

      {erreur && <div className="lem-alerte">{erreur}</div>}
      {lignes === null && <div className="lem-vide">Lecture du lot…</div>}
      {lignes !== null && lignes.length === 0 && !erreur && (
        <div className="lem-vide">Ce lot ne porte aucune entreprise.</div>
      )}

      {lignes !== null && lignes.length > 0 && (
        <>
          <div className="lots-filtres">
            {MARCHES.filter((m) => (comptesMarche.get(m.cle) ?? 0) > 0).map((m) => (
              <button
                key={m.cle}
                type="button"
                className="lots-pastille"
                data-marche={m.cle}
                aria-pressed={marches.has(m.cle)}
                onClick={() => bascule(marches, setMarches, m.cle)}
              >
                <span className="puce" aria-hidden="true" />
                <b>{nombre(comptesMarche.get(m.cle) ?? 0)}</b> {m.label}
              </button>
            ))}
          </div>

          <div className="lots-filtres">
            {AXES.filter((a) => (comptesManque.get(a.cle) ?? 0) > 0).map((a) => (
              <button
                key={a.cle}
                type="button"
                className="lots-pastille"
                aria-pressed={manques.has(a.cle)}
                title={a.aide}
                onClick={() => bascule(manques, setManques, a.cle)}
              >
                <b>{nombre(comptesManque.get(a.cle) ?? 0)}</b> sans {a.colonne.toLowerCase()}
              </button>
            ))}
            <input
              className="lots-recherche"
              type="search"
              value={texte}
              placeholder="Chercher un nom, une ville…"
              aria-label="Chercher dans le lot"
              onChange={(e) => setTexte(e.target.value)}
            />
            {filtre && (
              <button
                type="button"
                className="lots-pastille"
                onClick={() => {
                  setMarches(new Set())
                  setManques(new Set())
                  setTexte('')
                }}
              >
                <X size={12} aria-hidden="true" /> Tout effacer
              </button>
            )}
          </div>

          <p className="lem-legende" aria-live="polite">
            {nombre(visibles.length)} entreprise{visibles.length > 1 ? 's' : ''}
            {filtre ? ` sur ${nombre(lignes.length)}` : ''}
            {tronque ? ' — les 500 premières du lot seulement' : ''}
          </p>

          <div className="lots-carte lots-enveloppe">
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
                {visibles.map(({ ligne: l, manquantes }) => (
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
                      <span className="lots-etat" data-marche={l.blocage.marche}>
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
                ))}
              </tbody>
            </table>
          </div>

          {visibles.length === 0 && (
            <div className="lem-vide">Aucune entreprise ne correspond à ces filtres.</div>
          )}
        </>
      )}
    </div>
  )
}
