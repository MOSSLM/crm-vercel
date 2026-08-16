"use client";

import React from "react";
import { Building2, Search } from "lucide-react";
import { companiesApi } from "@/utils/api";
import { useRechercheEntreprises } from "@/hooks/useRechercheEntreprises";
import { getCompanyDisplayName } from "@/utils/displayHelpers";

/** Au-delà, la liste devient illisible et le rendu rame pendant la frappe. */
const MAX_RESULTATS = 40;

/** Clé de stockage des entreprises consultées récemment dans le cockpit. */
const CLE_RECENTES = "cockpit-rdv:recentes";
const MAX_RECENTES = 6;

export function lireRecentes(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const brut = window.localStorage.getItem(CLE_RECENTES);
    const ids = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function noterRecente(id: number): void {
  if (typeof window === "undefined") return;
  try {
    const suivantes = [id, ...lireRecentes().filter((x) => x !== id)].slice(0, MAX_RECENTES);
    window.localStorage.setItem(CLE_RECENTES, JSON.stringify(suivantes));
  } catch {
    // Navigation privée, quota plein : l'historique récent est un confort,
    // pas une fonctionnalité dont l'absence doit casser le cockpit.
  }
}

/**
 * Le strict nécessaire pour afficher une ligne et la choisir. Défini en
 * structure plutôt qu'en `Pick<…>` pour accepter indifféremment une
 * `CompanySearchResult` (recherche serveur, champs `| null`) et une `Company`
 * (fiche récente rechargée par identifiant, champs `| undefined`).
 */
export type FicheSelectionnable = {
  id: number;
  name?: string | null;
  canonical_url?: string | null;
  ville?: string | null;
  telephone?: string | null;
};

interface Props {
  onChoisir: (entreprise: FicheSelectionnable) => void;
}

export function SelecteurEntreprise({ onChoisir }: Props) {
  const [requete, setRequete] = React.useState("");
  const [recentes, setRecentes] = React.useState<FicheSelectionnable[]>([]);
  const champRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    champRef.current?.focus();
  }, []);

  /**
   * La recherche part en base et couvre les ~61 000 fiches — nom, ville,
   * adresse, et le numéro de téléphone en chiffres seuls (« 06 12 34 » retrouve
   * « +33 6 12 34 56 78 »), via la colonne générée `telephone_chiffres`.
   *
   * Elle filtrait auparavant le tableau `companies` du contexte. Celui-ci ne
   * porte plus que le périmètre actif : chercher dedans ne trouverait plus
   * aucun prospect non qualifié, alors que c'est justement ceux qu'on décroche
   * au téléphone.
   */
  const { resultats } = useRechercheEntreprises(requete, { limit: MAX_RESULTATS });

  // Les récentes sont des identifiants en localStorage : on les résout une à
  // une, faute de pouvoir les chercher par nom. Six au maximum.
  React.useEffect(() => {
    let vivant = true;
    const ids = lireRecentes();
    if (ids.length === 0) {
      setRecentes([]);
      return;
    }
    void Promise.all(ids.map((id) => companiesApi.getById(id))).then((fiches) => {
      if (!vivant) return;
      setRecentes(fiches.filter((f): f is NonNullable<typeof f> => Boolean(f)));
    });
    return () => {
      vivant = false;
    };
  }, []);

  const affichees = requete.trim() ? resultats : recentes;

  const choisir = (entreprise: FicheSelectionnable) => {
    noterRecente(entreprise.id);
    onChoisir(entreprise);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
        <input
          ref={champRef}
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
          placeholder="Nom, ville ou numéro de téléphone…"
          className="h-11 w-full rounded-lg border border-border/60 bg-[var(--surface)] pl-9 pr-3 text-sm outline-none focus:border-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && affichees[0]) choisir(affichees[0]);
          }}
        />
      </div>

      {!requete.trim() && recentes.length > 0 && (
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--text-4)]">
          Récentes
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {affichees.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--text-3)]">
            {requete.trim()
              ? "Aucune entreprise ne correspond."
              : "Tape un nom, une ville ou le numéro qui s'affiche."}
          </p>
        ) : (
          <ul className="space-y-1">
            {affichees.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => choisir(e)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--bg-2)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-2)]">
                    <Building2 className="h-4 w-4 text-[var(--text-3)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {getCompanyDisplayName(e.name, e.canonical_url) || e.name || `Entreprise #${e.id}`}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-3)]">
                      {[e.ville, e.telephone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SelecteurEntreprise;
