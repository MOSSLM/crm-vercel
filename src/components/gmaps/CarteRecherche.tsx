"use client";

import * as React from "react";
import { geoConicConformal, geoPath } from "d3-geo";
import { fetchContours, orienterPourD3, projeter, type DeptGeometry } from "@/lib/carte/geo";
import { CONTOURS_URL } from "@/lib/carte/departements";
import {
  chargerCommunes,
  chargerContoursCommunes,
  memeCommune,
  placerEtiquettes,
  type Commune,
  type ContourCommune,
} from "@/lib/carte/communes";
import { CHOROPLETHE } from "@/components/carte/CarteFrance";
import type { Contour, Grille, PointRecherche } from "@/lib/gmaps/contract";
import {
  cadreAvecPoints,
  cadreGlobal,
  cadresDeGrille,
  compterHorsCadre,
  seuilsQuantile,
  type CadreTuile,
} from "@/lib/gmaps/grille";

/**
 * Carte d'une recherche EN COURS.
 *
 * Même grammaire visuelle que la carte du territoire — mêmes contours, même
 * projection conique conforme, mêmes taches floutées et mêmes pastilles — mais
 * cadrée sur la seule zone explorée, et augmentée de ce qu'elle seule peut
 * montrer : la grille de tuiles, et laquelle est en train d'être lue.
 *
 * Pourquoi la grille et pas seulement les points : une recherche qui ne ramène
 * rien pose deux questions très différentes — « il n'y a pas d'artisans ici »
 * ou « le robot n'y est pas encore allé ». Une tuile parcourue et vide (teinte
 * plate) ne se confond pas avec une tuile pas encore atteinte (hachures) ; sans
 * cette distinction, l'écran ne répond ni à l'une ni à l'autre.
 */

/** Marge autour du cadre exploré, en fraction de sa taille. */
const MARGE = 0.12;

export type CarteRechercheProps = {
  grille: Grille;
  /** Fiches par tuile : `null` = pas encore parcourue, `0` = parcourue et vide. */
  tuiles: Array<number | null>;
  /** Numéro de la dernière tuile ouverte (1-indexé). */
  tuileEnCours: number;
  points: PointRecherche[];
  /** Le crawl tourne-t-il encore : conditionne le halo pulsant. */
  enCours: boolean;
  mode: "taches" | "points";
  /** Remonte le nombre d'entreprises trop éloignées pour tenir dans le cadre. */
  onHorsCadre?: (n: number) => void;
  /**
   * Numéros des tuiles que cette passe compte visiter. Vide = toutes. Sert à
   * distinguer une tuile SAUTÉE (jamais prévue) d'une tuile pas encore
   * atteinte : les deux sont vierges, mais l'une ne se remplira jamais.
   */
  tuilesPrevues?: number[];
  /**
   * Contour de la commune (GeoJSON), quand le scraper a su le donner. C'est lui
   * qui répond à « où suis-je ? » : une grille de tuiles seule n'est qu'un
   * rectangle posé sur du blanc.
   */
  contour?: Contour | null;
  /**
   * Nom de la commune cherchée. Sert à la distinguer de ses voisines — même
   * silhouette, mais elle seule est le sujet de la recherche.
   */
  ville?: string | null;
};

