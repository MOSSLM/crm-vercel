"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { projeter, type DeptGeometry } from "@/lib/carte/geo";
import { chargerCommunes, placerEtiquettes, type Commune } from "@/lib/carte/communes";
import { STATUT_BY_ID } from "@/lib/carte/statuts";
import type { DeptCarte, FicheCarte } from "./useCarteData";

export type ModeCarte = "taches" | "points" | "aplat";

/** Rampe séquentielle bleue — même famille que l'accent du CRM. */
export const CHOROPLETHE = ["#F3F8FE", "#DEEAF8", "#C0D8F1", "#95BDE9", "#5D99DD", "#2A6FCB"];

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

type Transform = { k: number; x: number; y: number };
const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

/**
 * Empêche la carte de sortir du cadre : à k = 1 elle est recalée pile dessus,
 * au-delà elle peut glisser mais jamais découvrir le fond.
 */
function clamp(t: Transform, width: number, height: number): Transform {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, t.k));
  return {
    k,
    x: Math.min(0, Math.max(width - width * k, t.x)),
    y: Math.min(0, Math.max(height - height * k, t.y)),
  };
}

/**
 * Seuils par quantile : chaque teinte de l'aplat porte à peu près le même
 * nombre de départements, sinon Paris et le Rhône écrasent toute l'échelle.
 */
function seuilsQuantile(valeurs: number[], classes: number): number[] {
  const tries = valeurs.filter((n) => n > 0).sort((a, b) => a - b);
  if (tries.length === 0) return [];
  const seuils: number[] = [];
  for (let i = 1; i < classes; i++) {
    seuils.push(tries[Math.floor((i / classes) * tries.length)] ?? tries[tries.length - 1]);
  }
  return seuils;
}

/** `undefined` sur un département vide : il garde le fond du thème en cours. */
const teinte = (n: number, seuils: number[]): string | undefined => {
  if (n <= 0) return undefined;
  let i = 0;
  while (i < seuils.length && n >= seuils[i]) i++;
  return CHOROPLETHE[Math.min(i, CHOROPLETHE.length - 1)];
};

export type CarteFranceProps = {
  departements: DeptCarte[];
  geometries: DeptGeometry[];
  /** Toutes les fiches, filtres appliqués. */
  fiches: FicheCarte[];
  mode: ModeCarte;
  selection: string | null;
  onSelect: (code: string | null) => void;
  ficheActive: number | null;
  onFicheActive: (id: number | null) => void;
};

