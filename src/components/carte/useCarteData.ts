"use client";

import * as React from "react";
import { authedFetch } from "@/utils/authedFetch";
import logger from "@/utils/logger";
import {
  CONTOURS_URL,
  DEPARTEMENT_BY_CODE,
  type Departement,
} from "@/lib/carte/departements";
import { fetchContours, type DeptGeometry } from "@/lib/carte/geo";
import { STATUTS, type StatutCarte } from "@/lib/carte/statuts";

/** Statuts connus, pour valider ce que renvoie la base avant de l'afficher. */
const STATUTS_CONNUS = new Set<string>(STATUTS.map((s) => s.id));

export type FicheCarte = {
  id: number;
  nom: string;
  ville: string | null;
  codePostal: string | null;
  telephone: string | null;
  siteWeb: string | null;
  tags: string[];
  lat: number | null;
  lng: number | null;
  statut: StatutCarte;
  /** `null` = fiche non rattachable à un département métropolitain. */
  dept: string | null;
  /**
   * Nombre de fiches que ce point représente.
   *
   * 1 pour une vraie fiche. Au-delà, c'est une CELLULE de la grille de densité
   * (un dixième de degré, ~11 km) : à l'échelle nationale la carte dessine des
   * cellules, pas des fiches. Les 60 687 fiches individuelles pèsent 21 Mo de
   * JSON, très au-dessus des 4,5 Mo qu'une fonction serverless Vercel peut
   * renvoyer — l'agrégat en fait 509 ko.
   *
   * `id` est négatif sur une cellule : elle n'est ni cliquable ni ouvrable.
   */
  poids: number;
  /** Coordonnées projetées, posées par la carte une fois la taille connue. */
  x?: number;
  y?: number;
};

export type DeptCarte = Departement & {
  geometry: DeptGeometry;
  /** Cellules de densité, ou vraies fiches une fois le département ouvert. */
  fiches: FicheCarte[];
  /** Nombre réel de fiches du département, indépendant de ce qui est chargé. */
  total: number;
};

export type CarteData = {
  fiches: FicheCarte[];
  departements: DeptCarte[];
  deptByCode: Map<string, DeptCarte>;
  geometries: DeptGeometry[];
  /** Fiches sans rattachement : outre-mer, étranger, ou géocodage manquant. */
  horsCarte: FicheCarte[];
};

/** Une fiche telle que la renvoie `/api/entreprises/carte?dept=…`. */
type FicheApi = {
  id: number;
  nom: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  site_web: string | null;
  tags: unknown;
  lat: number | null;
  lng: number | null;
  dept: string | null;
  statut: string | null;
};

/** Une cellule de la grille de densité, telle que la renvoie l'agrégat. */
type CelluleApi = {
  lat: number;
  lng: number;
  dept: string | null;
  statut: string | null;
  n: number;
};

type AgregatApi = {
  total?: number;
  hors_carte?: number;
  departements?: Array<{ dept: string; statut: string; n: number }>;
  densite?: CelluleApi[];
};

/** `service_tags` est un jsonb qui a porté plusieurs formes au fil du temps. */
function readTags(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  const out: string[] = [];
  for (const tag of valeur) {
    if (typeof tag === "string" && tag.trim()) out.push(tag.trim());
  }
  return out;
}

/**
 * Le statut vient de la base ; on le valide quand même avant de s'en servir
 * pour indexer la table des couleurs — une valeur inattendue ferait planter le
 * rendu plutôt que d'afficher une pastille neutre.
 */
function lireStatut(valeur: string | null): StatutCarte {
  return valeur && STATUTS_CONNUS.has(valeur) ? (valeur as StatutCarte) : "prospect";
}

/** Convertit une fiche de l'API en point de carte (poids 1, cliquable). */
export function versFiche(row: FicheApi): FicheCarte {
  return {
    id: row.id,
    nom: row.nom?.trim() || `Fiche #${row.id}`,
    ville: row.ville,
    codePostal: row.code_postal,
    telephone: row.telephone,
    siteWeb: row.site_web,
    tags: readTags(row.tags),
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    dept: row.dept,
    statut: lireStatut(row.statut),
    poids: 1,
  };
}

/**
 * Une cellule de densité, présentée comme un point de carte pondéré.
 *
 * L'identifiant est négatif : c'est ce qui distingue une cellule d'une fiche
 * partout ailleurs (survol, clic, ouverture de fiche). Il est dérivé de l'index
 * plutôt que des coordonnées pour rester stable d'un rendu à l'autre.
 */
function versCellule(cellule: CelluleApi, index: number): FicheCarte {
  const n = Math.max(1, Math.round(cellule.n));
  return {
    id: -(index + 1),
    nom: `${n} entreprise${n > 1 ? "s" : ""}`,
    ville: null,
    codePostal: null,
    telephone: null,
    siteWeb: null,
    tags: [],
    lat: cellule.lat,
    lng: cellule.lng,
    dept: cellule.dept,
    statut: lireStatut(cellule.statut),
    poids: n,
  };
}

