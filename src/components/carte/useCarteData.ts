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
  /** Coordonnées projetées, posées par la carte une fois la taille connue. */
  x?: number;
  y?: number;
};

export type DeptCarte = Departement & {
  geometry: DeptGeometry;
  fiches: FicheCarte[];
};

export type CarteData = {
  fiches: FicheCarte[];
  departements: DeptCarte[];
  deptByCode: Map<string, DeptCarte>;
  geometries: DeptGeometry[];
  /** Fiches sans rattachement : outre-mer, étranger, ou géocodage manquant. */
  horsCarte: FicheCarte[];
};

/** Une fiche telle que la renvoie `/api/entreprises/carte?detail=fiches`. */
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

/**
 * Les fiches de la carte, en UNE requête.
 *
 * Cette fonction paginait `entreprises` par tranches de 1 000 (61 requêtes
 * séquentielles), plus `opportunites` et `etapes_pipeline`, puis recomposait le
 * statut de chaque fiche en JS et résolvait son département par
 * `resolveDepartement` — un test point-dans-polygone exécuté 60 000 fois sur le
 * thread principal, qui figeait l'onglet à chaque ouverture de /carte.
 *
 * Statut et département sont maintenant calculés en base
 * (cf. sql/20260820_perf_60k_entreprises.sql) : le département se dérive du
 * code postal, que 98 % des fiches portent, et le statut reprend exactement les
 * règles de `src/lib/carte/statuts.ts`.
 */
async function loadCarte(signal: AbortSignal): Promise<CarteData> {
  const [geometries, reponse] = await Promise.all([
    fetchContours(CONTOURS_URL, signal),
    authedFetch("/api/entreprises/carte?detail=fiches", { signal }),
  ]);

  if (!reponse.ok) throw new Error(`carte_${reponse.status}`);
  const charge = (await reponse.json()) as { fiches?: FicheApi[] };

  const fiches: FicheCarte[] = (charge.fiches ?? []).map((row) => ({
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
  }));

  const departements: DeptCarte[] = geometries
    .map((geometry) => {
      const meta = DEPARTEMENT_BY_CODE[geometry.code];
      if (!meta) return null;
      return { ...meta, geometry, fiches: [] as FicheCarte[] };
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

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
