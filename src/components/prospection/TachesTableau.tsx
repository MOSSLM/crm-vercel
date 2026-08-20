'use client'
// TachesTableau — la file de prospection en TABLEAU, avec des vues qu'on garde.
//
// LE GRIEF, MOT POUR MOT : « page Démarchage trop chargée, trop rigide ; la
// barre de gauche filtre mal ». Il est mesurable — au 19/08/2026 la file porte
// 659 tâches en attente, dont 640 appels, toutes échues, sur 636 entreprises.
// Aucun rail vertical ne se lit à cette taille : on ne compare pas deux
// prospects en faisant défiler des cartes.
//
// CE QUE CET ÉCRAN CHANGE, ET RIEN D'AUTRE :
//   · un TABLEAU — des colonnes qu'on choisit, un tri qu'on clique ;
//   · des PASTILLES qui se cumulent, avec un ET/OU explicite entre elles ;
//   · des VUES qu'on nomme et qu'on retrouve — « on range son écran une fois ».
//
// TOUTE LA LOGIQUE EST AILLEURS. Filtrer, trier, compter et résumer vivent dans
// `@/lib/prospection/vue-taches` — pur, sans React ni base, 24 tests. Ce
// fichier ne fait que rendre ; c'est ce qui permet de discuter la sémantique
// d'un filtre sans ouvrir un composant de 600 lignes.
//
// LES COMPTEURS D'ONGLETS SONT DES VUES, PAS DES SIGNAUX ADDITIONNÉS. C'est le
// grief n° 2 : en haut de l'ancienne page, un prospect chaud ET en discussion
// était compté deux fois, et personne ne savait plus combien de gens il y
// avait. Ici un onglet annonce le nombre de LIGNES que sa question rend — donc
// deux onglets peuvent montrer la même tâche, mais aucun ne la compte deux fois.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowDown, ArrowUp, Bookmark, CalendarClock, Check, Columns3,
  Linkedin, Mail, MessageCircle, Phone, Plus, RotateCcw, Trash2, UserCog, X, MessageSquare,
} from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import {
  CHAMPS, CHAMP_LABEL, COLONNES, COLONNE_LABEL, CRITERES_VIDES, SEAU_LABEL,
  colonnesDeLaVue, filtrerTaches, libelleValeur, resumerCriteres, seauDeLEcheance,
  valeursProposees,
  type Champ, type Colonne, type CriteresVue, type Filtre, type LigneTache,
  type Operateur, type SeauEcheance,
} from '@/lib/prospection/vue-taches'
import './lem-skin.css'

interface VueEnregistree {
  id: string
  nom: string
  agentId: string | null
  criteres: CriteresVue | null
  utiliseLe: string | null
}

const ICONE_CANAL: Record<string, React.ComponentType<{ size?: number }>> = {
  call: Phone,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  linkedin: Linkedin,
  email: Mail,
}

const TON_STATUT: Record<string, string> = {
  pending: 'neutre',
  done: 'ok',
  snoozed: 'attention',
  skipped: 'neutre',
}

/** Une date lisible, ou un tiret — jamais « Invalid Date » au milieu d'un tableau. */
const quand = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Les opérateurs proposés, dans l'ordre où on les cherche. */
const OPERATEUR_LABEL: Record<Operateur, string> = {
  est: 'est',
  nest_pas: 'n’est pas',
  contient: 'contient',
  vide: 'est vide',
  non_vide: 'est renseigné',
}

/**
 * Un panneau qui se ferme quand on clique ailleurs.
 *
 * Sans ça, ouvrir trois pastilles laisse trois panneaux ouverts par-dessus le
 * tableau — et le tableau est ce qu'on est venu lire.
 */
function useFermetureAuClicDehors(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const surClic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer()
    }
    const surEchap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer()
    }
    document.addEventListener('mousedown', surClic)
    document.addEventListener('keydown', surEchap)
    return () => {
      document.removeEventListener('mousedown', surClic)
      document.removeEventListener('keydown', surEchap)
    }
  }, [ouvert, fermer])
  return ref
}

