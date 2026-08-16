"use client";

import * as React from "react";

import { companiesApi } from "@/utils/api";
import type { CompanySearchResult } from "@/lib/entreprises/colonnes";

/**
 * Recherche d'entreprises côté serveur, débouncée, pour les sélecteurs.
 *
 * Les sélecteurs (Cmd+K, formulaire de contact, sélecteur de RDV) filtraient le
 * tableau `companies` du contexte. Ça ne marche plus, pour une raison de fond :
 * ce tableau ne contient désormais que le périmètre actif (~1 100 fiches), et ce
 * qu'on cherche dans un sélecteur c'est souvent un prospect encore non qualifié
 * — donc précisément une fiche qui n'y est pas.
 *
 * La recherche part donc en base, sur les ~61 000 lignes, servie par les index
 * trigram posés par sql/20260820_perf_60k_entreprises.sql.
 *
 * Les réponses hors séquence sont ignorées : sans ça, une requête lente lancée
 * sur « pl » peut revenir après celle de « plomberie » et réécrire la liste avec
 * des résultats périmés.
 */
export function useRechercheEntreprises(
  requete: string,
  options?: {
    /** Ne lance rien tant que c'est `false` (menu fermé, champ replié…). */
    actif?: boolean;
    limit?: number;
    qualifieesSeulement?: boolean;
    delaiMs?: number;
  },
) {
  const {
    actif = true,
    limit = 20,
    qualifieesSeulement = false,
    delaiMs = 250,
  } = options ?? {};

  const [resultats, setResultats] = React.useState<CompanySearchResult[]>([]);
  const [chargement, setChargement] = React.useState(false);
  const sequence = React.useRef(0);

  const terme = requete.trim();

  React.useEffect(() => {
    if (!actif || terme.length === 0) {
      setResultats([]);
      setChargement(false);
      // Invalide les requêtes en vol : leur réponse ne doit pas repeupler une
      // liste qu'on vient de vider.
      sequence.current += 1;
      return;
    }

    const tour = ++sequence.current;
    setChargement(true);

    const minuteur = setTimeout(async () => {
      const trouvees = await companiesApi.rechercher(terme, {
        limit,
        qualifieesSeulement,
      });
      if (sequence.current !== tour) return;
      setResultats(trouvees);
      setChargement(false);
    }, delaiMs);

    return () => clearTimeout(minuteur);
  }, [terme, actif, limit, qualifieesSeulement, delaiMs]);

  return { resultats, chargement };
}
