"use client";

import { useEffect } from "react";

/**
 * Balise de mesure des visites de démo. Montée dans le layout `(public)`, donc
 * présente sur tous les sites clients et tous les aperçus, sans configuration
 * par site.
 *
 * Pourquoi une balise et pas un log serveur : les pages de site sont en ISR
 * (`revalidate = 60`), le composant serveur ne s'exécute donc pas sur la
 * plupart des visites — elles sortent du cache. Et une durée de lecture ne se
 * mesure de toute façon que côté client.
 *
 * Ce qu'elle N'EST PAS : un traceur publicitaire. Pas de cookie, pas de tiers,
 * pas d'identifiant persistant — l'identifiant de session vit en
 * `sessionStorage` et disparaît à la fermeture de l'onglet. Elle poste sur son
 * propre domaine, ce qui la rend aussi insensible aux bloqueurs de publicité,
 * lesquels filtrent sur les hôtes tiers connus.
 *
 * Volontairement sans dépendance et sans état React : tout ce qui est ajouté
 * ici est téléchargé par chaque prospect avant de voir la maquette.
 */

const ENDPOINT = "/api/public/site-visit";
const STORE_KEY = "sdv";
/** Marque le navigateur comme interne, une fois pour toutes, par hôte. */
const INTERNAL_KEY = "sdv_internal";

/** Premier envoi rapide : la ligne existe même si l'onglet est fermé aussitôt. */
const FIRST_PING_MS = 5_000;
/** Puis un battement régulier, pour ne pas dépendre d'un `pagehide` fiable
 *  (il ne l'est pas sur iOS Safari). */
const HEARTBEAT_MS = 30_000;

interface Store {
  id: string;
  paths: string[];
  views: number;
  /** Millisecondes cumulées onglet au premier plan, pages précédentes incluses. */
  ms: number;
  token: string | null;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function readStore(): Store {
  const fresh: Store = { id: newId(), paths: [], views: 0, ms: 0, token: null };
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Partial<Store>;
    if (typeof p.id !== "string" || !p.id) return fresh;
    return {
      id: p.id,
      paths: Array.isArray(p.paths) ? p.paths.filter((x): x is string => typeof x === "string") : [],
      views: typeof p.views === "number" ? p.views : 0,
      ms: typeof p.ms === "number" ? p.ms : 0,
      token: typeof p.token === "string" ? p.token : null,
    };
  } catch {
    // Navigation privée, stockage désactivé : on mesure la page en cours et on
    // s'arrête là, plutôt que de faire échouer le rendu du site d'un client.
    return fresh;
  }
}

function writeStore(s: Store): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignoré — cf. readStore */
  }
}

/**
 * Une visite de l'équipe (relecture d'une maquette avant envoi) ne doit pas
 * compter. Le CRM ajoute `?_i=1` à ses liens « voir le site » ; on retient la
 * marque pour l'hôte courant, car les visites suivantes n'auront pas le
 * paramètre.
 */
function detectInternal(params: URLSearchParams): boolean {
  try {
    if (params.get("_i") === "1") {
      localStorage.setItem(INTERNAL_KEY, "1");
      return true;
    }
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return params.get("_i") === "1";
  }
}

export function VisitBeacon() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const internal = detectInternal(params);

    const store = readStore();
    const path = window.location.pathname || "/";

    // Le jeton n'est présent que sur le premier clic depuis l'email ; on le
    // garde pour les pages suivantes de la même session.
    const token = params.get("k") ?? store.token;

    store.views += 1;
    if (!store.paths.includes(path)) store.paths.push(path);
    store.token = token;
    writeStore(store);

    // Temps passé au premier plan seulement : un onglet ouvert en arrière-plan
    // pendant deux heures n'est pas une lecture de deux heures.
    let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    let accumulated = 0;

    const foregroundMs = () => accumulated + (visibleSince ? Date.now() - visibleSince : 0);

    const send = () => {
      const ms = foregroundMs();
      const current = readStore();
      const payload = JSON.stringify({
        sessionId: store.id,
        path,
        paths: Array.from(new Set([...current.paths, ...store.paths])),
        referrer: document.referrer || null,
        // `store.ms` porte le temps des pages précédentes de la session.
        durationMs: store.ms + ms,
        pageViews: current.views,
        token,
        internal,
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
        } else {
          void fetch(ENDPOINT, { method: "POST", body: payload, keepalive: true });
        }
      } catch {
        /* la mesure n'est jamais une raison de casser la page */
      }
    };

    const persist = () => {
      // Le cumul de la session doit survivre au changement de page.
      const current = readStore();
      writeStore({ ...current, ms: store.ms + foregroundMs() });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (visibleSince) {
          accumulated += Date.now() - visibleSince;
          visibleSince = null;
        }
        persist();
        send();
      } else if (!visibleSince) {
        visibleSince = Date.now();
      }
    };

    const onPageHide = () => {
      persist();
      send();
    };

    const first = window.setTimeout(send, FIRST_PING_MS);
    const beat = window.setInterval(() => {
      persist();
      send();
    }, HEARTBEAT_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      persist();
    };
  }, []);

  return null;
}
