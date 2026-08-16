"use client";

import * as React from "react";

import { authedFetch } from "@/utils/authedFetch";
import logger from "@/utils/logger";
import type { Company } from "@/types";

export type OngletFile = "queue" | "qualified" | "hidden";
export type FiltreUrl = "all" | "with-url" | "without-url";

export type FiltresFile = {
  onglet: OngletFile;
  q: string;
  sources: string[];
  urlFilter: FiltreUrl;
  masquerDoublons: boolean;
  page: number;
  parPage: number;
};

/**
 * Une page de la file de qualification, servie par /api/entreprises/file.
 *
 * L'écran chargeait les 60 000 entreprises puis les filtrait en mémoire à
 * chaque rendu — donc à chaque frappe — en appelant par fiche un `isDuplicate()`
 * qui balayait lui-même les groupes de doublons. Le filtrage, le comptage et la
 * pagination sont maintenant faits en SQL ; il ne transite que les 12 fiches
 * affichées.
 *
 * La recherche est débouncée : sans ça chaque caractère déclencherait une
 * requête, et la réponse de « pl » pourrait écraser celle de « plomberie ». Le
 * compteur de séquence écarte les réponses hors d'ordre.
 */
export function useFileQualification(filtres: FiltresFile, delaiRechercheMs = 300) {
  const [entreprises, setEntreprises] = React.useState<Company[]>([]);
  const [total, setTotal] = React.useState(0);
  const [chargement, setChargement] = React.useState(true);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const sequence = React.useRef(0);

  const { onglet, q, sources, urlFilter, masquerDoublons, page, parPage } = filtres;
  // Les sources sont un tableau : sérialisé, il donne une dépendance stable
  // même quand l'appelant reconstruit le tableau à chaque rendu.
  const clefSources = sources.join(",");
  const terme = q.trim();

  const [compteurRafraichissement, setCompteurRafraichissement] = React.useState(0);
  const rafraichir = React.useCallback(() => setCompteurRafraichissement((n) => n + 1), []);

  React.useEffect(() => {
    const tour = ++sequence.current;
    setChargement(true);

    // Seule la recherche est débouncée : changer d'onglet ou de page doit
    // répondre immédiatement.
    const delai = terme.length > 0 ? delaiRechercheMs : 0;

    const minuteur = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          onglet,
          url_filter: urlFilter,
          masquer_doublons: String(masquerDoublons),
          limit: String(parPage),
          offset: String(Math.max(page - 1, 0) * parPage),
        });
        if (terme) params.set("q", terme);
        if (clefSources) params.set("sources", clefSources);

        const reponse = await authedFetch(`/api/entreprises/file?${params}`);
        if (!reponse.ok) throw new Error(`file_${reponse.status}`);

        const donnees = (await reponse.json()) as { entreprises?: Company[]; total?: number };
        if (sequence.current !== tour) return;

        setEntreprises(donnees.entreprises ?? []);
        setTotal(donnees.total ?? 0);
        setErreur(null);
      } catch (e) {
        if (sequence.current !== tour) return;
        logger.error("Erreur de chargement de la file de qualification:", e);
        setErreur("Impossible de charger la file de qualification.");
        setEntreprises([]);
      } finally {
        if (sequence.current === tour) setChargement(false);
      }
    }, delai);

    return () => clearTimeout(minuteur);
  }, [
    onglet,
    terme,
    clefSources,
    urlFilter,
    masquerDoublons,
    page,
    parPage,
    delaiRechercheMs,
    compteurRafraichissement,
  ]);

  return { entreprises, total, chargement, erreur, rafraichir };
}