/** `true` si ce point est une cellule de densité et non une vraie fiche. */
export const estCellule = (fiche: FicheCarte): boolean => fiche.id < 0;

/**
 * Le territoire, en UNE requête et en agrégat.
 *
 * Cette fonction paginait `entreprises` par tranches de 1 000 (61 requêtes
 * séquentielles), plus `opportunites` et `etapes_pipeline`, puis recomposait le
 * statut de chaque fiche en JS et résolvait son département par
 * `resolveDepartement` — un test point-dans-polygone exécuté 60 000 fois sur le
 * thread principal, qui figeait l'onglet.
 *
 * Statut et département sont maintenant calculés en base
 * (cf. sql/20260820_perf_60k_entreprises.sql), et la carte reçoit des cellules
 * de densité (509 ko) plutôt que 60 687 fiches (21 Mo). Les fiches réelles d'un
 * département se chargent au clic, via `chargerDepartement`.
 */
async function loadCarte(signal: AbortSignal): Promise<CarteData> {
  const [geometries, reponse] = await Promise.all([
    fetchContours(CONTOURS_URL, signal),
    authedFetch("/api/entreprises/carte", { signal }),
  ]);

  if (!reponse.ok) throw new Error(`carte_${reponse.status}`);
  const agregat = (await reponse.json()) as AgregatApi;

  const fiches: FicheCarte[] = (agregat.densite ?? []).map(versCellule);

  const comptes = new Map<string, number>();
  for (const ligne of agregat.departements ?? []) {
    comptes.set(ligne.dept, (comptes.get(ligne.dept) ?? 0) + ligne.n);
  }

  const departements: DeptCarte[] = geometries
    .map((geometry) => {
      const meta = DEPARTEMENT_BY_CODE[geometry.code];
      if (!meta) return null;
      return {
        ...meta,
        geometry,
        fiches: [] as FicheCarte[],
        total: comptes.get(geometry.code) ?? 0,
      };
    })
    .filter((d): d is DeptCarte => d !== null);

  const deptByCode = new Map(departements.map((d) => [d.code, d]));
  const horsCarte: FicheCarte[] = [];
  for (const fiche of fiches) {
    const dept = fiche.dept ? deptByCode.get(fiche.dept) : undefined;
    if (dept) dept.fiches.push(fiche);
    else horsCarte.push(fiche);
  }

  return { fiches, departements, deptByCode, geometries, horsCarte };
}

export type CarteDataState = {
  data: CarteData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /**
   * Charge les vraies fiches d'un département et remplace ses cellules de
   * densité. Idempotent : un département déjà ouvert n'est pas rechargé.
   */
  chargerDepartement: (code: string) => void;
  /** Départements dont les fiches réelles sont chargées. */
  deptsCharges: ReadonlySet<string>;
};

export function useCarteData(): CarteDataState {
  const [data, setData] = React.useState<CarteData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    setLoading(true);
    setError(null);
    loadCarte(controller.signal)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        logger.error("Carte du territoire : chargement impossible", err);
        setError(err instanceof Error ? err.message : "chargement impossible");
        setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [nonce]);

  const reload = React.useCallback(() => {
    setDeptsCharges(new Set());
    setNonce((n) => n + 1);
  }, []);

  const [deptsCharges, setDeptsCharges] = React.useState<ReadonlySet<string>>(new Set());
  const enCours = React.useRef<Set<string>>(new Set());

  const chargerDepartement = React.useCallback(
    (code: string) => {
      if (deptsCharges.has(code) || enCours.current.has(code)) return;
      enCours.current.add(code);

      void (async () => {
        try {
          const reponse = await authedFetch(
            `/api/entreprises/carte?dept=${encodeURIComponent(code)}`,
          );
          if (!reponse.ok) throw new Error(`carte_dept_${reponse.status}`);
          const charge = (await reponse.json()) as { fiches?: FicheApi[] };
          const reelles = (charge.fiches ?? []).map(versFiche);

          setData((prev) => {
            if (!prev) return prev;
            // Les cellules du département cèdent la place à ses fiches ; celles
            // des autres départements restent, la carte doit rester complète.
            const autres = prev.fiches.filter((f) => f.dept !== code);
            const fiches = [...autres, ...reelles];

            const departements = prev.departements.map((d) =>
              d.code === code ? { ...d, fiches: reelles } : d,
            );

            return {
              ...prev,
              fiches,
              departements,
              deptByCode: new Map(departements.map((d) => [d.code, d])),
            };
          });
          setDeptsCharges((prev) => new Set(prev).add(code));
        } catch (err) {
          logger.error(`Carte : département ${code} non chargé`, err);
        } finally {
          enCours.current.delete(code);
        }
      })();
    },
    [deptsCharges],
  );

  return { data, loading, error, reload, chargerDepartement, deptsCharges };
}
