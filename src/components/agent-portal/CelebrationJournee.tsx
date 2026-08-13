"use client";

/**
 * La carte de félicitations : « bravo, tes 20 premiers contacts du jour ».
 *
 * DEUX RÈGLES, ET LA SECONDE EST LA PLUS IMPORTANTE.
 *
 * 1. Elle se voit de partout. Montée dans `Providers`, donc présente sur chaque
 *    page du CRM — le commercial passe sa journée entre le pipeline, une fiche
 *    et la médiathèque, et un compteur enterré dans un seul écran n'existe pas.
 *
 * 2. **Elle n'arrête rien.** Ce n'est ni un objectif, ni un quota, ni une
 *    limite. Le CRM en a eu une — `task_max_per_agent` : au-delà de huit tâches
 *    en attente, les suivantes passaient à l'admin. Avec un seul commercial ça
 *    ne répartissait rien, ça l'empêchait juste de travailler. D'où le choix
 *    d'une carte en coin d'écran plutôt que d'une modale : rien n'est masqué,
 *    rien n'attend un clic, on peut l'ignorer et continuer. Franchir un palier
 *    ne ferme aucune file.
 *
 * Le rafraîchissement est volontairement paresseux — au retour sur l'onglet et
 * toutes les deux minutes. Les tâches se terminent à la main, pas à la
 * milliseconde, et une requête par minute sur toutes les pages ouvertes serait
 * du bruit pour une carte qu'on voit quatre fois par jour.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { authedFetch } from "@/utils/authedFetch";
import {
  celebrationAMontrer,
  cleMemoire,
  palierAtteint,
  paliersFranchis,
  texteCelebration,
  type StatsJournee,
} from "@/lib/agent-journee";

const INTERVALLE_MS = 120_000;

/** Les paliers déjà fêtés aujourd'hui. Le stockage local suffit : rater une
 *  félicitation parce qu'on a changé de navigateur n'est pas une perte, et ça
 *  évite une table pour un confetti. */
function lireMemoire(cle: string): number[] {
  try {
    const brut = window.localStorage.getItem(cle);
    const parsed = brut ? (JSON.parse(brut) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === "number") : [];
  } catch {
    return [];
  }
}

function ecrireMemoire(cle: string, paliers: readonly number[]): void {
  try {
    window.localStorage.setItem(cle, JSON.stringify([...new Set(paliers)]));
  } catch {
    /* navigation privée, quota plein : on refêtera, ce n'est pas grave */
  }
}

export function CelebrationJournee() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsJournee | null>(null);
  const [palier, setPalier] = useState<number | null>(null);
  /** Le dernier total connu, pour marquer les paliers intermédiaires comme vus
   *  sans les afficher (voir `paliersFranchis`). */
  const precedent = useRef(0);

  const charger = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await authedFetch("/api/agent/journee");
      if (!res.ok) return;
      const data = (await res.json()) as StatsJournee;
      if (typeof data?.contacts !== "number") return;

      setStats(data);
      const cle = cleMemoire(user.id, data.debutJournee);
      const vus = lireMemoire(cle);
      const aFeter = celebrationAMontrer(data.contacts, vus);
      if (aFeter !== null) {
        // Les paliers sautés (ouverture du CRM à 43 contacts) sont notés vus :
        // on n'en montre qu'un, et les autres ne doivent pas ressurgir plus tard.
        ecrireMemoire(cle, [...vus, ...paliersFranchis(precedent.current, data.contacts), aFeter]);
        setPalier(aFeter);
      }
      precedent.current = data.contacts;
    } catch {
      /* réseau capricieux : on retentera au prochain tour */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void charger();
    const timer = window.setInterval(() => void charger(), INTERVALLE_MS);
    const auRetour = () => {
      if (document.visibilityState === "visible") void charger();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [user?.id, charger]);

  if (palier === null || !stats) return null;

  const { titre, message } = texteCelebration(palier, stats);
  const prochain = palierAtteint(stats.contacts) + 20;

  return (
    <div
      // `pointer-events-none` sur le conteneur, réactivé sur la carte : la zone
      // autour reste cliquable. Une carte flottante qui avale les clics d'un
      // bouton placé dessous serait exactement le blocage qu'on refuse.
      className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto rounded-xl border border-emerald-500/30 bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-snug">{titre}</p>
          <button
            type="button"
            onClick={() => setPalier(null)}
            className="-mr-1 -mt-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
            aria-label="Fermer les félicitations"
          >
            ✕
          </button>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">{message}</p>

        {stats.parCanal.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {stats.parCanal.map((c) => (
              <div key={c.canal} className="flex items-baseline gap-1">
                <dt className="text-xs text-muted-foreground">{c.libelle}</dt>
                <dd className="text-sm font-semibold tabular-nums">{c.nombre}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Le palier suivant est une invitation, jamais une consigne : il n'est
            annoncé que s'il reste de quoi l'atteindre. */}
        {stats.restantes > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Prochain palier à {prochain} — rien ne t'oblige, la file reste ouverte.
          </p>
        )}
      </div>
    </div>
  );
}

export default CelebrationJournee;
