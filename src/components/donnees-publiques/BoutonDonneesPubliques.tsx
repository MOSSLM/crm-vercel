"use client";

/**
 * Le bouton d'une fiche : rafraîchir ses données publiques, ou lui trouver un
 * SIRET.
 *
 * Composant autonome, à déposer dans la modale d'une fiche. Il ne connaît que
 * l'`entreprise_id` et les deux routes — aucune dépendance au board, pour qu'il
 * puisse aussi vivre dans la future fiche entreprise.
 *
 * DEUX ÉTATS, ET C'EST LE POINT :
 *
 * - la fiche A un SIRET → un bouton qui hydrate, immédiatement ;
 * - la fiche N'A PAS de SIRET → un bouton qui CHERCHE des candidats, puis une
 *   liste à trancher. Jamais de validation automatique, même à 100 de score :
 *   une enseigne ne correspond pas à une raison sociale, et un SIRET faux
 *   contamine ensuite toutes les données publiques de la fiche, jusqu'aux
 *   logos RGE affichés sur un site qu'on produit.
 */

import { useCallback, useState } from "react";

import { authedFetch } from "@/utils/authedFetch";

type Candidat = {
  id: string;
  siret: string;
  denomination: string | null;
  enseignes: string[] | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  etat_administratif: string | null;
  naf_code: string | null;
  score: number;
  score_detail: {
    nom?: number;
    codePostal?: number;
    ville?: number;
    activite?: number;
    etat?: number;
    nomCompareA?: string | null;
    alertes?: string[];
  } | null;
};

export type BoutonDonneesPubliquesProps = {
  entrepriseId: number;
  /** SIRET déjà validé, s'il existe. */
  siret?: string | null;
  /** Appelé après une hydratation ou une validation, pour rafraîchir l'appelant. */
  onChange?: () => void;
};

const JSON_HEADERS = { "content-type": "application/json" };

export default function BoutonDonneesPubliques({
  entrepriseId,
  siret,
  onChange,
}: BoutonDonneesPubliquesProps) {
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidats, setCandidats] = useState<Candidat[] | null>(null);

  const hydrater = useCallback(async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const res = await authedFetch("/api/donnees-publiques/hydrate", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ entreprise_ids: [entrepriseId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "échec");
      const r = data.traitees?.[0];
      setMessage(
        r
          ? `Identité ${r.identite}, RGE ${r.rge} (+${r.rge_ajoutees} / −${r.rge_retirees})`
          : "Rien à faire",
      );
      onChange?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "échec");
    } finally {
      setOccupe(false);
    }
  }, [entrepriseId, onChange]);

  const chercher = useCallback(async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const res = await authedFetch("/api/donnees-publiques/resolution", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ entreprise_ids: [entrepriseId] }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "échec");

      const liste = await authedFetch(
        `/api/donnees-publiques/resolution?entreprise_id=${entrepriseId}`,
      );
      const data = await liste.json();
      setCandidats(data.candidats ?? []);
      if ((data.candidats ?? []).length === 0) {
        // Un message franc plutôt qu'une liste vide : sur ce parc, la recherche
        // par nom échoue souvent, et le SIRET du site est alors le seul recours.
        setMessage("Aucun candidat trouvé. Le SIRET figure souvent en pied de page du site.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "échec");
    } finally {
      setOccupe(false);
    }
  }, [entrepriseId]);

  const trancher = useCallback(
    async (siretChoisi: string, decision: "valide" | "rejete") => {
      setOccupe(true);
      try {
        const res = await authedFetch("/api/donnees-publiques/resolution", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ entreprise_id: entrepriseId, siret: siretChoisi, decision }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "échec");
        if (decision === "valide") {
          setCandidats(null);
          setMessage(`SIRET ${siretChoisi} validé. Hydratation possible.`);
          onChange?.();
        } else {
          setCandidats((c) => (c ?? []).filter((x) => x.siret !== siretChoisi));
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "échec");
      } finally {
        setOccupe(false);
      }
    },
    [entrepriseId, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {siret ? (
          <>
            <button
              type="button"
              onClick={hydrater}
              disabled={occupe}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {occupe ? "Rafraîchissement…" : "Rafraîchir les données publiques"}
            </button>
            <span className="font-mono text-xs text-neutral-500">{siret}</span>
          </>
        ) : (
          <button
            type="button"
            onClick={chercher}
            disabled={occupe}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {occupe ? "Recherche…" : "Chercher le SIRET"}
          </button>
        )}
      </div>

      {message && <p className="text-xs text-neutral-600">{message}</p>}

      {candidats && candidats.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">
            Candidats proposés — à valider un par un. Rien n&apos;est écrit tant que vous n&apos;avez
            pas tranché.
          </p>
          {candidats.map((c) => (
            <div key={c.id} className="rounded border p-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <strong>{c.denomination ?? "—"}</strong>
                <span className="text-xs text-neutral-500">score {c.score}/100</span>
              </div>

              <div className="text-xs text-neutral-600">
                {[c.adresse, c.code_postal, c.ville].filter(Boolean).join(" ")}
                {c.naf_code ? ` · NAF ${c.naf_code}` : ""}
              </div>
              <div className="font-mono text-xs text-neutral-500">{c.siret}</div>

              {/* Le détail du score est affiché : un score nu ne se conteste
                  pas, un score décomposé se relit. */}
              {c.score_detail && (
                <div className="mt-1 text-xs text-neutral-500">
                  nom {c.score_detail.nom ?? 0} · CP {c.score_detail.codePostal ?? 0} · ville{" "}
                  {c.score_detail.ville ?? 0} · activité {c.score_detail.activite ?? 0}
                  {c.score_detail.nomCompareA ? ` · comparé à ${c.score_detail.nomCompareA}` : ""}
                </div>
              )}

              {/* Les alertes ne sont pas fondues dans le score : une entreprise
                  cessée reste proposable — c'est peut-être la bonne, et le
                  découvrir est un renseignement — mais ça doit sauter aux yeux. */}
              {(c.score_detail?.alertes ?? []).map((a) => (
                <div key={a} className="mt-1 text-xs font-medium text-amber-700">
                  ⚠ {a}
                </div>
              ))}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => trancher(c.siret, "valide")}
                  disabled={occupe}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                >
                  C&apos;est celle-ci
                </button>
                <button
                  type="button"
                  onClick={() => trancher(c.siret, "rejete")}
                  disabled={occupe}
                  className="rounded border px-2 py-1 text-xs text-neutral-500 disabled:opacity-50"
                >
                  Écarter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
