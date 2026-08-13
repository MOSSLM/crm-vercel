"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sama:softphone-widget-hidden";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

/**
 * Préférence locale (par navigateur) : masquer le bouton flottant du
 * softphone web quand il n'y a pas d'appel en cours. Pensé pour les agents
 * qui appellent depuis leur téléphone physique — le bouton, toujours
 * affiché en bas à droite, gênait notamment la pagination du pipeline
 * commercial. Un appel entrant réaffiche le panneau malgré tout : seul le
 * bouton flottant au repos est concerné.
 */
export function useSoftphoneWidgetHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHidden(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: boolean) => {
    setHidden(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }, []);

  return [hidden, update];
}
