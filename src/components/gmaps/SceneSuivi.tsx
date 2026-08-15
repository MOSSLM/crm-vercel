"use client";

import * as React from "react";
import { SuiviRecherche, type SuiviRechercheProps } from "./SuiviRecherche";

/**
 * La scène où les recherches se succèdent.
 *
 * Le scraper ne traite qu'un crawl à la fois : quand l'un finit, le suivant
 * démarre. Sans mise en scène, la carte changerait de ville d'une image à
 * l'autre, et on ne saurait plus de quelle recherche on regarde les résultats.
 * Ici, la carte terminée se referme et disparaît, puis la suivante arrive par
 * la droite et prend la place.
 *
 * MÉCANIQUE — la partie qui n'est pas évidente : pendant la sortie, on affiche
 * un panneau FIGÉ sur les dernières données de la recherche qui s'en va. Sans
 * ça, le sondage suivant remplirait la carte sortante avec les compteurs de la
 * nouvelle ville, et l'on verrait la carte de Limoges afficher les chiffres de
 * Clermont-Ferrand pendant sa fermeture.
 */

export type PanneauSuivi = SuiviRechercheProps & { jobId: string };

/** Doit rester aligné sur les durées d'animation de `carte-recherche.css`. */
const DUREE_SORTIE_MS = 420;
const DUREE_ENTREE_MS = 520;

export function SceneSuivi({ courant }: { courant: PanneauSuivi | null }) {
  const precedent = React.useRef<PanneauSuivi | null>(null);
  const [fige, setFige] = React.useState<PanneauSuivi | null>(null);
  const [phase, setPhase] = React.useState<"stable" | "entree">("stable");

  const jobId = courant?.jobId ?? null;

  React.useEffect(() => {
    const avant = precedent.current;
    precedent.current = courant;
    // Première recherche de la session : elle entre, personne ne sort.
    if (!avant || !courant || avant.jobId === courant.jobId) {
      if (avant && courant && avant.jobId !== courant.jobId) return;
      if (!avant && courant) setPhase("entree");
      return;
    }
    setFige(avant);
    const fermeture = setTimeout(() => {
      setFige(null);
      setPhase("entree");
    }, DUREE_SORTIE_MS);
    const ouverture = setTimeout(
      () => setPhase("stable"),
      DUREE_SORTIE_MS + DUREE_ENTREE_MS,
    );
    return () => {
      clearTimeout(fermeture);
      clearTimeout(ouverture);
    };
    // Volontairement indexé sur le seul jobId : `courant` est un objet neuf à
    // chaque sondage, et dépendre de lui rejouerait l'animation toutes les 3 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // La scène garde sa place pendant la bascule : sans hauteur réservée, la page
  // sauterait au moment où la carte sortante se referme.
  if (fige) {
    return (
      <div className="rlive-scene">
        <div className="rlive-panneau" data-phase="sortie">
          <SuiviRecherche {...fige} />
        </div>
      </div>
    );
  }
  if (!courant) return null;
  return (
    <div className="rlive-scene">
      <div className="rlive-panneau" data-phase={phase} key={courant.jobId}>
        <SuiviRecherche {...courant} />
      </div>
    </div>
  );
}

export default SceneSuivi;