export function CarteFrance({
  departements,
  geometries,
  fiches,
  mode,
  selection,
  onSelect,
  ficheActive,
  onFicheActive,
}: CarteFranceProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ width: 900, height: 880 });
  const [transform, setTransform] = React.useState<Transform>(IDENTITY);
  const [anime, setAnime] = React.useState(false);
  const [survol, setSurvol] = React.useState<{ code: string; x: number; y: number } | null>(null);
  const [communes, setCommunes] = React.useState<Commune[]>([]);

  /**
   * Repères de villes, chargés UNE fois : les 600 communes les plus peuplées de
   * France. Pas de rechargement au zoom — ce serait une requête par coup de
   * molette, et à l'échelle nationale ce sont bien les grandes villes qu'on
   * cherche à reconnaître. Ce sont ensuite les recouvrements qui décident
   * lesquelles s'écrivent : en zoomant, les voisines cessent de se gêner et
   * apparaissent d'elles-mêmes.
   */
  React.useEffect(() => {
    const controleur = new AbortController();
    chargerCommunes({ limite: 400 }, controleur.signal)
      .then(setCommunes)
      // Confort : leur absence ne doit pas empêcher la carte de s'afficher.
      .catch(() => {});
    return () => controleur.abort();
  }, []);

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(360, Math.round(width)), height: Math.max(320, Math.round(height)) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { projection, path } = React.useMemo(
    () => projeter(geometries, size.width, size.height),
    [geometries, size.width, size.height],
  );

  const contours = React.useMemo(
    () => geometries.map((g) => ({ code: g.code, d: path(g.feature) ?? "" })),
    [geometries, path],
  );

  /** Projeté une fois pour toutes les fiches : filtrer n'a pas à reprojeter. */
  const positions = React.useMemo(() => {
    const map = new Map<number, [number, number]>();
    for (const fiche of fiches) {
      if (fiche.lat == null || fiche.lng == null) continue;
      const p = projection([fiche.lng, fiche.lat]);
      if (p) map.set(fiche.id, [p[0], p[1]]);
    }
    return map;
  }, [fiches, projection]);

  const bounds = React.useMemo(() => {
    const map = new Map<string, [[number, number], [number, number]]>();
    for (const g of geometries) map.set(g.code, path.bounds(g.feature));
    return map;
  }, [geometries, path]);

  /**
   * Le compte réel par département, tel que la base l'a calculé.
   *
   * Il était dérivé des points affichés. Ça ne tient plus : à l'échelle
   * nationale un point est une CELLULE de densité qui vaut plusieurs fiches, et
   * un département ouvert affiche ses fiches réelles. Compter les points
   * mélangerait les deux échelles et l'aplat mentirait.
   */
  const compteParDept = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const dept of departements) counts.set(dept.code, dept.total);
    return counts;
  }, [departements]);

  const seuils = React.useMemo(
    () => seuilsQuantile([...compteParDept.values()], CHOROPLETHE.length),
    [compteParDept],
  );

  const appliquer = React.useCallback(
    (next: Transform, avecAnimation: boolean) => {
      setAnime(avecAnimation);
      setTransform(clamp(next, size.width, size.height));
    },
    [size.width, size.height],
  );

  const cadrer = React.useCallback(
    (code: string | null) => {
      const b = code ? bounds.get(code) : null;
      if (!b) {
        appliquer(IDENTITY, true);
        return;
      }
      const [[x0, y0], [x1, y1]] = b;
      const k = Math.min(8, 0.85 * Math.min(size.width / (x1 - x0), size.height / (y1 - y0)));
      appliquer(
        { k, x: size.width / 2 - (k * (x0 + x1)) / 2, y: size.height / 2 - (k * (y0 + y1)) / 2 },
        true,
      );
    },
    [bounds, size.width, size.height, appliquer],
  );

  // Recadre quand la sélection change (y compris depuis le panneau latéral) et
  // quand la scène est redimensionnée — la projection ayant bougé, le zoom
  // courant ne pointerait plus sur le bon endroit.
  const dernierCadrage = React.useRef<string | null>(null);
  React.useEffect(() => {
    const cle = `${selection ?? "FR"}@${size.width}x${size.height}`;
    if (dernierCadrage.current === cle) return;
    const premier = dernierCadrage.current === null;
    dernierCadrage.current = cle;
    if (premier && selection === null) return;
    cadrer(selection);
  }, [selection, size.width, size.height, cadrer]);

  const zoomer = React.useCallback(
    (facteur: number, centre?: { x: number; y: number }) => {
      const cx = centre?.x ?? size.width / 2;
      const cy = centre?.y ?? size.height / 2;
      setTransform((prev) => {
        const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.k * facteur));
        const ratio = k / prev.k;
        return clamp(
          { k, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio },
          size.width,
          size.height,
        );
      });
    },
    [size.width, size.height],
  );

  /** Coordonnées d'un évènement dans le repère du viewBox. */
  const enCoordsCarte = React.useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * size.width,
        y: ((e.clientY - rect.top) / rect.height) * size.height,
      };
    },
    [size.width, size.height],
  );

  // `wheel` est passif par défaut sur un handler React : on l'attache à la main
  // pour pouvoir annuler le défilement de la page pendant le zoom.
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setAnime(false);
      zoomer(Math.pow(2, -e.deltaY * 0.002), enCoordsCarte(e));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomer, enCoordsCarte]);

  /** Rayon de capture d'un clic, en pixels écran, converti en unités carte. */
  const RAYON_CLIC = 11;

  const ficheLaPlusProche = React.useCallback(
    (point: { x: number; y: number }, code: string) => {
      // Le groupe est zoomé : on repasse le point du repère écran au repère carte.
      const px = (point.x - transform.x) / transform.k;
      const py = (point.y - transform.y) / transform.k;
      const seuil = (RAYON_CLIC / transform.k) ** 2;
      let meilleure: number | null = null;
      let distance = seuil;
      for (const fiche of fiches) {
        if (fiche.dept !== code) continue;
        // Une cellule de densité (id négatif) ne désigne aucune entreprise :
        // seules les fiches réelles du département ouvert sont cliquables.
        if (fiche.id < 0) continue;
        const p = positions.get(fiche.id);
        if (!p) continue;
        const d2 = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d2 <= distance) {
          distance = d2;
          meilleure = fiche.id;
        }
      }
      return meilleure;
    },
    [fiches, positions, transform.k, transform.x, transform.y],
  );

  const drag = React.useRef<{
    id: number;
    x: number;
    y: number;
    bouge: boolean;
    /**
     * Capturé au `pointerdown` : dès qu'on appelle `setPointerCapture`, les
     * évènements suivants sont re-ciblés sur le <svg>, et `e.target` au
     * relâchement ne dit plus sur quel département on a cliqué.
     */
    cible: EventTarget | null;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, bouge: false, cible: e.target };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - d.x) / rect.width) * size.width;
    const dy = ((e.clientY - d.y) / rect.height) * size.height;
    if (!d.bouge && Math.hypot(dx, dy) < 3) return;
    d.bouge = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setAnime(false);
    setSurvol(null);
    setTransform((prev) => clamp({ ...prev, x: prev.x + dx, y: prev.y + dy }, size.width, size.height));
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d || d.bouge || !(d.cible instanceof Element)) return;

    const dept = d.cible.closest<SVGElement>("[data-dept]")?.dataset.dept ?? null;

    // Dans le département ouvert, un clic près d'une pastille ouvre l'entreprise.
    // Viser la pastille elle-même serait intenable — 2 px de rayon — donc c'est
    // le département qui reçoit le clic et on cherche la plus proche.
    if (dept && dept === selection) {
      const proche = ficheLaPlusProche(enCoordsCarte(e), dept);
      if (proche !== null) {
        onFicheActive(ficheActive === proche ? null : proche);
        return;
      }
    }
    onSelect(dept && dept === selection ? null : dept);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag.current?.bouge) return;
    const code = (e.target as Element).closest<SVGElement>("[data-dept]")?.dataset.dept;
    if (!code) {
      setSurvol(null);
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSurvol({ code, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  /**
   * Tout ce qui est coûteux à rendre vit dans ce memo : il ne dépend pas du
   * zoom, donc une molette ne re-rend que l'attribut `transform` du groupe.
   */
  const calques = React.useMemo(() => {
    const taches = mode === "taches";
    const points = mode !== "aplat";
    const aplat = mode === "aplat";

    const pastille = (fiche: FicheCarte, classe: string) => {
      const p = positions.get(fiche.id);
      if (!p) return null;
      // Une cellule vaut plusieurs fiches : son rayon suit la racine carrée de
      // son poids, pour que la SURFACE reste proportionnelle au nombre — c'est
      // la surface que l'œil lit, pas le rayon. Le CSS garde la main sur la
      // taille de base des vraies fiches.
      const poids = fiche.poids || 1;
      const r = poids > 1 ? Math.min(9, 1.6 * Math.sqrt(poids)) : undefined;
      return (
        <circle
          key={fiche.id}
          className={classe}
          cx={p[0]}
          cy={p[1]}
          r={r}
          fill={STATUT_BY_ID[fiche.statut].color}
          data-dim={selection !== null && fiche.dept !== selection ? "true" : undefined}
          data-on={fiche.id === ficheActive ? "true" : undefined}
        />
      );
    };

    return (
      <>
        <g className="carte-geo">
          {contours.map(({ code, d }) => (
            <path
              key={code}
              className="carte-dep"
              d={d}
              data-dept={code}
              data-state={code === selection ? "on" : selection ? "dim" : undefined}
              // En style inline, pas en attribut `fill` : la feuille de style
              // pose déjà un `fill` sur `.carte-dep`, qui l'emporterait.
              style={aplat ? { fill: teinte(compteParDept.get(code) ?? 0, seuils) } : undefined}
            />
          ))}
        </g>

        {taches && (
          <g className="carte-blobs">{fiches.map((f) => pastille(f, "carte-blob"))}</g>
        )}

        <g className="carte-lines">
          {contours.map(({ code, d }) => (
            <path
              key={code}
              className="carte-dline"
              d={d}
              data-state={code === selection ? "on" : undefined}
            />
          ))}
        </g>

        {points && <g className="carte-dots">{fiches.map((f) => pastille(f, "carte-dot"))}</g>}
      </>
    );
  }, [contours, fiches, positions, mode, selection, ficheActive, compteParDept, seuils]);

  /**
   * Noms de villes, calculés DANS LE REPÈRE ÉCRAN et rendus hors du groupe
   * zoomé : à l'intérieur, le texte grossirait avec le zoom jusqu'à devenir
   * illisible à k = 12. On applique donc la transformation à la main, ce qui a
   * l'avantage de faire réapparaître les villes à mesure qu'elles s'écartent.
   */
  const etiquettes = React.useMemo(() => {
    const projetees = communes
      .map((c) => {
        const p = projection([c.lon, c.lat]);
        if (!p) return null;
        return {
          ...c,
          x: p[0] * transform.k + transform.x,
          y: p[1] * transform.k + transform.y,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return placerEtiquettes(projetees, { largeur: size.width, hauteur: size.height }, 10.5, 26);
  }, [communes, projection, transform.k, transform.x, transform.y, size.width, size.height]);

  const deptSurvole = survol ? departements.find((d) => d.code === survol.code) : null;
  const unite = Math.max(0.62, Math.min(size.width, size.height) / 880);

  return (
    <div className="carte-stage" ref={stageRef}>
      <svg
        className="carte-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={
          {
            "--carte-dot-r": `${(2.2 * unite).toFixed(2)}px`,
            "--carte-blob-r": `${Math.max(5.5, 11 * unite).toFixed(2)}px`,
            "--carte-dot-scale": Math.pow(transform.k, 0.55).toFixed(3),
            "--carte-blob-scale": Math.pow(transform.k, 0.35).toFixed(3),
          } as React.CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setSurvol(null)}
        role="img"
        aria-label="Carte des entreprises par département"
      >
        <defs>
          <filter id="carte-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={Math.max(4, 8 * unite)} />
          </filter>
          <filter id="carte-lift" x="-12%" y="-12%" width="124%" height="124%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0A1B33" floodOpacity="0.13" />
          </filter>
        </defs>
        <g
          className="carte-zoom"
          data-anime={anime ? "true" : undefined}
          transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
        >
          {calques}
        </g>

        {/*
          Hors du groupe zoomé, et en dernier : le texte garde sa taille quel
          que soit le zoom, et rien ne vient le laver — ni les taches floutées,
          ni les aplats de densité.
        */}
        <g className="carte-villes">
          {etiquettes.map((c) => (
            <g key={c.code}>
              <circle className="carte-ville-pt" cx={c.x} cy={c.y} r={2} />
              <text className="carte-ville-nom" x={c.x + 5.5} y={c.y + 3.6}>
                {c.nom}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {deptSurvole && survol && (
        <TooltipDept
          dept={deptSurvole}
          fiches={fiches}
          x={survol.x}
          y={survol.y}
          stage={size}
        />
      )}

      <div className="carte-zoomc">
        <button type="button" title="Zoomer" onClick={() => { setAnime(true); zoomer(1.6); }}>
          <Plus className="ico-sm" />
        </button>
        <button type="button" title="Dézoomer" onClick={() => { setAnime(true); zoomer(1 / 1.6); }}>
          <Minus className="ico-sm" />
        </button>
        <button
          type="button"
          className="rz"
          title="Revenir sur la France entière"
          onClick={() => onSelect(null)}
        >
          FR
        </button>
      </div>
    </div>
  );
}

function TooltipDept({
  dept,
  fiches,
  x,
  y,
  stage,
}: {
  dept: DeptCarte;
  fiches: FicheCarte[];
  x: number;
  y: number;
  stage: { width: number; height: number };
}) {
  const repartition = React.useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const fiche of fiches) {
      if (fiche.dept !== dept.code) continue;
      total++;
      counts.set(fiche.statut, (counts.get(fiche.statut) ?? 0) + 1);
    }
    return { counts, total };
  }, [fiches, dept.code]);

  const left = Math.max(8, Math.min(x + 16, stage.width - 220));
  const top = Math.max(8, Math.min(y + 14, stage.height - 130));

  return (
    <div className="carte-tt" style={{ transform: `translate(${left}px, ${top}px)` }}>
      <div className="tt-t">
        <b>{dept.nom}</b>
        <span className="tt-code">{dept.code}</span>
      </div>
      <div className="tt-s">
        {dept.region} · {repartition.total} fiche{repartition.total > 1 ? "s" : ""}
      </div>
      <div className="tt-bars">
        {[...repartition.counts.entries()].map(([statut, n]) => (
          <i
            key={statut}
            style={{ flex: n, background: STATUT_BY_ID[statut as keyof typeof STATUT_BY_ID].color }}
          />
        ))}
      </div>
      <div className="tt-l">
        {[...repartition.counts.entries()].map(([statut, n]) => (
          <span key={statut}>
            <i style={{ background: STATUT_BY_ID[statut as keyof typeof STATUT_BY_ID].color }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