export function CarteRecherche({
  grille,
  tuiles,
  tuileEnCours,
  points,
  enCours,
  mode,
  onHorsCadre,
  contour,
  ville,
  tuilesPrevues,
}: CarteRechercheProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ width: 720, height: 460 });
  const [geometries, setGeometries] = React.useState<DeptGeometry[]>([]);
  const [communes, setCommunes] = React.useState<Commune[]>([]);
  const [voisines, setVoisines] = React.useState<ContourCommune[]>([]);
  const [survol, setSurvol] = React.useState<{
    index: number;
    n: number | null;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.max(280, Math.round(width)),
        height: Math.max(220, Math.round(height)),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Le fond de carte est un CONFORT, pas une dépendance : s'il ne charge pas,
   * la grille et les points restent parfaitement lisibles. On avale donc
   * l'échec au lieu de peindre une erreur sur un crawl qui se déroule bien.
   */
  React.useEffect(() => {
    const controleur = new AbortController();
    fetchContours(CONTOURS_URL, controleur.signal)
      .then(setGeometries)
      .catch(() => {});
    return () => controleur.abort();
  }, []);

  /**
   * Le cadre englobe la grille ET les points : Google rend des fiches situées
   * hors de la tuile interrogée, et les cadrer dehors revenait à les perdre.
   * Il ne se resserre jamais — `cadreAvecPoints` ne fait qu'étendre — donc la
   * vue ne saute pas à chaque nouvelle entreprise trouvée à l'intérieur.
   */
  const cadre = React.useMemo(() => cadreAvecPoints(grille, points), [grille, points]);
  /** La grille seule, pour la vignette de situation. */
  const cadreGrille = React.useMemo(() => cadreGlobal(grille), [grille]);

  /**
   * Villes alentour, chargées UNE fois sur l'emprise de la grille — pas sur le
   * cadre courant, qui s'étend au fil des trouvailles et relancerait la requête
   * à chaque point. Une marge d'un tiers couvre cet étalement d'avance.
   */
  React.useEffect(() => {
    const controleur = new AbortController();
    const dLat = (cadreGrille.nord - cadreGrille.sud) / 3;
    const dLon = (cadreGrille.est - cadreGrille.ouest) / 3;
    chargerCommunes(
      {
        emprise: {
          sud: cadreGrille.sud - dLat,
          nord: cadreGrille.nord + dLat,
          ouest: cadreGrille.ouest - dLon,
          est: cadreGrille.est + dLon,
        },
        limite: 120,
      },
      controleur.signal,
    )
      .then(setCommunes)
      // Repères de confort : leur absence ne doit pas peindre une erreur sur un
      // crawl qui se déroule bien.
      .catch(() => {});

    const emprise = {
      sud: cadreGrille.sud - dLat,
      nord: cadreGrille.nord + dLat,
      ouest: cadreGrille.ouest - dLon,
      est: cadreGrille.est + dLon,
    };
    chargerContoursCommunes(emprise, 24, controleur.signal)
      .then(setVoisines)
      .catch(() => {});

    return () => controleur.abort();
  }, [cadreGrille.nord, cadreGrille.sud, cadreGrille.est, cadreGrille.ouest]);

  const horsCadre = React.useMemo(() => compterHorsCadre(cadre, points), [cadre, points]);
  React.useEffect(() => {
    onHorsCadre?.(horsCadre);
  }, [horsCadre, onHorsCadre]);

  /**
   * Même projection que la carte du territoire (Lambert conique conforme, la
   * projection officielle de l'IGN), simplement recadrée sur la zone explorée.
   * Garder la même famille garantit qu'une tuile carrée en degrés se déforme
   * ici exactement comme là-bas — d'où le rendu en polygones à quatre sommets
   * plutôt qu'en rectangles alignés sur les axes.
   */
  const { projection, path } = React.useMemo(() => {
    const dLat = (cadre.nord - cadre.sud) * MARGE;
    const dLon = (cadre.est - cadre.ouest) * MARGE;
    /**
     * Les quatre coins en `MultiPoint`, et surtout PAS en `Polygon` : mesuré,
     * `fitExtent` sur un polygone effondre la projection conique — échelle
     * 0,004 au lieu de 231 524, et les quatre coins de chaque tuile se
     * superposent en un seul point. Le flux GeoJSON d'un polygone passe par le
     * découpage sphérique, dont les bornes explosent sur une projection en
     * cône ; une liste de points s'y soustrait et rend le cadrage exact.
     */
    const zone = {
      type: "MultiPoint" as const,
      coordinates: [
        [cadre.ouest - dLon, cadre.sud - dLat],
        [cadre.est + dLon, cadre.sud - dLat],
        [cadre.est + dLon, cadre.nord + dLat],
        [cadre.ouest - dLon, cadre.nord + dLat],
      ],
    };
    const p = geoConicConformal()
      .parallels([44, 49])
      .rotate([-3, 0])
      /**
       * `precision(0)` coupe le ré-échantillonnage adaptatif de d3, qui insère
       * des points le long de chaque segment pour suivre la courbure du globe.
       * À l'échelle d'une ville c'est invisible — l'écart est très en dessous du
       * pixel — mais l'échelle de projection y est si grande que le tracé
       * explose : mesuré sur le contour de Limoges, 4,16 Mo de chemin SVG contre
       * 7,4 Ko sans. Baisser la valeur ne suffit pas (1, 0,5 et le défaut
       * donnent le même résultat) : il faut la couper.
       */
      .precision(0)
      .fitExtent(
        [
          [0, 0],
          [Math.max(1, size.width), Math.max(1, size.height)],
        ],
        zone,
      );
    return { projection: p, path: geoPath(p) };
  }, [cadre, size.width, size.height]);

  /**
   * On ne dessine que les départements qui touchent la zone : à l'échelle
   * d'une ville, les 96 autres seraient hors cadre, et leur tracé coûterait
   * plus cher que tout le reste de la carte réuni.
   */
  const contours = React.useMemo(() => {
    return geometries
      .filter(
        (g) =>
          g.bbox[0] <= cadre.est &&
          g.bbox[2] >= cadre.ouest &&
          g.bbox[1] <= cadre.nord &&
          g.bbox[3] >= cadre.sud,
      )
      .map((g) => ({ code: g.code, d: path(g.feature) ?? "" }));
  }, [geometries, path, cadre]);

  const cadres = React.useMemo(() => cadresDeGrille(grille), [grille]);

  /** Silhouette de la commune, projetée. */
  const traceContour = React.useMemo(() => {
    if (!contour) return null;
    // Le schéma partagé garde `coordinates` volontairement lâche — mieux vaut
    // un anneau ignoré qu'un suivi entier tombé en 502 pour une géométrie mal
    // formée. `geoPath` sait déjà ne rien tracer de ce qu'il ne comprend pas.
    try {
      // Réorienté d'abord : d3-geo lit l'enroulement comme désignant l'intérieur,
      // et sa convention est l'inverse de celle d'OpenStreetMap.
      const oriente = orienterPourD3(contour);
      return oriente ? path(oriente as unknown as GeoJSON.Geometry) || null : null;
    } catch {
      return null;
    }
  }, [contour, path]);

  /**
   * Silhouettes des communes voisines. La ville cherchée en est retirée : elle a
   * son propre tracé, plus marqué, et la superposer donnerait un bord deux fois
   * plus épais que les autres.
   */
  const tracesVoisines = React.useMemo(() => {
    return voisines
      .filter((c) => !memeCommune(c.nom, ville))
      .map((c) => {
        const oriente = orienterPourD3(c.contour);
        if (!oriente) return null;
        try {
          const d = path(oriente as unknown as GeoJSON.Geometry);
          return d ? { code: c.code, d } : null;
        } catch {
          return null;
        }
      })
      .filter((c): c is { code: string; d: string } => c !== null);
  }, [voisines, ville, path]);

  const etiquettes = React.useMemo(() => {
    const projetees = communes
      .map((c) => {
        const p = projection([c.lon, c.lat]);
        return p ? { ...c, x: p[0], y: p[1] } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return placerEtiquettes(projetees, { largeur: size.width, hauteur: size.height }, 10, 14);
  }, [communes, projection, size.width, size.height]);

  const seuils = React.useMemo(
    () => seuilsQuantile(tuiles.filter((n): n is number => typeof n === "number"), CHOROPLETHE.length),
    [tuiles],
  );

  const polygone = React.useCallback(
    (t: CadreTuile) =>
      [
        projection([t.ouest, t.nord]),
        projection([t.est, t.nord]),
        projection([t.est, t.sud]),
        projection([t.ouest, t.sud]),
      ]
        .filter((p): p is [number, number] => !!p)
        .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
        .join(" "),
    [projection],
  );

  const teinte = React.useCallback(
    (n: number) => {
      if (n <= 0) return undefined;
      let i = 0;
      while (i < seuils.length && n >= seuils[i]) i++;
      return CHOROPLETHE[Math.min(i, CHOROPLETHE.length - 1)];
    },
    [seuils],
  );

  const positions = React.useMemo(() => {
    const out: Array<{ x: number; y: number; nouveau: boolean; cle: string }> = [];
    points.forEach((p, i) => {
      const proj = projection([p.lng, p.lat]);
      if (!proj) return;
      out.push({ x: proj[0], y: proj[1], nouveau: p.nouveau, cle: `${p.lat},${p.lng},${i}` });
    });
    return out;
  }, [points, projection]);

  /** Contre-échelle des pastilles : une petite zone mérite de plus gros points. */
  const unite = Math.max(0.7, Math.min(size.width, size.height) / 620);

  /** Tuiles qu'une passe rapide ne visitera pas. Vide = exploration complète. */
  const prevues = React.useMemo(
    () => (tuilesPrevues && tuilesPrevues.length ? new Set(tuilesPrevues) : null),
    [tuilesPrevues],
  );

  const grilleLayer = React.useMemo(
    () => (
      <g className="rlive-grille">
        {cadres.map((t) => {
          const n = tuiles[t.index - 1] ?? null;
          const etat =
            t.index === tuileEnCours && enCours
              ? "encours"
              : n !== null
                ? n === 0
                  ? "vide"
                  : "trouve"
                : prevues && !prevues.has(t.index)
                  ? "sautee"
                  : "attente";
          return (
            <polygon
              key={t.index}
              className="rlive-tuile"
              data-etat={etat}
              points={polygone(t)}
              style={n && n > 0 ? { fill: teinte(n) } : undefined}
              data-prevue={prevues && !prevues.has(t.index) ? "false" : undefined}
              onMouseEnter={(e) => {
                const rect = stageRef.current?.getBoundingClientRect();
                if (!rect) return;
                setSurvol({
                  index: t.index,
                  n,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
            />
          );
        })}
      </g>
    ),
    [cadres, tuiles, tuileEnCours, enCours, polygone, teinte, prevues],
  );

  return (
    <div className="carte-stage rlive-stage" ref={stageRef} onMouseLeave={() => setSurvol(null)}>
      <svg
        className="carte-svg rlive-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={
          {
            "--carte-dot-r": `${(2.6 * unite).toFixed(2)}px`,
            "--carte-blob-r": `${Math.max(9, 15 * unite).toFixed(2)}px`,
          } as React.CSSProperties
        }
        role="img"
        aria-label={`Zone explorée : ${grille.total} tuiles, ${points.length} entreprises trouvées`}
      >
        <defs>
          <filter id="rlive-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={Math.max(5, 9 * unite)} />
          </filter>
          {/*
            Trame des tuiles non explorées. Une hachure, et non un aplat pâle :
            le pâle se lirait comme « exploré, presque rien trouvé », alors que
            la question posée à cet écran est justement « le robot est-il déjà
            passé ici ? ».
          */}
          <pattern
            id="rlive-trame"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            {/* Pas de rectangle de fond : un aplat opaque masquerait la
                silhouette de la commune, qui est précisément ce qui dit où
                l'on se trouve. Seules les hachures marquent « pas encore vu ». */}
            <line x1="0" y1="0" x2="0" y2="6" className="rlive-trame-trait" />
          </pattern>
        </defs>

        {/*
          Volontairement PAS la classe `carte-geo` : elle porte
          `filter: url(#carte-lift)`, un filtre défini dans le <defs> de l'autre
          carte. Une référence de filtre introuvable n'est pas ignorée par SVG —
          l'élément entier cesse d'être rendu. On reprend les pastilles et les
          contours de la carte du territoire, pas ses filtres.
        */}
        <g className="rlive-geo">
          {contours.map(({ code, d }) => (
            <path key={code} className="carte-dep" d={d} />
          ))}
        </g>

        {/*
          La commune SOUS la grille : c'est le fond sur lequel les tuiles se
          lisent, pas un ornement posé par-dessus. Sans elle, l'écran montrait
          un rectangle de tuiles flottant sur du blanc, sans rien qui dise où
          l'on se trouve.
        */}
        {/*
          Les communes voisines d'abord, en retrait : elles donnent le tissu
          alentour sans disputer la vedette à la ville cherchée.
        */}
        <g className="rlive-voisines">
          {tracesVoisines.map((c) => (
            <path key={c.code} className="rlive-voisine" d={c.d} />
          ))}
        </g>

        {traceContour && <path className="rlive-commune" d={traceContour} />}

        {grilleLayer}

        <g className="carte-lines">
          {contours.map(({ code, d }) => (
            <path key={code} className="carte-dline" d={d} />
          ))}
        </g>

        {/* Le TRAIT de la commune repasse par-dessus la grille : mesuré, les
            tuiles recouvraient la silhouette et n'en laissaient voir que les
            bords. Le remplissage, lui, reste dessous. */}
        {traceContour && <path className="rlive-commune-trait" d={traceContour} />}

        {mode === "taches" && (
          <g className="rlive-blobs">
            {positions.map((p) => (
              <circle
                key={p.cle}
                className="carte-blob"
                cx={p.x}
                cy={p.y}
                fill={p.nouveau ? COULEUR_NOUVEAU : COULEUR_CONNU}
              />
            ))}
          </g>
        )}

        <g className="carte-dots">
          {positions.map((p) => (
            <circle
              key={p.cle}
              className="carte-dot rlive-dot"
              cx={p.x}
              cy={p.y}
              fill={p.nouveau ? COULEUR_NOUVEAU : COULEUR_CONNU}
            />
          ))}
        </g>

        {/*
          Les noms de villes passent EN DERNIER : posés plus tôt, les taches
          floutées des entreprises les laveraient. Le liseré (paint-order) les
          détache du fond sans avoir à leur poser un cartouche.
        */}
        <g className="rlive-villes">
          {etiquettes.map((c) => {
            // La ville cherchée porte le nom de la silhouette principale : elle
            // s'écrit plus gros, sinon rien ne dit ce que ce contour représente.
            const cible = memeCommune(c.nom, ville);
            return (
              <g key={c.code} data-cible={cible ? "true" : undefined}>
                <circle className="rlive-ville-pt" cx={c.x} cy={c.y} r={cible ? 2.8 : 1.9} />
                <text
                  className="rlive-ville-nom"
                  x={c.x + (cible ? 7 : 5)}
                  y={c.y + (cible ? 4.6 : 3.4)}
                >
                  {c.nom}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {geometries.length > 0 && (
        <Localisateur
          geometries={geometries}
          centre={[
            (cadreGrille.ouest + cadreGrille.est) / 2,
            (cadreGrille.nord + cadreGrille.sud) / 2,
          ]}
        />
      )}

      {survol && (
        <div
          className="carte-tt rlive-tt"
          style={{
            transform: `translate(${Math.max(8, Math.min(survol.x + 14, size.width - 190))}px, ${Math.max(8, Math.min(survol.y + 12, size.height - 74))}px)`,
          }}
        >
          <div className="tt-t">
            <b>Tuile {survol.index}</b>
            <span className="tt-code">
              {survol.index} / {grille.total}
            </span>
          </div>
          <div className="tt-s">
            {survol.n === null
              ? prevues && !prevues.has(survol.index)
                ? "sautée par la passe rapide"
                : "pas encore explorée"
              : survol.n === 0
                ? "explorée · aucune entreprise"
                : `explorée · ${survol.n} entreprise${survol.n > 1 ? "s" : ""}`}
          </div>
        </div>
      )}
    </div>
  );
}

/** Vert « nouvelle ligne » et bleu « déjà connue » — mêmes teintes que les statuts de la carte. */
const COULEUR_NOUVEAU = "#1F8A5B";
const COULEUR_CONNU = "#2F7AE0";

/**
 * Vignette de situation : où, en France, se déroule cette recherche.
 *
 * À l'échelle d'une ville, le fond de carte ne montre plus aucun repère
 * reconnaissable — un bout de frontière départementale ne dit pas si l'on est
 * en Bretagne ou dans le Limousin. Cette vignette répond à la question en un
 * coup d'œil, pour le prix d'un tracé simplifié déjà chargé.
 */
function Localisateur({
  geometries,
  centre,
}: {
  geometries: DeptGeometry[];
  centre: [number, number];
}) {
  const L = 116;
  const H = 116;
  const { projection, path } = React.useMemo(
    () => projeter(geometries, L, H, 6),
    [geometries],
  );
  const contour = React.useMemo(
    () => geometries.map((g) => path(g.feature) ?? "").join(" "),
    [geometries, path],
  );
  const p = projection(centre);
  return (
    <svg className="rlive-loc" viewBox={`0 0 ${L} ${H}`} aria-hidden="true">
      <path className="rlive-loc-fr" d={contour} />
      {p && <circle className="rlive-loc-pt" cx={p[0]} cy={p[1]} r={3.4} />}
    </svg>
  );
}

export default CarteRecherche;
