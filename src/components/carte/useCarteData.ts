"use client";

import * as React from "react";
import { supabase } from "@/utils/supabase/client";
import logger from "@/utils/logger";
import {
  CONTOURS_URL,
  DEPARTEMENT_BY_CODE,
  departementFromCodePostal,
  type Departement,
} from "@/lib/carte/departements";
import { fetchContours, resolveDepartement, type DeptGeometry } from "@/lib/carte/geo";
import {
  avancementDeLEtape,
  avancementLePlusAvance,
  statutEntreprise,
  type AvancementAffaire,
  type StatutCarte,
} from "@/lib/carte/statuts";

/**
 * Supabase plafonne une réponse à 1000 lignes : on pagine jusqu'au bout, en
 * ordonnant toujours sur une colonne unique — un tri à égalités ne garantit pas
 * un ordre stable entre deux pages, et des fiches disparaîtraient de la carte.
 */
const PAGE_SIZE = 1000;

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

type EntrepriseRow = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  site_web_canonique: string | null;
  premiers_tags: string | null;
  service_tags: unknown;
  lat: number | null;
  lng: number | null;
  qualifie: boolean | null;
  hidden_in_qualification: boolean | null;
  archived_at: string | null;
};

type OpportuniteRow = {
  id: string;
  entreprise_id: number | null;
  stage_id: number | null;
};

type EtapeRow = {
  id: number;
  nom: string | null;
  ordre: number | null;
};

const ENTREPRISE_SELECT =
  "id,name,ville,code_postal,telephone,site_web_canonique,premiers_tags,service_tags,lat,lng,qualifie,hidden_in_qualification,archived_at";

async function fetchAllPages<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** `service_tags` est un jsonb qui a porté plusieurs formes au fil du temps. */
function readTags(row: EntrepriseRow): string[] {
  const out: string[] = [];
  if (Array.isArray(row.service_tags)) {
    for (const tag of row.service_tags) {
      if (typeof tag === "string" && tag.trim()) out.push(tag.trim());
    }
  }
  if (out.length === 0 && row.premiers_tags) {
    for (const tag of row.premiers_tags.split(/[,;|]/)) {
      const clean = tag.trim();
      if (clean) out.push(clean);
    }
  }
  return out;
}

async function loadCarte(signal: AbortSignal): Promise<CarteData> {
  const [geometries, entreprises, opportunites, etapes] = await Promise.all([
    fetchContours(CONTOURS_URL, signal),
    fetchAllPages<EntrepriseRow>("entreprises", ENTREPRISE_SELECT),
    fetchAllPages<OpportuniteRow>("opportunites", "id,entreprise_id,stage_id"),
    fetchAllPages<EtapeRow>("etapes_pipeline", "id,nom,ordre"),
  ]);

  const avancementParEtape = new Map<number, AvancementAffaire>(
    etapes.map((e) => [e.id, avancementDeLEtape(e.nom ?? "", e.ordre ?? 0)]),
  );

  // Une entreprise peut porter plusieurs affaires (un pipeline par offre) :
  // c'est la plus avancée qui décide de sa couleur.
  const avancementParEntreprise = new Map<number, AvancementAffaire>();
  for (const opp of opportunites) {
    if (opp.entreprise_id == null || opp.stage_id == null) continue;
    const etape = avancementParEtape.get(opp.stage_id) ?? "aucun";
    const courant = avancementParEntreprise.get(opp.entreprise_id) ?? "aucun";
    avancementParEntreprise.set(opp.entreprise_id, avancementLePlusAvance(courant, etape));
  }

  const fiches: FicheCarte[] = entreprises.map((row) => {
    const lat = typeof row.lat === "number" ? row.lat : null;
    const lng = typeof row.lng === "number" ? row.lng : null;
    const dept =
      lat != null && lng != null
        ? resolveDepartement(geometries, lng, lat)
        : departementFromCodePostal(row.code_postal);

    return {
      id: row.id,
      nom: row.name?.trim() || `Fiche #${row.id}`,
      ville: row.ville,
      codePostal: row.code_postal,
      telephone: row.telephone,
      siteWeb: row.site_web_canonique,
      tags: readTags(row),
      lat,
      lng,
      dept,
      statut: statutEntreprise(
        {
          qualifie: Boolean(row.qualifie),
          hidden_in_qualification: row.hidden_in_qualification,
          archived_at: row.archived_at,
        },
        avancementParEntreprise.get(row.id) ?? "aucun",
      ),
    };
  });

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
