'use client'
// SequenceCanvas — la séquence sur un plan, pas dans une colonne.
//
// POURQUOI UN PLAN
// Tant qu'une séquence était une file d'étapes, une colonne suffisait. Les
// attentes à délai ont changé ça : elles ouvrent DEUX suites, et deux
// alternatives empilées verticalement se lisent comme une chronologie. On
// croyait lire « puis », on lisait « ou bien ». Ici le tronc descend au centre
// et chaque fourche écarte ses voies à gauche et à droite — la forme de la
// séquence se voit enfin d'un coup d'œil.
//
// DÉPLACER UNE CARTE EST UN GESTE D'ÉDITION, PAS DE MISE EN PAGE
// Aucune coordonnée n'est stockée : la position se déduit du tableau d'étapes
// (`src/lib/automations/canvas.ts`). Tirer une carte ne la « pose » donc pas
// quelque part, ça la RANGE : nouvel ordre, et nouvelle voie si on la lâche
// dans l'autre branche. Le dessin ne peut pas mentir sur ce que le moteur fera,
// puisqu'il n'existe pas d'autre vérité que le tableau.
//
// CE QUE LE PLAN AUTORISE ET CE QU'IL REFUSE
// Les places d'accueil sont calculées, pas devinées : `depotValide` écarte les
// dépôts qui produiraient une définition incohérente (une attente dans sa
// propre voie) ou sans effet. Un marqueur ne s'affiche que là où le geste veut
// dire quelque chose.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { XI } from './icons'
import { ISSUE_LABEL, type BrancheEtape } from '@/lib/automations/branches'
import {
  ancrage,
  CARTE_H,
  CARTE_L,
  ciblesDeDepot,
  COLONNE_L,
  depotValide,
  LIGNE_H,
  MARGE,
  planCanvas,
  type CibleDepot,
  type NoeudCanvas,
} from '@/lib/automations/canvas'
import type { SequenceStep } from './types'

const ZOOM_MIN = 0.4
const ZOOM_MAX = 1.6

interface Vue {
  x: number
  y: number
  zoom: number
}

/** Un trait coudé entre deux points, avec des angles arrondis. */
function chemin(ax: number, ay: number, bx: number, by: number): string {
  if (Math.abs(bx - ax) < 1) return `M ${ax} ${ay} L ${bx} ${by}`
  const sens = bx > ax ? 1 : -1
  const midY = ay + (by - ay) / 2
  const r = Math.min(14, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2)
  return [
    `M ${ax} ${ay}`,
    `L ${ax} ${midY - r}`,
    `Q ${ax} ${midY} ${ax + sens * r} ${midY}`,
    `L ${bx - sens * r} ${midY}`,
    `Q ${bx} ${midY} ${bx} ${midY + r}`,
    `L ${bx} ${by}`,
  ].join(' ')
}

