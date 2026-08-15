"use client";

import * as React from "react";
import { Clock, Loader2 } from "lucide-react";
import { estStatutTerminal, type JobEnFile } from "@/lib/gmaps/contract";

const nf = new Intl.NumberFormat("fr-FR");

/**
 * La file d'attente des recherches.
 *
 * Le scraper n'en traite qu'une à la fois et empile le reste — c'est le cas
 * depuis toujours, mais le CRM l'ignorait : lancer une seconde recherche
 * pendant qu'une première tournait donnait un écran muet, alors que la demande
 * était bel et bien enregistrée.
 *
 * Les recherches TERMINÉES n'apparaissent pas ici. Cette liste répond à « qu'est
 * -ce qui reste à faire ? » ; ce qui est fait a déjà donné ses résultats.
 */
export function FileRecherches({
  jobs,
  jobAffiche,
  onAfficher,
}: {
  jobs: JobEnFile[];
  jobAffiche: string | null;
  onAfficher: (jobId: string) => void;
}) {
  const enCours = jobs.filter((j) => j.status === "running");
  const enAttente = jobs.filter((j) => j.status === "pending");
  if (enCours.length === 0 && enAttente.length === 0) return null;

  return (
    <section className="rfile">
      <header className="rfile-tete">
        <span className="carte-kicker">File des recherches</span>
        <span className="rfile-compte">
          {nf.format(enAttente.length)} en attente
        </span>
      </header>
      <ol className="rfile-liste">
        {[...enCours, ...enAttente].map((job) => (
          <li key={job.jobId}>
            <button
              type="button"
              className="rfile-ligne"
              data-etat={job.status}
              data-actif={job.jobId === jobAffiche ? "true" : undefined}
              onClick={() => onAfficher(job.jobId)}
              // Une recherche qui n'a pas commencé n'a ni carte ni compteur à
              // montrer : on ne propose pas de l'afficher.
              disabled={job.status === "pending"}
            >
              <span className="rfile-rang">
                {job.status === "running" ? (
                  <Loader2 className="rfile-tourne" />
                ) : (
                  <Clock className="rfile-attend" />
                )}
              </span>
              <span className="rfile-quoi">
                <b>{job.businessTypes.join(", ") || "recherche"}</b>
                <em>{job.location}</em>
              </span>
              <span className="rfile-chiffres">
                {job.status === "running" ? (
                  <>
                    {job.tilesTotal > 0 && (
                      <span className="rfile-tuiles">
                        {nf.format(job.tilesDone)}/{nf.format(job.tilesTotal)}
                      </span>
                    )}
                    <span className="rfile-trouves">{nf.format(job.found)}</span>
                  </>
                ) : (
                  <span className="rfile-position">
                    {/* Le rang se compte parmi les recherches EN ATTENTE, pas
                        dans la liste entière : la première d'entre elles est
                        « suivante », même si une autre tourne au-dessus. */}
                    {enAttente.indexOf(job) === 0
                      ? "suivante"
                      : `n° ${enAttente.indexOf(job) + 1}`}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Quelle recherche afficher : celle que l'utilisateur a choisie tant qu'elle
 * existe, sinon celle qui tourne, sinon la dernière lancée.
 *
 * Le point délicat est le passage de témoin : quand la recherche affichée se
 * termine et qu'une autre démarre, la vue doit SUIVRE — c'est tout l'intérêt
 * d'une file. Mais si l'utilisateur a délibérément ouvert une recherche
 * terminée pour en relire les résultats, on ne la lui arrache pas.
 */
export function choisirJobAffiche(
  jobs: JobEnFile[],
  choixUtilisateur: string | null,
  jobActuel: string | null,
): string | null {
  const parId = new Map(jobs.map((j) => [j.jobId, j]));
  if (choixUtilisateur && parId.has(choixUtilisateur)) return choixUtilisateur;

  const actuel = jobActuel ? parId.get(jobActuel) : undefined;
  // Tant que la recherche affichée n'est pas finie, elle reste à l'écran.
  if (actuel && !estStatutTerminal(actuel.status)) return actuel.jobId;

  const enCours = jobs.find((j) => j.status === "running");
  if (enCours) return enCours.jobId;

  // Plus rien ne tourne : on garde ce qui était affiché plutôt que de vider
  // l'écran au moment précis où l'utilisateur vient lire ses résultats.
  return jobActuel ?? jobs[jobs.length - 1]?.jobId ?? null;
}

export default FileRecherches;