/**
 * Le tableau sert DEUX périmètres.
 *
 * `admin` voit toute la file et peut réattribuer ; `agent` ne voit que la
 * sienne — l'union de « ce qui m'est attribué » et de « mes entreprises » — et
 * n'a PAS le geste « changer d'agent » : la réattribution est le filet de
 * sécurité de l'admin, et un agent qui se donne les tâches d'un autre casse la
 * répartition sans que personne le voie. Le mur est posé côté serveur ; ici on
 * ne fait que ne pas offrir un bouton qui rendrait 403.
 */
export function TachesTableau({ perimetre = 'admin' }: { perimetre?: 'admin' | 'agent' } = {}) {
  const estAgent = perimetre === 'agent'
  const apiTaches = estAgent ? '/api/agent/taches' : '/api/prospection/taches'
  const apiVues = estAgent ? '/api/agent/vues' : '/api/prospection/vues'

  const [lignes, setLignes] = useState<LigneTache[]>([])
  const [vues, setVues] = useState<VueEnregistree[]>([])
  const [criteres, setCriteres] = useState<CriteresVue>(CRITERES_VIDES)
  const [vueActive, setVueActive] = useState<string | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState(false)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [tronque, setTronque] = useState(false)
  // UNE LECTURE QUI ÉCHOUE N'EST PAS UNE FILE VIDE. Sans cet état, une session
  // expirée affichait « aucune tâche ne répond à ce filtre » — un tableau qui
  // accuse le filtre d'un problème d'authentification. C'est la règle du CRM,
  // celle-là même qui distingue « absent » d'« inconnu » : un zéro et une
  // absence de mesure ne sont pas la même chose.
  const [panne, setPanne] = useState<string | null>(null)
  const [agents, setAgents] = useState<Array<{ valeur: string; libelle: string }>>([])

  const charger = useCallback(async () => {
    const r = await authedFetch(apiTaches)
    const j = await r.json()
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Chargement impossible')
    setLignes(j.lignes ?? [])
    setTronque(Boolean(j.tronque))
  }, [apiTaches])

  useEffect(() => {
    Promise.all([
      charger(),
      authedFetch(apiVues)
        .then(async (r) => {
          const j = await r.json()
          // La table peut ne pas être appliquée : l'écran marche sans vues, il
          // ne doit pas tomber pour autant.
          if (r.ok) setVues(j.vues ?? [])
        })
        .catch(() => undefined),
    ])
      .catch((e: Error) => {
        setPanne(e.message)
        toast.error(e.message)
      })
      .finally(() => setChargement(false))
  }, [charger])

  // Le contexte de lecture est FIGÉ au montage : sans ça, chaque rendu
  // recalculerait les seaux d'échéance sur un « maintenant » différent, et une
  // ligne pourrait changer de seau entre deux frappes au clavier.
  const ctx = useMemo(() => ({ maintenant: new Date(), fuseau: 'Europe/Paris' }), [])

  const vues_ = useMemo(() => filtrerTaches(lignes, criteres, ctx), [lignes, criteres, ctx])
  const colonnes = colonnesDeLaVue(criteres)
  const tri = criteres.tri ?? { colonne: 'echeance' as Colonne, sens: 'asc' as const }

  useEffect(() => {
    // Les agents servent au geste « changer d'agent » : on les relève sur la
    // file plutôt que d'appeler une route de plus — ceux qui portent des tâches
    // sont exactement ceux à qui on peut en donner.
    setAgents(valeursProposees(lignes, 'agent', ctx).map((v) => ({ valeur: v.valeur, libelle: v.libelle })))
  }, [lignes, ctx])

  /* ── Les vues ─────────────────────────────────────────────────────────── */

  const ouvrirVue = (v: VueEnregistree | null) => {
    setCriteres(v?.criteres ?? CRITERES_VIDES)
    setVueActive(v?.id ?? null)
    setSelection(new Set())
    if (v) {
      void authedFetch(apiVues, {
        method: 'PATCH',
        body: JSON.stringify({ id: v.id, utilisee: true }),
      }).catch(() => undefined)
    }
  }

  const enregistrerVue = async () => {
    const nom = window.prompt('Nom de la vue', resumerCriteres(criteres).slice(0, 60))?.trim()
    if (!nom) return
    setOccupe(true)
    try {
      const r = await authedFetch(apiVues, {
        method: 'POST',
        body: JSON.stringify({ nom, criteres }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Enregistrement impossible')
      const vue: VueEnregistree = {
        id: j.vue.id,
        nom: j.vue.nom,
        agentId: j.vue.agent_id ?? null,
        criteres,
        utiliseLe: null,
      }
      setVues((v) => [...v, vue])
      setVueActive(vue.id)
      toast.success(`Vue « ${nom} » enregistrée`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOccupe(false)
    }
  }

  const supprimerVue = async (id: string) => {
    const v = vues.find((x) => x.id === id)
    if (!v || !window.confirm(`Supprimer la vue « ${v.nom} » ?`)) return
    // Supprimer une vue ne supprime AUCUNE tâche : une vue ne contient pas de
    // lignes, elle contient une question.
    try {
      const r = await authedFetch(apiVues, {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      })
      if (!r.ok) throw new Error('Suppression impossible')
      setVues((liste) => liste.filter((x) => x.id !== id))
      if (vueActive === id) ouvrirVue(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ── Les pastilles ────────────────────────────────────────────────────── */

  const majFiltres = (f: Filtre[]) => {
    setCriteres((c) => ({ ...c, filtres: f }))
    // Modifier le filtre détache la vue : ce qu'on regarde n'est plus ce que la
    // vue dit. La reprendre est un clic, l'enregistrer aussi.
    setVueActive(null)
    setSelection(new Set())
  }

  const ajouterFiltre = (champ: Champ) => {
    majFiltres([...criteres.filtres, { champ, operateur: 'est', valeurs: [] }])
    setOuvert(`f${criteres.filtres.length}`)
  }

  const basculerValeur = (i: number, valeur: string) => {
    const f = [...criteres.filtres]
    const actuel = f[i]
    const dedans = actuel.valeurs.includes(valeur)
    f[i] = {
      ...actuel,
      valeurs: dedans ? actuel.valeurs.filter((v) => v !== valeur) : [...actuel.valeurs, valeur],
    }
    majFiltres(f)
  }

  /** « contient » n'a qu'un texte : on l'écrit, on ne le bascule pas. */
  const poserTexte = (i: number, texte: string) => {
    const f = [...criteres.filtres]
    f[i] = { ...f[i], valeurs: texte.trim() ? [texte] : [] }
    majFiltres(f)
  }

  const changerOperateur = (i: number, operateur: Operateur) => {
    const f = [...criteres.filtres]
    // Passer à « est vide » jette les valeurs : elles ne veulent plus rien dire,
    // et les garder les ferait revenir à la bascule suivante.
    f[i] = {
      ...f[i],
      operateur,
      valeurs: operateur === 'vide' || operateur === 'non_vide' ? [] : f[i].valeurs,
    }
    majFiltres(f)
  }

  const trierPar = (colonne: Colonne) => {
    setCriteres((c) => ({
      ...c,
      tri:
        c.tri?.colonne === colonne
          ? { colonne, sens: c.tri.sens === 'asc' ? 'desc' : 'asc' }
          : { colonne, sens: 'asc' },
    }))
  }

  /* ── Les gestes de masse ──────────────────────────────────────────────── */

  const agirEnMasse = async (
    action: 'reporter' | 'attribuer' | 'ignorer' | 'reprendre',
    extra: Record<string, unknown> = {},
  ) => {
    const ids = [...selection]
    if (ids.length === 0) return
    setOccupe(true)
    try {
      const r = await authedFetch(apiTaches, {
        method: 'PATCH',
        body: JSON.stringify({ ids, action, ...extra }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Action impossible')
      // Dire ce qui n'a PAS bougé : une tâche déjà faite n'est jamais rouverte,
      // et annoncer « 40 modifiées » quand 37 l'ont été serait un mensonge de
      // trois lignes qu'on ne retrouverait jamais.
      toast.success(
        j.ignorees > 0
          ? `${j.touchees} tâche(s) modifiée(s) — ${j.ignorees} déjà faite(s), laissée(s) telle(s) quelle(s)`
          : `${j.touchees} tâche(s) modifiée(s)`,
      )
      setSelection(new Set())
      setOuvert(null)
      await charger()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOccupe(false)
    }
  }

  const toutSelectionner = () => {
    setSelection((s) => (s.size === vues_.length ? new Set() : new Set(vues_.map((l) => l.id))))
  }

  /* ── Le rendu ─────────────────────────────────────────────────────────── */

  const enAttente = lignes.filter((l) => l.statut === 'pending').length
  const nbVues = (v: VueEnregistree) =>
    v.criteres ? filtrerTaches(lignes, v.criteres, ctx).length : 0

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Tâches</h1>
            <p className="lem-sous">
              La file entière, en tableau. Les pastilles se cumulent, le tri se clique, et un
              filtre qu’on garde devient une vue — <em>on range son écran une fois</em>.
            </p>
          </div>
          <button
            className="lem-btn"
            onClick={enregistrerVue}
            disabled={occupe || chargement}
            title="Enregistrer le filtre courant sous un nom"
          >
            <Bookmark size={15} /> Enregistrer la vue
          </button>
        </header>

        {tronque && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 14 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>La file dépasse ce que cet écran lit d’un coup.</b> Les compteurs ci-dessous ne
              portent donc pas sur tout : c’est le moment de paginer la lecture.
            </div>
          </div>
        )}

        {/* ── Les onglets de vues ─────────────────────────────────────── */}
        <div className="lem-onglets" style={{ marginBottom: 12 }}>
          <button
            className="lem-onglet"
            aria-pressed={vueActive === null && criteres.filtres.length === 0}
            onClick={() => ouvrirVue(null)}
          >
            Toute la file <span className="n">{lignes.length}</span>
          </button>
          {vues.map((v) => (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button className="lem-onglet" aria-pressed={vueActive === v.id} onClick={() => ouvrirVue(v)}>
                {v.nom} <span className="n">{nbVues(v)}</span>
              </button>
              {vueActive === v.id && (
                <button
                  className="lem-btn discret"
                  style={{ padding: '4px 6px' }}
                  onClick={() => supprimerVue(v.id)}
                  title="Supprimer cette vue"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* ── La barre de filtres ─────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12,
          }}
        >
          {criteres.filtres.map((f, i) => (
            <React.Fragment key={`${f.champ}-${i}`}>
              {i > 0 && (
                <button
                  className="lem-liant"
                  onClick={() => setCriteres((c) => ({ ...c, mode: c.mode === 'et' ? 'ou' : 'et' }))}
                  title="Basculer entre ET et OU — le mode vaut pour toutes les pastilles"
                >
                  {criteres.mode === 'et' ? 'ET' : 'OU'}
                </button>
              )}
              <PastilleFiltre
                filtre={f}
                lignes={lignes}
                ctx={ctx}
                ouvert={ouvert === `f${i}`}
                onOuvrir={() => setOuvert(ouvert === `f${i}` ? null : `f${i}`)}
                onFermer={() => setOuvert(null)}
                onOperateur={(o) => changerOperateur(i, o)}
                onValeur={(v) => basculerValeur(i, v)}
                onTexte={(t) => poserTexte(i, t)}
                onRetirer={() => majFiltres(criteres.filtres.filter((_, j) => j !== i))}
              />
            </React.Fragment>
          ))}

          <Panneau
            ouvert={ouvert === 'champ'}
            onFermer={() => setOuvert(null)}
            declencheur={
              <button className="lem-btn discret" onClick={() => setOuvert(ouvert === 'champ' ? null : 'champ')}>
                <Plus size={14} /> Filtre
              </button>
            }
          >
            <div className="titre">Filtrer sur</div>
            {CHAMPS.map((c) => (
              <button key={c} onClick={() => { setOuvert(null); ajouterFiltre(c) }}>
                {CHAMP_LABEL[c]}
              </button>
            ))}
          </Panneau>

          <div style={{ flex: 1 }} />

          <Panneau
            ouvert={ouvert === 'colonnes'}
            onFermer={() => setOuvert(null)}
            declencheur={
              <button
                className="lem-btn discret"
                onClick={() => setOuvert(ouvert === 'colonnes' ? null : 'colonnes')}
              >
                <Columns3 size={14} /> Colonnes
              </button>
            }
          >
            <div className="titre">Colonnes affichées</div>
            {COLONNES.map((c) => (
              <label className="opt" key={c}>
                <input
                  type="checkbox"
                  checked={colonnes.includes(c)}
                  onChange={() => {
                    const suivantes = colonnes.includes(c)
                      ? colonnes.filter((x) => x !== c)
                      : [...colonnes, c]
                    // Décocher la dernière colonne rendrait un tableau sans
                    // tête ni corps : le réglage sert à ajouter, pas à casser.
                    if (suivantes.length === 0) return
                    setCriteres((cr) => ({ ...cr, colonnes: suivantes as Colonne[] }))
                  }}
                />
                {COLONNE_LABEL[c]}
              </label>
            ))}
          </Panneau>
        </div>

        {/* ── Le tableau ──────────────────────────────────────────────── */}
        <div className="lem-carte">
          {chargement ? (
            <div className="lem-vide">Chargement…</div>
          ) : panne ? (
            <div className="lem-vide">
              <h3>La file n’a pas pu être lue</h3>
              <p>
                {panne === 'unauthorized'
                  ? 'Session expirée ou compte sans les droits d’administration. Se reconnecter, puis recharger.'
                  : panne}
                {' '}Ce n’est pas un tableau vide : on ne sait pas ce qu’il contient.
              </p>
              <button
                className="lem-btn principal"
                onClick={() => {
                  setPanne(null)
                  setChargement(true)
                  charger()
                    .catch((e: Error) => setPanne(e.message))
                    .finally(() => setChargement(false))
                }}
              >
                Réessayer
              </button>
            </div>
          ) : vues_.length === 0 ? (
            <div className="lem-vide">
              <h3>Aucune tâche ne répond à ce filtre</h3>
              {/* Ce qui bloque se dit en français, à l'endroit où ça bloque. */}
              <p>
                Le filtre courant lit : <b>{resumerCriteres(criteres)}</b>.{' '}
                {lignes.length > 0 && `La file en porte ${lignes.length} au total.`}
              </p>
              <button className="lem-btn principal" onClick={() => ouvrirVue(null)}>
                Voir toute la file
              </button>
            </div>
          ) : (
            <table className="lem-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selection.size === vues_.length && vues_.length > 0}
                      onChange={toutSelectionner}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  {colonnes.map((c) => (
                    <th
                      key={c}
                      onClick={() => trierPar(c)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={`Trier par ${COLONNE_LABEL[c].toLowerCase()}`}
                    >
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {COLONNE_LABEL[c]}
                        {tri.colonne === c &&
                          (tri.sens === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vues_.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selection.has(l.id)}
                        onChange={() =>
                          setSelection((s) => {
                            const n = new Set(s)
                            if (n.has(l.id)) n.delete(l.id)
                            else n.add(l.id)
                            return n
                          })
                        }
                        aria-label={`Sélectionner ${l.entreprise}`}
                      />
                    </td>
                    {colonnes.map((c) => (
                      <td key={c}>
                        <Cellule ligne={l} colonne={c} ctx={ctx} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!chargement && vues_.length > 0 && (
          <p className="lem-second" style={{ fontSize: 12.5, marginTop: 10 }}>
            {vues_.length} ligne{vues_.length > 1 ? 's' : ''} sur {lignes.length} — {enAttente} en
            attente dans la file entière. {resumerCriteres(criteres)}.
          </p>
        )}

        {/* ── Les gestes de masse ─────────────────────────────────────── */}
        {selection.size > 0 && (
          <div className="lem-barre-masse">
            <span>
              {selection.size} sélectionnée{selection.size > 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1 }} />

            <Panneau
              ouvert={ouvert === 'reporter'}
              onFermer={() => setOuvert(null)}
              versLeHaut
              declencheur={
                <button
                  className="lem-btn"
                  disabled={occupe}
                  onClick={() => setOuvert(ouvert === 'reporter' ? null : 'reporter')}
                >
                  <CalendarClock size={14} /> Reporter
                </button>
              }
            >
              <div className="titre">Remettre en file dans</div>
              {[
                ['Demain', 1],
                ['Dans 3 jours', 3],
                ['Dans une semaine', 7],
                ['Dans un mois', 30],
              ].map(([label, jours]) => (
                <button
                  key={label as string}
                  onClick={() =>
                    agirEnMasse('reporter', {
                      jusquau: new Date(Date.now() + (jours as number) * 86_400_000).toISOString(),
                    })
                  }
                >
                  {label as string}
                </button>
              ))}
            </Panneau>

            {/* RÉATTRIBUER EST LE FILET DE SÉCURITÉ DE L'ADMIN, pas un geste
                d'agent : la route rendrait 403, et un bouton qui rend 403 est
                un bouton qu'on clique deux fois avant de comprendre. */}
            {!estAgent && (
              <>
            <Panneau
              ouvert={ouvert === 'agent'}
              onFermer={() => setOuvert(null)}
              versLeHaut
              declencheur={
                <button
                  className="lem-btn"
                  disabled={occupe}
                  onClick={() => setOuvert(ouvert === 'agent' ? null : 'agent')}
                >
                  <UserCog size={14} /> Changer d’agent
                </button>
              }
            >
              <div className="titre">Attribuer à</div>
              {agents.map((a) => (
                <button key={a.valeur} onClick={() => agirEnMasse('attribuer', { agentId: a.valeur })}>
                  {a.libelle}
                </button>
              ))}
              <button onClick={() => agirEnMasse('attribuer', { agentId: null })}>
                Personne (détacher)
              </button>
            </Panneau>
              </>
            )}

            <button className="lem-btn" disabled={occupe} onClick={() => agirEnMasse('reprendre')}>
              <RotateCcw size={14} /> Remettre en file
            </button>
            <button className="lem-btn" disabled={occupe} onClick={() => agirEnMasse('ignorer')}>
              <X size={14} /> Ignorer
            </button>
            <button className="lem-btn discret" onClick={() => setSelection(new Set())}>
              Annuler
            </button>
          </div>
        )}

        {/* CE QUE CET ÉCRAN NE FAIT PAS, ET POURQUOI — dit ici plutôt que
            découvert par son absence. */}
        <p className="lem-second" style={{ fontSize: 12, marginTop: 14, maxWidth: '76ch' }}>
          <b>« Terminer » n’est pas un geste de masse.</b> Boucler une tâche date la première touche
          de l’entreprise et fait avancer sa séquence — et les deux cohortes se comparent à l’âge
          depuis cette date. Cocher cinquante appels « faits » ici daterait cinquante premiers
          contacts qui n’ont pas eu lieu. « Fait » reste là où le travail se fait.
        </p>
      </div>
    </div>
  )
}

/* ── Les morceaux ─────────────────────────────────────────────────────── */

function Panneau({
  ouvert, onFermer, declencheur, children, versLeHaut,
}: {
  ouvert: boolean
  onFermer: () => void
  declencheur: React.ReactNode
  children: React.ReactNode
  versLeHaut?: boolean
}) {
  const ref = useFermetureAuClicDehors(ouvert, onFermer)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {declencheur}
      {ouvert && (
        <div className="lem-pop" style={versLeHaut ? { bottom: '100%', marginBottom: 6 } : undefined}>
          {children}
        </div>
      )}
    </div>
  )
}

function PastilleFiltre({
  filtre, lignes, ctx, ouvert, onOuvrir, onFermer, onOperateur, onValeur, onTexte, onRetirer,
}: {
  filtre: Filtre
  lignes: readonly LigneTache[]
  ctx: { maintenant: Date; fuseau: string }
  ouvert: boolean
  onOuvrir: () => void
  onFermer: () => void
  onOperateur: (o: Operateur) => void
  onValeur: (v: string) => void
  onTexte: (t: string) => void
  onRetirer: () => void
}) {
  const proposees = useMemo(
    () => valeursProposees(lignes, filtre.champ, ctx),
    [lignes, filtre.champ, ctx],
  )

  const resume =
    filtre.operateur === 'vide' || filtre.operateur === 'non_vide'
      ? OPERATEUR_LABEL[filtre.operateur]
      : filtre.valeurs.length === 0
        ? 'toutes'
        : filtre.valeurs
            .map((v) =>
              filtre.champ === 'echeance'
                ? (SEAU_LABEL[v as SeauEcheance] ?? v)
                : (proposees.find((p) => p.valeur === v)?.libelle ?? libelleValeur(v)),
            )
            // Le « ou » est écrit en toutes lettres : c'est la règle qu'on veut
            // rendre évidente sans avoir à la lire ailleurs.
            .join(' ou ')

  return (
    <Panneau
      ouvert={ouvert}
      onFermer={onFermer}
      declencheur={
        <span className="lem-filtre">
          <button
            onClick={onOuvrir}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
          >
            <span className="champ">{CHAMP_LABEL[filtre.champ]}</span>{' '}
            {filtre.operateur === 'nest_pas' && <span className="champ">ni </span>}
            {filtre.operateur === 'contient' && <span className="champ">contient </span>}
            {resume}
          </button>
          <button className="x" onClick={onRetirer} aria-label="Retirer ce filtre">
            <X size={12} />
          </button>
        </span>
      }
    >
      <div className="titre">{CHAMP_LABEL[filtre.champ]}</div>
      {(['est', 'nest_pas', 'contient', 'vide', 'non_vide'] as Operateur[]).map((o) => (
        <button key={o} onClick={() => onOperateur(o)}>
          {filtre.operateur === o ? <Check size={13} /> : <span style={{ width: 13 }} />}
          {OPERATEUR_LABEL[o]}
        </button>
      ))}

      {filtre.operateur === 'contient' ? (
        <div style={{ padding: '6px 9px' }}>
          <input
            className="lem-champ"
            placeholder="Texte à chercher"
            defaultValue={filtre.valeurs[0] ?? ''}
            // POSER, PAS BASCULER. Deux bascules dans le même événement — une
            // pour retirer l'ancien texte, une pour ajouter le nouveau —
            // liraient toutes deux l'état d'AVANT : React groupe les mises à
            // jour, et l'ancien texte resterait à côté du nouveau. Un champ de
            // texte n'a qu'une valeur, on l'écrit d'un coup.
            onChange={(e) => onTexte(e.target.value)}
          />
        </div>
      ) : filtre.operateur !== 'vide' && filtre.operateur !== 'non_vide' ? (
        <>
          <div className="titre">Valeurs</div>
          {proposees.length === 0 ? (
            <div style={{ padding: '6px 9px', fontSize: 12.5, color: 'var(--lem-gris-2)' }}>
              Aucune valeur dans la file.
            </div>
          ) : (
            proposees.map((p) => (
              <label className="opt" key={p.valeur}>
                <input
                  type="checkbox"
                  checked={filtre.valeurs.includes(p.valeur)}
                  onChange={() => onValeur(p.valeur)}
                />
                {p.libelle}
                {/* Compté sur la file ENTIÈRE, jamais sur le résultat courant :
                    sinon ce chiffre ne sert plus à choisir le filtre suivant. */}
                <span className="n">{p.n}</span>
              </label>
            ))
          )}
        </>
      ) : null}
    </Panneau>
  )
}

function Cellule({
  ligne, colonne, ctx,
}: {
  ligne: LigneTache
  colonne: Colonne
  ctx: { maintenant: Date; fuseau: string }
}) {
  switch (colonne) {
    case 'canal': {
      const Icone = ICONE_CANAL[ligne.canal]
      return (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} title={libelleValeur(ligne.canal)}>
          {Icone ? <Icone size={15} /> : null}
          <span className="lem-second" style={{ fontSize: 12.5 }}>{libelleValeur(ligne.canal)}</span>
        </span>
      )
    }
    case 'entreprise':
      return (
        <span>
          <span style={{ fontWeight: 600 }}>{ligne.entreprise}</span>
          {ligne.aRepondu && (
            <span className="lem-pill" data-ton="ok" style={{ marginLeft: 7 }}>
              a répondu
            </span>
          )}
          {!ligne.premiereTouche && (
            <span className="lem-pill" data-ton="neutre" style={{ marginLeft: 7 }}>
              1er contact
            </span>
          )}
        </span>
      )
    case 'titre':
      return <span>{ligne.titre || '—'}</span>
    case 'echeance': {
      const seau = seauDeLEcheance(ligne.echeance, ctx.maintenant, ctx.fuseau)
      return (
        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
          <span className="num">{quand(ligne.echeance)}</span>
          {seau === 'echue' && (
            <span className="lem-pill" data-ton="danger">
              échue
            </span>
          )}
        </span>
      )
    }
    case 'campagne':
      return ligne.campagneId && ligne.campagne ? (
        <Link href={`/prospection/campagnes/${ligne.campagneId}`} style={{ color: 'inherit' }}>
          {ligne.campagne}
        </Link>
      ) : (
        // Ni campagne ni séquence : c'est le cas des 640 appels semés hors de
        // toute automatisation. Le dire vaut mieux qu'une cellule vide.
        <span className="lem-second" style={{ fontSize: 12.5 }}>hors campagne</span>
      )
    case 'agent':
      // « Non attribuée » et « attribuée à quelqu'un dont on ignore le nom » ne
      // sont pas la même chose : c'est `agentId` qui tranche, pas le libellé.
      // Confondre les deux ferait passer 72 tâches bien attribuées pour du
      // stock libre — la même faute que « zéro » à la place de « non mesuré ».
      if (!ligne.agentId) return <span className="lem-second">non attribuée</span>
      return <span>{ligne.agent ?? <span className="lem-second">agent inconnu</span>}</span>
    case 'cohorte':
      return ligne.cohorte ? (
        <span className="lem-pill" data-ton="neutre">{libelleValeur(ligne.cohorte)}</span>
      ) : (
        <span className="lem-decor">—</span>
      )
    case 'ville':
      return <span>{ligne.ville ?? <span className="lem-decor">—</span>}</span>
    case 'statut':
      return (
        <span className="lem-pill" data-ton={TON_STATUT[ligne.statut] ?? 'neutre'}>
          {libelleValeur(ligne.statut)}
        </span>
      )
    case 'motif':
      return <span className="lem-second" style={{ fontSize: 12.5 }}>{ligne.motif ?? '—'}</span>
    case 'reponse':
      return ligne.aRepondu ? (
        <span className="lem-pill" data-ton="ok">a répondu</span>
      ) : (
        <span className="lem-decor">—</span>
      )
  }
}
