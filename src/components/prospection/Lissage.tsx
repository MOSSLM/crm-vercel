'use client'
// Lissage — la boîte à outils, enfin lançable depuis l'app.
//
// CE QUE CET ÉCRAN CORRIGE
// L'enrichissement passait presque entièrement par Claude Code : c'est là que
// vivait la boîte à outils. Or sur les 34 bots du registre, UN SEUL est un skill
// Claude ; vingt tournent déjà côté serveur. Ce qui manquait n'était pas la
// nature des outils, c'était un écran et une file.
//
// LA QUESTION À LAQUELLE IL RÉPOND : « sur cette population, qu'est-ce qu'on
// sait, et qu'est-ce qu'on n'a jamais regardé ? » — et les deux ne se
// confondent jamais. La couverture a QUATRE colonnes :
//
//   présent .......... on a trouvé
//   absent ........... ON A CHERCHÉ, il n'y en a pas. C'est un RÉSULTAT.
//   inconnu .......... on a regardé sans pouvoir conclure
//   jamais regardé ... personne n'y est allé
//
// Les deux dernières demandent deux travaux différents : la troisième demande
// un autre outil, la quatrième demande juste de lancer la passe. Les fondre
// donnerait un chiffre dont on ne saurait rien faire — l'erreur exacte des 448
// « sites faibles » du 16/08, dont 431 n'avaient jamais été mesurées.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Play, Plus, RotateCcw } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import {
  SUJET_LABEL,
  SUJETS,
  natureDuSujet,
  type Confiance,
  type Etat,
  type PlanPasse,
  type Sujet,
} from '@/lib/lissage/passe'
import './lem-skin.css'

interface Avancement {
  a_faire: number
  en_cours: number
  complet: number
  sans_prise: number
  erreur: number
  total: number
}

interface Couverture {
  sujet: Sujet
  label: string
  present: number
  absent: number
  inconnu: number
  jamais_regarde: number
}

interface Proprietaire {
  id: string
  nom: string
  fiches: number
}

interface PasseResume {
  id: string
  nom: string
  criteres: {
    q?: string | null
    flags?: string[]
    sources?: string[]
    owner?: string | null
    /** Posé quand la population vient de cases cochées, et non de filtres. */
    origine?: string | null
  }
  plan: { sujets: Sujet[]; exigence: Confiance; facture: boolean; local: boolean }
  statut: string
  creeLe: string
  avancement: Avancement
}

interface LigneVue {
  ligneId: number
  entrepriseId: number
  nom: string | null
  ville: string | null
  statut: string
  outil: string | null
  outilNom: string | null
  lieu: 'serveur' | 'local' | 'humain' | null
  motif: string | null
  constats: Partial<Record<Sujet, { etat: Etat; confiance: Confiance; source: string }>>
}

interface Detail {
  passe: PasseResume
  avancement: Avancement
  couvertures: Couverture[]
  items: LigneVue[]
  plafonne: boolean
}

/**
 * Les marquages de l'explorateur, avec ce qu'ils veulent dire ici.
 *
 * On ne réécrit AUCUN filtre : `chercher_entreprises` sait déjà les trancher, et
 * une deuxième définition de « sans site » finirait forcément par diverger de la
 * première.
 */
const FLAGS: { code: string; label: string; aide: string }[] = [
  { code: 'vivantes', label: 'Vivantes', aide: 'Ni archivées, ni masquées, ni fusionnées.' },
  { code: 'sans_site', label: 'Sans site connu', aide: 'Aucune URL en colonne — ce qui ne veut pas dire « sans site ».' },
  { code: 'sans_google', label: 'Sans fiche Google', aide: 'Aucun place_id ramassé.' },
  { code: 'sans_siret', label: 'Sans SIRET', aide: 'Rien à donner à l’annuaire ni à l’ADEME.' },
  { code: 'qualite', label: 'Signalées en qualité', aide: 'Les fiches que le contrôle a marquées.' },
]

/** D'où vient une population qui n'a pas de filtres à montrer. */
const LIBELLE_ORIGINE: Readonly<Record<string, string>> = {
  'marketing-pipeline': 'pipeline marketing',
  explorateur: 'explorateur',
  selection: 'sélection',
}

