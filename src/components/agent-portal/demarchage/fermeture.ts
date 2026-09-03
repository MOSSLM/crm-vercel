"use client";

/**
 * Fermer un panneau flottant dès qu'on clique ailleurs, ou qu'on tape Échap.
 *
 * Extrait de `DemRail` le jour où la légende a eu besoin du même geste : deux
 * copies du même écouteur, c'est deux occasions d'oublier de le retirer — et un
 * écouteur `mousedown` qui survit au démontage ferme un panneau qui n'existe
 * plus. Le rail et la légende partagent donc celui-ci, et rien d'autre.
 */

import { useEffect, useRef } from "react";

export function useFermetureAuClicDehors(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ouvert, fermer]);
  return ref;
}