export function SequenceCanvas({
  steps,
  selectedId,
  onSelect,
  onDelete,
  onMove,
  onDeplacer,
  onAjouter,
  carte,
}: {
  steps: SequenceStep[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  /**
   * Le pendant clavier du glisser : les deux flèches de la carte décalent
   * l'étape d'un cran dans le tableau. Tirer à la souris est plus expressif,
   * mais ne doit pas être le SEUL moyen de réordonner.
   */
  onMove: (stepId: string, dir: -1 | 1) => void
  onDeplacer: (stepId: string, cible: CibleDepot) => void
  /** `null` = ajouter au tronc, sinon dans la voie indiquée. */
  onAjouter: (branch: BrancheEtape | null) => void
  /** Le rendu d'une carte d'étape — l'éditeur le fournit, le plan le place. */
  carte: (args: { step: SequenceStep; index: number; orpheline: boolean }) => React.ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [vue, setVue] = useState<Vue>({ x: 0, y: 0, zoom: 1 })
  const [pan, setPan] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null)
  /**
   * `actif` faux tant que la souris n'a pas franchi le seuil : une carte se
   * clique pour l'inspecter ET se tire pour la ranger. Sans ce seuil, il aurait
   * fallu une poignée de quelques pixels, et le moindre tremblement pendant un
   * clic aurait déplacé l'étape.
   */
  const [drag, setDrag] = useState<{
    stepId: string
    x: number
    y: number
    depart: { x: number; y: number }
    actif: boolean
  } | null>(null)

  const plan = useMemo(() => planCanvas(steps), [steps])
  const cibles = useMemo(() => ciblesDeDepot(steps, plan), [steps, plan])
  const parCle = useMemo(() => new Map(plan.noeuds.map((n) => [n.key, n])), [plan])

  /** Le point du plan sous le curseur, zoom et déplacement défaits. */
  const versLePlan = useCallback(
    (clientX: number, clientY: number) => {
      const r = hostRef.current?.getBoundingClientRect()
      if (!r) return { x: 0, y: 0 }
      return { x: (clientX - r.left - vue.x) / vue.zoom, y: (clientY - r.top - vue.y) / vue.zoom }
    },
    [vue],
  )

  /** Cadre le plan entier dans la fenêtre — le geste « je me suis perdu ». */
  const ajuster = useCallback(() => {
    const r = hostRef.current?.getBoundingClientRect()
    if (!r) return
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(r.width / plan.largeur, r.height / plan.hauteur, 1)))
    setVue({
      x: (r.width - plan.largeur * zoom) / 2,
      // Le haut plutôt que le centre : une séquence plus haute que l'écran doit
      // s'ouvrir sur son début, pas sur son milieu.
      y: plan.hauteur * zoom < r.height ? (r.height - plan.hauteur * zoom) / 2 : 0,
      zoom,
    })
  }, [plan.largeur, plan.hauteur])

  // Au premier rendu seulement : ensuite, c'est l'utilisateur qui cadre, et
  // recadrer sous ses yeux à chaque ajout d'étape serait insupportable.
  const cadre = useRef(false)
  useEffect(() => {
    if (cadre.current || plan.noeuds.length === 0) return
    cadre.current = true
    ajuster()
  }, [ajuster, plan.noeuds.length])

  /** Zoom centré sur le curseur : le point visé ne bouge pas sous la souris. */
  const zoomer = useCallback((facteur: number, ox: number, oy: number) => {
    setVue((v) => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * facteur))
      const k = zoom / v.zoom
      return { zoom, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k }
    })
  }, [])

  /**
   * La molette est écoutée en natif, et NON PASSIF.
   *
   * React pose ses écouteurs `wheel` en passif à la racine : depuis un
   * `onWheel` JSX, `preventDefault()` n'a aucun effet, et un ⌘+molette
   * zoomerait le navigateur par-dessus le plan. Il faut donc s'abonner
   * soi-même à l'élément.
   */
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      // Ctrl/⌘ + molette = zoom, comme partout ailleurs — c'est aussi ce que
      // produit le pincement sur un pavé tactile. Molette seule = on fait
      // glisser le plan, ce qu'on attend d'une grande surface.
      if (e.ctrlKey || e.metaKey) {
        zoomer(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX - r.left, e.clientY - r.top)
        return
      }
      setVue((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomer])

  /** Zoom au bouton : centré sur la fenêtre, pas sur le coin du plan. */
  const zoomerAuCentre = (facteur: number) => {
    const r = hostRef.current?.getBoundingClientRect()
    zoomer(facteur, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2)
  }

  /* ── Déplacements ──────────────────────────────────────────────────────── */

  const onFondDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    hostRef.current?.setPointerCapture(e.pointerId)
    setPan({ x: e.clientX, y: e.clientY, vx: vue.x, vy: vue.y })
  }

  const SEUIL = 4

  const suivreLeCurseur = (e: React.PointerEvent) => {
    if (pan) {
      setVue((v) => ({ ...v, x: pan.vx + (e.clientX - pan.x), y: pan.vy + (e.clientY - pan.y) }))
      return
    }
    if (!drag) return
    const p = versLePlan(e.clientX, e.clientY)
    const parcouru = Math.hypot(e.clientX - drag.depart.x, e.clientY - drag.depart.y)
    setDrag({ ...drag, x: p.x, y: p.y, actif: drag.actif || parcouru > SEUIL })
  }

  /**
   * La place d'accueil visée, ou `null` s'il n'y en a pas.
   *
   * D'ABORD LA COLONNE, ENSUITE LA HAUTEUR
   * Une distance unique, même pondérée, ne marche pas ici : pour préférer la
   * colonne sous le curseur il faut alourdir l'écart horizontal, mais une
   * colonne voisine est alors si « loin » qu'on ne peut plus jamais viser
   * l'autre voie. On tranche donc en deux temps — la colonne sous le curseur,
   * puis la place la plus proche DANS cette colonne.
   *
   * ET LE DROIT DE NE RIEN VISER
   * Sans le rayon, lâcher une carte exactement là où elle est la propulsait à
   * l'autre bout : ses propres places étant écartées comme sans effet, la plus
   * proche restante se trouvait dans une autre colonne. Au-delà du rayon, on ne
   * vise rien, et relâcher ne fait rien — ce qui est la bonne façon d'annuler.
   */
  const cibleActive = useMemo(() => {
    if (!drag?.actif) return null
    const RAYON = LIGNE_H * 1.5
    const colVisee = Math.round((drag.x - MARGE - CARTE_L / 2) / COLONNE_L) + plan.colMin

    let meilleure: CibleDepot | null = null
    let best = Infinity
    for (const c of cibles) {
      if (c.col !== colVisee) continue
      if (!depotValide(steps, drag.stepId, c)) continue
      const ecart = Math.abs(drag.y - c.y)
      if (ecart < best) {
        best = ecart
        meilleure = c
      }
    }
    return best <= RAYON ? meilleure : null
  }, [drag, cibles, steps, plan.colMin])

  const onUp = () => {
    // Sous le seuil, le geste n'était pas un déplacement : c'était un clic, et
    // il vaut sélection. C'est ce qui permet de garder la carte entière
    // saisissable sans lui retirer son rôle de bouton d'inspection.
    if (drag && !drag.actif) onSelect(drag.stepId)
    else if (drag && cibleActive) onDeplacer(drag.stepId, cibleActive)
    setPan(null)
    setDrag(null)
  }

  const commencerDrag = (stepId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    hostRef.current?.setPointerCapture(e.pointerId)
    const p = versLePlan(e.clientX, e.clientY)
    setDrag({ stepId, x: p.x, y: p.y, depart: { x: e.clientX, y: e.clientY }, actif: false })
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  const traits = plan.liens.map((l) => {
    const a = parCle.get(l.de)
    const b = parCle.get(l.vers)
    if (!a || !b) return null
    const pa = ancrage(a)
    const pb = ancrage(b)
    return (
      <path
        key={l.key}
        d={chemin(pa.x, pa.bas, pb.x, pb.haut)}
        className="seq-lien"
        data-on={l.on}
        markerEnd="url(#seq-fleche)"
      />
    )
  })

  return (
    <div
      ref={hostRef}
      className={'seq-canvas' + (pan ? ' panning' : '') + (drag?.actif ? ' dragging' : '')}
      onPointerDown={onFondDown}
      onPointerMove={suivreLeCurseur}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="seq-plan"
        style={{
          width: plan.largeur,
          height: plan.hauteur,
          transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.zoom})`,
        }}
      >
        <svg className="seq-traits" width={plan.largeur} height={plan.hauteur}>
          <defs>
            <marker id="seq-fleche" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0 0 L6 3.5 L0 7 z" fill="currentColor" />
            </marker>
          </defs>
          {traits}
        </svg>

        {plan.noeuds.map((n) => (
          <Noeud
            key={n.key}
            noeud={n}
            colMin={plan.colMin}
            steps={steps}
            selectedId={selectedId}
            enCoursDeDrag={drag?.stepId ?? null}
            total={steps.length}
            carte={carte}
            onSelect={onSelect}
            onDelete={onDelete}
            onMove={onMove}
            onAjouter={onAjouter}
            onGrip={commencerDrag}
          />
        ))}

        {cibleActive && (
          <div
            className="seq-cible"
            style={{ left: cibleActive.x, top: cibleActive.y - 2, width: CARTE_L }}
          >
            <span>{cibleActive.branch ? ISSUE_LABEL[cibleActive.branch.on].titre : 'Tronc commun'}</span>
          </div>
        )}
      </div>

      {/* Ces commandes sont posées SUR le plan : sans arrêter l'événement, les
          viser ferait glisser la vue sous elles. */}
      <div className="seq-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" title="Dézoomer" onClick={() => zoomerAuCentre(1 / 1.15)}>
          <XI name="chevdown" className="ico-sm" />
        </button>
        <button type="button" className="val" onClick={ajuster} title="Tout voir">
          {Math.round(vue.zoom * 100)}%
        </button>
        <button type="button" title="Zoomer" onClick={() => zoomerAuCentre(1.15)}>
          <XI name="chevup" className="ico-sm" />
        </button>
      </div>

      {/* En HAUT à gauche : en bas, cette bande recouvrait la pastille de fin de
          séquence et le bouton d'ajout, tous deux centrés en pied de plan. */}
      <div className="seq-aide">
        <XI name="grip" className="ico-xs" />
        Tirez une carte pour la ranger · glissez le fond · ⌘+molette pour zoomer
      </div>
    </div>
  )
}

/** Une case du plan : entrée, étape, voie, reprise ou fin. */
function Noeud({
  noeud,
  colMin,
  steps,
  selectedId,
  enCoursDeDrag,
  total,
  carte,
  onSelect,
  onDelete,
  onMove,
  onAjouter,
  onGrip,
}: {
  noeud: NoeudCanvas
  colMin: number
  steps: SequenceStep[]
  selectedId: string | null
  enCoursDeDrag: string | null
  total: number
  carte: (args: { step: SequenceStep; index: number; orpheline: boolean }) => React.ReactNode
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onMove: (stepId: string, dir: -1 | 1) => void
  onAjouter: (branch: BrancheEtape | null) => void
  onGrip: (stepId: string, e: React.PointerEvent) => void
}) {
  const style: React.CSSProperties = {
    left: noeud.x,
    top: noeud.y,
    width: noeud.l,
    height: noeud.h,
  }

  if (noeud.type === 'entree') {
    return (
      <div className="seq-node seq-entree" style={style}>
        <XI name="bolt" className="ico-sm" />
        <span>
          Entrée
          <em>pipeline et stage réglés à gauche</em>
        </span>
      </div>
    )
  }

  if (noeud.type === 'fin') {
    return (
      <div className="seq-node seq-fin" style={style}>
        <XI name="flag" className="ico-sm" />
        Fin de séquence
      </div>
    )
  }

  if (noeud.type === 'reprise') {
    return (
      <div className="seq-node seq-reprise" style={style}>
        <XI name="branch" className="ico-xs" />
        les deux chemins se rejoignent
      </div>
    )
  }

  if (noeud.type === 'voie' && noeud.waitId) {
    const waitId = noeud.waitId
    const on = noeud.on ?? 'reply'
    const vide = (noeud.etapes ?? []).length === 0
    return (
      <div className="seq-node seq-voie" style={style} data-on={on}>
        <div className="hd">
          <XI name={on === 'reply' ? 'check' : 'clock'} className="ico-xs" />
          {ISSUE_LABEL[on].titre}
        </div>
        {vide && <div className="vide">{ISSUE_LABEL[on].aide}</div>}
        <button
          type="button"
          className="add"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAjouter({ waitId, on })
          }}
        >
          <XI name="plus" className="ico-xs" />
          Ajouter ici
        </button>
      </div>
    )
  }

  const step = steps[noeud.index ?? -1]
  if (!step) return null

  return (
    <div
      className="seq-node seq-carte"
      style={style}
      data-selected={selectedId === step.id}
      data-fantome={enCoursDeDrag === step.id || undefined}
      title="Cliquer pour régler · tirer pour ranger"
      // La carte ENTIÈRE se saisit : c'est le seuil de déplacement qui
      // départage le clic du glisser (cf. `commencerDrag`), pas une poignée de
      // quelques pixels qu'il faudrait viser.
      onPointerDown={(e) => onGrip(step.id, e)}
    >
      <span className="grip" aria-hidden>
        <XI name="grip" className="ico-sm" />
      </span>
      {/* Les outils, eux, arrêtent l'événement : sans ça, viser la corbeille
          commencerait un déplacement de la carte. */}
      <div className="outils" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          title="Monter l’étape"
          disabled={(noeud.index ?? 0) === 0}
          onClick={(e) => {
            e.stopPropagation()
            onMove(step.id, -1)
          }}
        >
          <XI name="chevup" className="ico-sm" />
        </button>
        <button
          type="button"
          title="Descendre l’étape"
          disabled={(noeud.index ?? 0) >= total - 1}
          onClick={(e) => {
            e.stopPropagation()
            onMove(step.id, 1)
          }}
        >
          <XI name="chevdown" className="ico-sm" />
        </button>
        <button
          type="button"
          title="Supprimer"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(step.id)
          }}
        >
          <XI name="trash" className="ico-sm" />
        </button>
      </div>
      {carte({ step, index: (noeud.index ?? 0) + 1, orpheline: !!noeud.orpheline })}
    </div>
  )
}
