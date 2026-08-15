"use client";

import * as React from "react";
import { Radar } from "lucide-react";
import { CarteRecherche } from "./CarteRecherche";
import { avancement } from "@/lib/gmaps/grille";
import type { Contour, JobStatus, JobStatusValue, PointRecherche } from "@/lib/gmaps/contract";

const nf = new Intl.NumberFormat("fr-FR");

const LIBELLE_ETAT: Record<JobStatusValue, string> = {
  pending: "en attente",
  running: "en cours",
  done: "terminée",
  partial: "terminée en partie",
  error: "échouée",
};

/**
 * Panneau de suivi d'une recherche : où le robot en est, et ce qu'il a déjà
 * ramené.
 *
 * L'ancien écran n'affichait qu'une ligne « Statut: running », et ne montrait
 * les compteurs qu'UNE FOIS LE CRAWL FINI — c'est-à-dire au seul moment où ils
 * n'apprennent plus rien. Une recherche de ville dure des dizaines de minutes :
 * pendant tout ce temps, rien ne distinguait un crawl qui avance d'un crawl
 * bloqué.
 */
export type SuiviRechercheProps = {
  motCle: string;
  lieu: string;
  status: JobStatusValue | null;
  stats: JobStatus | null;
  points: PointRecherche[];
  /** Silhouette de la commune : reçue une seule fois, donc portée à part. */
  contour?: Contour | null;
};

export function SuiviRecherche({ motCle, lieu, status, stats, points, contour }: SuiviRechercheProps) {
  const [mode, setMode] = React.useState<"taches" | "points">("taches");
  /**
   * Entreprises trouvées mais trop loin pour tenir dans le cadre. Google rend
   * régulièrement des fiches situées hors de la zone demandée ; les taire
   * ferait mentir la carte, qui montrerait moins de points que le compteur
   * n'annonce d'entreprises.
   */
  const [horsCadre, setHorsCadre] = React.useState(0);

  const enCours = status === "running" || status === "pending";
  const faites = stats?.tilesDone ?? 0;
  const total = stats?.tilesTotal ?? 0;
  const part = avancement(faites, total);
  const grille = stats?.grille ?? null;
  /**
   * Nom de la commune cherchée. On préfère celui qu'OpenStreetMap a reconnu
   * (« Limoges » extrait de « Limoges, Haute-Vienne, … ») à la saisie brute du
   * formulaire, qui peut porter « Limoges, France » ou un code postal.
   */
  const villeCherchee = (grille?.nomLieu ?? lieu ?? "").split(",")[0].trim() || null;

  return (
    <section className="rlive">
      <header className="rlive-head">
        <span className="rlive-etat" data-etat={status ?? "pending"}>
          <i />
          {status ? LIBELLE_ETAT[status] : "en attente"}
        </span>
        <div className="rlive-head-ttl">
          <b>{motCle || "Recherche"}</b>
          <span>{lieu}</span>
        </div>
      </header>

      <div className="rlive-progres">
        {/*
          `part === null` veut dire « le scraper n'a pas encore annoncé sa
          grille » : on montre une jauge indéterminée. Afficher 0 % serait déjà
          une affirmation — et afficher 100 %, ce que faisait un dénominateur à
          zéro, en serait une fausse.
        */}
        <div className="rlive-jauge" data-indetermine={part === null ? "true" : undefined}>
          <i style={part === null ? undefined : { width: `${(part * 100).toFixed(1)}%` }} />
        </div>
        <span className="rlive-frac">
          {part === null ? (
            "calcul de la zone…"
          ) : (
            <>
              tuile <b>{nf.format(faites)}</b> / {nf.format(total)}
            </>
          )}
        </span>
      </div>

      {grille ? (
        <CarteRecherche
          grille={grille}
          tuiles={stats?.tuiles ?? []}
          tuileEnCours={faites}
          points={points}
          enCours={enCours}
          mode={mode}
          onHorsCadre={setHorsCadre}
          contour={contour ?? null}
          ville={villeCherchee}
        />
      ) : (
        <div className="carte-stage rlive-stage rlive-vide">
          <Radar className="rlive-vide-ico" />
          <span className="carte-kicker">
            {enCours ? "le robot délimite la zone à explorer…" : "aucune zone explorée"}
          </span>
        </div>
      )}

      <div className="rlive-kpi">
        <div>
          <span className="l">Entreprises</span>
          <span className="v">{nf.format(stats?.found ?? 0)}</span>
        </div>
        <div>
          <span className="l">Nouvelles</span>
          <span className="v">{nf.format(stats?.inserted ?? 0)}</span>
        </div>
        <div>
          <span className="l">Déjà connues</span>
          <span className="v">{nf.format(stats?.merged ?? 0)}</span>
        </div>
        <div>
          <span className="l">Tuiles</span>
          <span className="v">
            {nf.format(faites)}
            <small>{total > 0 ? ` / ${nf.format(total)}` : ""}</small>
          </span>
        </div>
        {/* Cinquième compteur seulement si la recherche Google a servi : sinon
            il afficherait un 0 permanent qui ressemblerait à une panne. */}
        {(stats?.pages ?? 0) > 0 && (
          <div>
            <span className="l">Pages Google</span>
            <span className="v">{nf.format(stats?.pages ?? 0)}</span>
          </div>
        )}
      </div>

      <div className="rlive-legende">
        <span>
          <i style={{ background: "var(--bg-2)" }} />
          explorée, rien trouvé
        </span>
        <span>
          <i style={{ background: "#5D99DD" }} />
          explorée, entreprises trouvées
        </span>
        <span>
          <i className="rond" style={{ background: "#1F8A5B" }} />
          nouvelle fiche
        </span>
        <span>
          <i className="rond" style={{ background: "#2F7AE0" }} />
          déjà en base
        </span>
        {horsCadre > 0 && (
          <span className="rlive-hors" title="Google rend parfois des fiches situées loin de la zone demandée.">
            + {nf.format(horsCadre)} hors du cadre
          </span>
        )}
        <div className="rlive-seg" role="group" aria-label="Affichage des entreprises">
          <button type="button" aria-pressed={mode === "taches"} onClick={() => setMode("taches")}>
            Taches
          </button>
          <button type="button" aria-pressed={mode === "points"} onClick={() => setMode("points")}>
            Points
          </button>
        </div>
      </div>
    </section>
  );
}

export default SuiviRecherche;