const TON_ETAT: Readonly<Record<'present' | 'absent' | 'inconnu' | 'jamais_regarde', string>> = {
  // « absent » n'est PAS peint comme un problème : c'est une réponse, et souvent
  // la réponse qu'on cherchait (une entreprise sans site est un prospect).
  present: 'ok',
  absent: 'neutre',
  inconnu: 'attention',
  jamais_regarde: 'vide',
}

const COLONNES: { cle: keyof Couverture & ('present' | 'absent' | 'inconnu' | 'jamais_regarde'); label: string }[] = [
  { cle: 'present', label: 'Présent' },
  { cle: 'absent', label: 'Vérifié absent' },
  { cle: 'inconnu', label: 'Regardé sans conclure' },
  { cle: 'jamais_regarde', label: 'Jamais regardé' },
]

export function Lissage() {
  const [passes, setPasses] = useState<PasseResume[] | null>(null)
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [chargement, setChargement] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)
  const [travail, setTravail] = useState(false)
  const [avancement, setAvancement] = useState<string | null>(null)
  const stop = React.useRef(false)
  // Les réponses qui ne sont pas des échecs, cumulées sur toute la boucle et
  // dédoublonnées : « aucun candidat sur ce nom » revient sur des dizaines de
  // fiches, et le répéter n'apprend rien de plus.
  const remarques = React.useRef<string[]>([])
  const [nouvelle, setNouvelle] = useState(false)

  const chargerPasses = useCallback(async () => {
    setChargement(true)
    setPanne(null)
    try {
      const r = await authedFetch('/api/lissage/passes')
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message ?? 'La lecture a échoué.')
        setPasses(null)
        return
      }
      setPasses((j.items ?? []) as PasseResume[])
      setProprietaires((j.proprietaires ?? []) as Proprietaire[])
    } catch {
      // UNE PANNE DE LECTURE N'EST PAS UNE ABSENCE DE PASSE. Le piège a déjà été
      // posé trois fois dans ce projet ; l'écran doit dire ce qu'il ne sait pas.
      setPanne('La lecture a échoué.')
      setPasses(null)
    } finally {
      setChargement(false)
    }
  }, [])

  const chargerDetail = useCallback(async (id: string) => {
    setPanne(null)
    try {
      const r = await authedFetch(`/api/lissage/passes/${id}`)
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message ?? 'La lecture de la passe a échoué.')
        setDetail(null)
        return
      }
      setDetail(j as Detail)
    } catch {
      setPanne('La lecture de la passe a échoué.')
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    void chargerPasses()
  }, [chargerPasses])

  useEffect(() => {
    if (choisie) void chargerDetail(choisie)
    else setDetail(null)
  }, [choisie, chargerDetail])

  /**
   * Avancer la file JUSQU'À CE QU'ELLE N'AIT PLUS RIEN À PRENDRE.
   *
   * Un tick prend UN lot de vingt et s'arrête — c'est ce qui le garde borné, et
   * il faut que ça le reste : la route a un plafond de durée, et boucler côté
   * serveur, c'est un timeout au premier gros lot. Mais faire cliquer
   * vingt-six fois pour cinq cent vingt et un prospects n'est pas une
   * interface, c'est une corvée. On boucle donc ICI, un appel après l'autre,
   * en montrant où on en est et en laissant la possibilité d'arrêter.
   *
   * La boucle s'arrête sur `reste.serveur === 0` et non sur « plus rien du
   * tout » : ce qui attend le poste local ou une relecture n'avancera JAMAIS
   * par ce bouton, et tourner dessus serait une boucle infinie polie.
   */
  const avancer = useCallback(async () => {
    if (!choisie) return
    setTravail(true)
    setPanne(null)
    stop.current = false
    remarques.current = []
    let faits = 0
    try {
      // Plafond de sécurité : cent lots, soit deux mille prospects. Au-delà
      // c'est un backfill, pas une passe — et le plafond de population le dit
      // déjà côté création.
      for (let lot = 0; lot < 100 && !stop.current; lot += 1) {
        const r = await authedFetch('/api/lissage/tick', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passeId: choisie, taille: 20 }),
        })
        const j = await r.json()
        if (!r.ok) {
          setPanne(j?.message ?? 'Le tour de file a échoué.')
          break
        }
        faits += Number(j.prises ?? 0)
        const reste = j.reste ?? { serveur: 0, local: 0, humain: 0 }

        // LES PANNES REMONTENT EN ROUGE, LES REMARQUES NON. Un tick muet qui a
        // raté la moitié de son lot ressemble à un tick qui a réussi — mais
        // crier « panne » sur « l'annuaire ne propose aucun candidat », qui est
        // une RÉPONSE, use l'alerte jusqu'à ce qu'on ne la lise plus.
        if (Array.isArray(j.pannes) && j.pannes.length > 0) {
          setPanne(`${j.lances} outil(s) lancé(s), et ${j.pannes.length} panne(s) : ${j.pannes[0]}`)
        }
        for (const r of (j.remarques ?? []) as string[]) {
          if (!remarques.current.includes(r)) remarques.current.push(r)
        }

        // RIEN N'A ÉTÉ PRIS : on dit POURQUOI, au lieu de laisser croire à un
        // blocage. C'est le défaut qui a fait appuyer vingt fois sur un bouton
        // qui n'avait plus rien à faire.
        if (Number(j.prises ?? 0) === 0) {
          setAvancement(phraseDeFin(faits, reste))
          break
        }
        setAvancement(
          `${faits} prospect(s) traité(s)… il en reste ${reste.serveur} à prendre.`,
        )
        if (reste.serveur === 0) {
          setAvancement(phraseDeFin(faits, reste))
          break
        }
      }
      await chargerDetail(choisie)
      await chargerPasses()
    } catch {
      setPanne('Le tour de file a échoué.')
    } finally {
      setTravail(false)
    }
  }, [choisie, chargerDetail, chargerPasses])

  /**
   * Rejouer : ramener dans la file ce qui en était sorti sans être tranché.
   *
   * UNE DÉCOUVERTE EN ENTRAÎNE UNE AUTRE, et la file ne le voyait qu'à
   * l'intérieur d'un appel. Une ligne sortie « sans prise » faute de SIRET n'y
   * revenait jamais, même une fois le SIRET tranché à l'écran. C'est sans
   * danger : les constats restent écrits, et la file ne repropose un outil que
   * pour un sujet NON réglé.
   */
  const rejouer = useCallback(async () => {
    if (!choisie) return
    setTravail(true)
    setPanne(null)
    try {
      const r = await authedFetch(`/api/lissage/passes/${choisie}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) setPanne(j?.message ?? 'La relance a échoué.')
      else {
        setAvancement(
          j.relancees > 0
            ? `${j.relancees} ligne(s) remise(s) dans la file. Relancez « Avancer la file ».`
            : 'Aucune ligne à relancer — rien n’était sorti sans être tranché.',
        )
      }
      await chargerDetail(choisie)
      await chargerPasses()
    } catch {
      setPanne('La relance a échoué.')
    } finally {
      setTravail(false)
    }
  }, [choisie, chargerDetail, chargerPasses])

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Lisser la base</h1>
            <p className="lem-sous">
              Choisissez une population, dites ce que vous voulez trancher, et la file s’en
              occupe. Une case vide veut dire <b>« on ne sait pas »</b>&nbsp;; elle ne se confond
              jamais avec <b>« vérifié, il n’en a pas »</b>.
            </p>
          </div>
          <button className="lem-btn principal" onClick={() => setNouvelle((v) => !v)}>
            <Plus size={15} /> Nouvelle passe
          </button>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{panne}</div>
          </div>
        )}

        {nouvelle && (
          <FormuleNouvelle
            proprietaires={proprietaires}
            onCree={async (id) => {
              setNouvelle(false)
              await chargerPasses()
              setChoisie(id)
            }}
            onPanne={setPanne}
          />
        )}

        {chargement ? (
          <div className="lem-carte">
            <div className="lem-vide">Chargement…</div>
          </div>
        ) : panne && !passes ? null : !passes || passes.length === 0 ? (
          <div className="lem-carte">
            <div className="lem-vide">
              <h3>Aucune passe</h3>
              <p>
                Une passe fige une population et lui fait traverser les outils. Commencez par les
                fiches sans SIRET&nbsp;: c’est le préalable de tout le reste.
              </p>
            </div>
          </div>
        ) : (
          <div className="lem-carte" style={{ overflow: 'hidden' }}>
            <table className="lem-table">
              <thead>
                <tr>
                  <th>Passe</th>
                  <th>Population</th>
                  <th>Tranchées</th>
                  <th>Sans prise</th>
                  <th>En file</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="lem-btn discret"
                        onClick={() => setChoisie(choisie === p.id ? null : p.id)}
                      >
                        {p.nom}
                      </button>
                      {/* UNE PASSE VENUE DE CASES COCHÉES NE SE REJOUE PAS.
                          Sa population est une liste figée, pas une requête :
                          la relancer ne rattrapera pas les fiches devenues
                          éligibles depuis. Le dire ici évite de le découvrir en
                          cherchant des critères qui n'existent pas. */}
                      {p.criteres?.origine && (
                        <span
                          className="lem-pill"
                          data-ton="neutre"
                          style={{ marginLeft: 8 }}
                          title="Population cochée à l’écran, pas décrite par des filtres — elle ne se rafraîchit pas."
                        >
                          {LIBELLE_ORIGINE[p.criteres.origine] ?? 'sélection'}
                        </span>
                      )}
                    </td>
                    <td className="num">{p.avancement.total}</td>
                    <td className="num">{p.avancement.complet}</td>
                    <td className="num">{p.avancement.sans_prise}</td>
                    <td className="num">{p.avancement.a_faire + p.avancement.en_cours}</td>
                    <td>
                      <span className="lem-pill" data-ton={p.statut === 'terminee' ? 'ok' : 'neutre'}>
                        {p.statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <>
            <div className="lem-carte" style={{ padding: 18, marginTop: 14 }}>
              <div className="lem-entete" style={{ marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                    {detail.passe.nom} — couverture
                  </h2>
                  <p className="lem-decor" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    La somme des quatre colonnes égale la population, par construction.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {travail ? (
                    <button className="lem-btn" onClick={() => { stop.current = true }}>
                      Arrêter
                    </button>
                  ) : (
                    detail.avancement.sans_prise + detail.avancement.erreur > 0 && (
                      <button
                        className="lem-btn"
                        onClick={() => void rejouer()}
                        title="Ramène dans la file les lignes sorties sans être tranchées, et oublie les outils déjà tentés sur elles. Ce qui est déjà tranché n’est pas refait."
                      >
                        <RotateCcw size={15} /> Rejouer les{' '}
                        {detail.avancement.sans_prise + detail.avancement.erreur} sans prise
                      </button>
                    )
                  )}
                  <button className="lem-btn principal" onClick={() => void avancer()} disabled={travail}>
                    <Play size={15} /> {travail ? 'En cours…' : 'Avancer la file'}
                  </button>
                </div>
              </div>

              {/* CE QUI RESTE, ET DE QUOI C'EST FAIT. « Rien n'a bougé » et
                  « il ne reste que des étapes locales » se ressemblent à
                  l'écran et ne demandent pas du tout le même geste. */}
              {avancement && (
                <p className="lem-second" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
                  {avancement}
                </p>
              )}

              {/* CE QUE LES OUTILS ONT RÉPONDU, et qui n'est pas un échec. En
                  information, jamais en alerte : « l'annuaire ne propose aucun
                  candidat » est un résultat, et le peindre en rouge finit par
                  faire ignorer les vraies pannes. */}
              {!travail && remarques.current.length > 0 && (
                <details className="lem-second" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  <summary style={{ cursor: 'pointer' }}>
                    {remarques.current.length} remarque(s) des outils — ce n’est pas une panne
                  </summary>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    {remarques.current.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}

              {detail.plafonne && (
                <div className="lem-alerte" style={{ marginBottom: 12 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    La lecture s’est arrêtée au plafond&nbsp;: la couverture ci-dessous est un
                    <b> échantillon</b>, pas la population entière.
                  </div>
                </div>
              )}

              {detail.couvertures.map((c) => (
                <BarreCouverture key={c.sujet} couverture={c} total={detail.avancement.total} />
              ))}
            </div>

            <div className="lem-carte" style={{ marginTop: 14, overflow: 'hidden' }}>
              <table className="lem-table">
                <thead>
                  <tr>
                    <th>Entreprise</th>
                    {detail.passe.plan.sujets.map((s) => (
                      <th key={s}>{SUJET_LABEL[s].split(' (')[0]}</th>
                    ))}
                    <th>Où ça en est</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.slice(0, 200).map((l) => (
                    <tr key={l.ligneId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.nom ?? `#${l.entrepriseId}`}</div>
                        <div className="lem-decor" style={{ fontSize: 12 }}>{l.ville ?? '—'}</div>
                      </td>
                      {detail.passe.plan.sujets.map((s) => {
                        const c = l.constats[s]
                        return (
                          <td key={s}>
                            <span
                              className="lem-pill"
                              data-ton={c ? TON_ETAT[c.etat] : 'neutre'}
                              title={c ? `${c.confiance} · ${c.source}` : 'personne n’a regardé'}
                            >
                              {c ? c.etat : 'jamais regardé'}
                            </span>
                          </td>
                        )
                      })}
                      <td>
                        <EtatLigne ligne={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Ce qu'on dit quand la boucle s'arrête — et il y a trois fins différentes.
 *
 * Les confondre est ce qui a fait croire à un blocage : une file qui n'a plus
 * rien à prendre CÔTÉ SERVEUR n'est pas une file terminée, et le geste à faire
 * n'est pas le même — ouvrir son localhost, ou aller trancher à l'écran.
 */
function phraseDeFin(faits: number, reste: { serveur: number; local: number; humain: number }): string {
  const debut = faits > 0 ? `${faits} prospect(s) traité(s). ` : ''
  const attentes: string[] = []
  if (reste.local > 0) attentes.push(`${reste.local} attend(ent) le poste local`)
  if (reste.humain > 0) attentes.push(`${reste.humain} attend(ent) une relecture à l’écran`)
  if (attentes.length > 0) {
    return `${debut}Plus rien à prendre côté serveur — ${attentes.join(', ')}.`
  }
  if (reste.serveur > 0) {
    return `${debut}Il reste ${reste.serveur} ligne(s) que le serveur n’a pas pu prendre.`
  }
  return `${debut}La passe est allée au bout de ce qu’elle pouvait faire.`
}

/** Une barre par sujet, quatre parts, et la légende chiffrée sous elle. */
function BarreCouverture({ couverture, total }: { couverture: Couverture; total: number }) {
  const somme = COLONNES.reduce((n, c) => n + couverture[c.cle], 0)
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{couverture.label}</div>
      <div
        className="lem-entonnoir"
        role="img"
        aria-label={COLONNES.map((c) => `${c.label} ${couverture[c.cle]}`).join(', ')}
      >
        {COLONNES.map((c) => (
          <span
            key={c.cle}
            className="part"
            data-ton={TON_ETAT[c.cle]}
            style={{ flexGrow: couverture[c.cle], flexBasis: 0 }}
            title={`${c.label} — ${couverture[c.cle]}`}
          />
        ))}
      </div>
      <ul className="lem-legende">
        {COLONNES.map((c) => (
          <li key={c.cle}>
            <span className="puce" data-ton={TON_ETAT[c.cle]} />
            <span className="l">{c.label}</span>
            <b>{couverture[c.cle]}</b>
            <span className="pc">
              {somme > 0 ? `${Math.round((couverture[c.cle] / somme) * 100)} %` : '—'}
            </span>
          </li>
        ))}
      </ul>
      {somme !== total && total > 0 && (
        <p className="lem-decor" style={{ fontSize: 12, marginTop: 6 }}>
          {somme} lignes mesurées sur {total} — le reste n’a pas été relu à cette lecture.
        </p>
      )}
    </div>
  )
}

/** Où en est une ligne, EN TOUTES LETTRES. Jamais une pastille muette. */
function EtatLigne({ ligne }: { ligne: LigneVue }) {
  if (ligne.statut === 'complet') {
    return <span className="lem-pill" data-ton="ok">tranchée</span>
  }
  if (ligne.statut === 'sans_prise' || ligne.statut === 'erreur') {
    return (
      <div>
        <span className="lem-pill" data-ton="attention">
          {ligne.statut === 'erreur' ? 'en erreur' : 'sans prise'}
        </span>
        {ligne.motif && (
          <div className="lem-decor" style={{ fontSize: 12, marginTop: 3 }}>{ligne.motif}</div>
        )}
      </div>
    )
  }
  if (ligne.lieu === 'local') {
    return (
      <div>
        <span className="lem-pill" data-ton="neutre">attend le poste local</span>
        <div className="lem-decor" style={{ fontSize: 12, marginTop: 3 }}>
          {ligne.outilNom ?? ligne.outil} — se lance depuis localhost
        </div>
      </div>
    )
  }
  if (ligne.lieu === 'humain') {
    return (
      <div>
        <span className="lem-pill" data-ton="attention">attend une relecture</span>
        <div className="lem-decor" style={{ fontSize: 12, marginTop: 3 }}>
          {ligne.outilNom ?? ligne.outil}
        </div>
      </div>
    )
  }
  return <span className="lem-pill" data-ton="neutre">en file</span>
}

/**
 * Un sujet, avec ce qu'il coûte et où il tourne.
 *
 * CE QUI EST MARQUÉ N'EST PAS LE SUJET, C'EST SON CHEMIN. Un sujet ne coûte
 * rien en soi — ce sont les outils qui le tranchent qui coûtent, et ils changent
 * selon les deux interrupteurs du bas. D'où un marquage recalculé à chaque
 * réglage, plutôt qu'une étiquette figée qui mentirait dès qu'on décoche.
 */
function BoutonSujet({
  sujet,
  choisi,
  plan,
  onBascule,
}: {
  sujet: Sujet
  choisi: boolean
  plan: PlanPasse
  onBascule: () => void
}) {
  const n = natureDuSujet(sujet, plan)
  const marques = [
    n.facture ? { m: '$', t: 'un outil facturé à l’appel' } : null,
    n.local ? { m: '⌂', t: 'attend votre poste local' } : null,
    n.humain ? { m: '✋', t: 'demande une relecture à la main' } : null,
  ].filter((x) => x !== null)

  return (
    <button
      className="lem-onglet"
      aria-pressed={choisi}
      onClick={onBascule}
      title={
        n.impraticable
          ? 'Aucun outil praticable avec les réglages actuels'
          : [
              n.gratuitEnLigne ? 'un chemin serveur gratuit' : null,
              ...marques.map((x) => x.t),
            ]
              .filter(Boolean)
              .join(' · ')
      }
    >
      {SUJET_LABEL[sujet].split(' (')[0]}
      {marques.length > 0 && (
        <span className="n" style={{ marginLeft: 6 }}>
          {marques.map((x) => x.m).join(' ')}
        </span>
      )}
      {n.impraticable && (
        <span className="n" style={{ marginLeft: 6 }} aria-label="aucun outil praticable">
          ⊘
        </span>
      )}
    </button>
  )
}

/** Créer une passe : la population par filtres, le plan par sujets. */
function FormuleNouvelle({
  proprietaires,
  onCree,
  onPanne,
}: {
  proprietaires: Proprietaire[]
  onCree: (id: string) => void | Promise<void>
  onPanne: (m: string | null) => void
}) {
  const [nom, setNom] = useState('')
  const [flags, setFlags] = useState<string[]>(['vivantes'])
  const [owner, setOwner] = useState<string>('')
  const [taille, setTaille] = useState(100)
  const [sujets, setSujets] = useState<Sujet[]>([...SUJETS])
  const [exigence, setExigence] = useState<Confiance>('moyenne')
  const [facture, setFacture] = useState(true)
  const [local, setLocal] = useState(true)
  const [envoi, setEnvoi] = useState(false)

  const bascule = <T extends string>(liste: T[], v: T): T[] =>
    liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]

  // Le plan tel qu'il partirait maintenant : c'est lui qui décide quels outils
  // restent ouverts, donc ce que les marqueurs doivent dire.
  const plan: PlanPasse = { sujets, exigence, facture, local }
  const impraticables = sujets.filter((s) => natureDuSujet(s, plan).impraticable)

  const creer = async () => {
    setEnvoi(true)
    onPanne(null)
    try {
      const r = await authedFetch('/api/lissage/passes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nom: nom.trim(),
          taille,
          criteres: { flags, owner: owner || null },
          plan: { sujets, exigence, facture, local },
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        onPanne(j?.message ?? 'La création a échoué.')
        return
      }
      await onCree(j.passe.id as string)
    } catch {
      onPanne('La création a échoué.')
    } finally {
      setEnvoi(false)
    }
  }

  const pret = nom.trim().length > 0 && sujets.length > 0

  return (
    <div className="lem-carte" style={{ padding: 18, marginBottom: 14 }}>
      <label>
        <span className="lem-second" style={{ fontSize: 12.5 }}>Nom de la passe</span>
        <input
          className="lem-champ"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Cohorte B — combler la fiche Google"
        />
      </label>

      <div style={{ marginTop: 14 }}>
        <span className="lem-second" style={{ fontSize: 12.5 }}>Qui fait partie de la passe</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {FLAGS.map((f) => (
            <button
              key={f.code}
              className="lem-onglet"
              aria-pressed={flags.includes(f.code)}
              title={f.aide}
              onClick={() => setFlags((l) => bascule(l, f.code))}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* CE QUE LE FILTRE VEUT VRAIMENT DIRE. « sans_site » lit une colonne
            vide : il ramasse donc aussi bien ceux qui n'ont pas de site que
            ceux qu'on n'a jamais regardés. C'est précisément ce que la passe
            est là pour séparer — autant le dire en le choisissant. */}
        <p className="lem-decor" style={{ fontSize: 12, marginTop: 8 }}>
          Ces filtres lisent des <b>colonnes</b>&nbsp;: « sans site connu » mélange encore ceux qui
          n’en ont pas et ceux que personne n’a regardés. C’est la passe qui les sépare.
        </p>

        {/* LE PROPRIÉTAIRE SE CUMULE avec les drapeaux, il ne s'y substitue
            pas : « mes fiches » ET « sans SIRET » veut dire les deux à la fois.
            C'est le découpage avec lequel on travaille vraiment — valider ses
            propres fiches d'abord, pour pouvoir fabriquer un site derrière. */}
        {proprietaires.length > 0 && (
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="lem-second" style={{ fontSize: 12.5 }}>À qui sont les fiches</span>
            <select
              className="lem-champ"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              style={{ maxWidth: 340 }}
            >
              <option value="">Tout le parc — sans distinction de propriétaire</option>
              {proprietaires.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} — {p.fiches} fiches
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <span className="lem-second" style={{ fontSize: 12.5 }}>Ce qu’on veut trancher</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {SUJETS.map((s) => (
            <BoutonSujet
              key={s}
              sujet={s}
              choisi={sujets.includes(s)}
              plan={plan}
              onBascule={() => setSujets((l) => bascule(l, s))}
            />
          ))}
        </div>
        <p className="lem-decor" style={{ fontSize: 12, marginTop: 8 }}>
          <b>$</b> un outil facturé à l’appel · <b>⌂</b> une étape qui attend votre poste local ·
          <b> ✋</b> une relecture à la main. <b>Ils ne s’excluent pas</b>&nbsp;: un sujet peut
          avoir plusieurs chemins, et les deux cases ci-dessous décident lesquels restent ouverts.
        </p>
        {impraticables.length > 0 && (
          <div className="lem-alerte" style={{ marginTop: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Avec ces réglages, <b>{impraticables.map((s) => SUJET_LABEL[s].split(' (')[0]).join(', ')}</b>{' '}
              n’a plus aucun outil praticable. La passe partirait quand même et s’arrêterait sur
              toute la population en disant « rien ne peut prendre ce sujet ».
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-end' }}>
        <label>
          <span className="lem-second" style={{ fontSize: 12.5 }}>Combien de prospects</span>
          <input
            className="lem-champ"
            type="number"
            min={1}
            max={2000}
            value={taille}
            onChange={(e) => setTaille(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>
        <label>
          <span className="lem-second" style={{ fontSize: 12.5 }}>Confiance exigée</span>
          <select
            className="lem-champ"
            value={exigence}
            onChange={(e) => setExigence(e.target.value as Confiance)}
            style={{ width: 180 }}
          >
            <option value="faible">Faible — on accepte une présomption</option>
            <option value="moyenne">Moyenne — le réglage d’une première passe</option>
            <option value="haute">Haute</option>
            <option value="certaine">Certaine — refait vérifier ce qui a été déduit</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <input type="checkbox" checked={facture} onChange={(e) => setFacture(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Autoriser les outils facturés</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Autoriser les étapes du poste local</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="lem-btn principal" onClick={() => void creer()} disabled={!pret || envoi}>
          {envoi ? 'Création…' : 'Créer et peupler'}
        </button>
      </div>
    </div>
  )
}
