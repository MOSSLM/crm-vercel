"use client";

/**
 * Enregistre le service worker — et le fait UNIQUEMENT depuis la coque CRM.
 *
 * POURQUOI CE COMPOSANT EXISTE PLUTÔT QU'UN SCRIPT DANS LE LAYOUT
 * `public/sw.js` est servi sur tous les hôtes : le middleware laisse passer tout
 * chemin contenant un point, donc `client.fr/sw.js` rend bien ce fichier. Mais
 * un fichier n'est un service worker que si une page l'ENREGISTRE, et c'est ce
 * composant qui enregistre. Il est monté dans les `Providers` du groupe `(crm)`,
 * jamais dans `(public)` : les sites publiés des clients ne l'exécutent donc
 * jamais.
 *
 * Cette garantie est doublée par l'architecture des domaines — le CRM vit sur
 * `app.{SITE_DOMAIN}`, les sites sur d'autres hôtes, et la portée d'un service
 * worker s'arrête à son origine. Mais la garantie de code vaut mieux qu'une
 * garantie de configuration : elle survivra à un changement de domaine.
 *
 * ── L'ENREGISTREMENT EST DIFFÉRÉ, ET CE N'EST PAS DU CONFORT ─────────────
 * Enregistrer pendant le montage met la requête `/sw.js` en concurrence avec
 * celles dont dépend le premier écran. On attend donc que la page soit chargée.
 * Le service worker ne sert rien au premier rendu (il ne met rien en cache) :
 * il n'y a strictement rien à gagner à l'enregistrer tôt.
 */

import { useEffect } from "react";

export function ServiceWorkerBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // En développement, un service worker déjà enregistré survit aux
    // rechargements et brouille le diagnostic. On ne l'installe qu'en
    // production, là où il sert à quelque chose.
    if (process.env.NODE_ENV !== "production") return;

    const enregistrer = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Un échec d'enregistrement n'a aucune conséquence : le CRM fonctionne
        // exactement pareil sans. On ne dérange donc personne avec.
      });
    };

    if (document.readyState === "complete") {
      enregistrer();
      return;
    }
    window.addEventListener("load", enregistrer, { once: true });
    return () => window.removeEventListener("load", enregistrer);
  }, []);

  return null;
}

export default ServiceWorkerBridge;
