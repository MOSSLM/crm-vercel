"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Flame, MonitorSmartphone, RefreshCw } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import {
  formatDuration,
  heatOf,
  isNoise,
  prettyPath,
  HEAT_LABEL,
  type SiteVisit,
  type SiteVisitSummary,
} from "@/lib/site-visits";

/**
 * Panneau « Activité démo » du cockpit d'appel.
 *
 * Il répond à la seule question qu'on se pose la main sur le combiné : est-ce
 * que ce prospect a regardé ce qu'on lui a envoyé, et à quel point. D'où
 * l'ordre : le verdict d'abord (pastille + phrase), les chiffres ensuite, le
 * détail des sessions en dernier — c'est l'inverse de l'ordre dans lequel la
 * donnée arrive, mais l'ordre dans lequel elle se lit en trois secondes.
 */

function relDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (t >= startToday) return `Aujourd'hui ${time}`;
  if (t >= startToday - 86_400_000) return `Hier ${time}`;
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${time}`;
}

interface Props {
  entrepriseId: number | null;
}

export function DemoActivityPanel({ entrepriseId }: Props) {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [summary, setSummary] = useState<SiteVisitSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/site-visits?entreprise_id=${entrepriseId}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { visits: SiteVisit[]; summary: SiteVisitSummary | null };
      setVisits(data.visits ?? []);
      setSummary(data.summary ?? null);
    } catch {
      // Le cockpit doit rester utilisable même si ce panneau échoue : on ne
      // remonte pas de toast, l'état vide fait office de message.
      setVisits([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!entrepriseId) {
    return (
      <div className="blk">
        <h4>Activité démo</h4>
        <div className="ck-empty">Sélectionnez un prospect.</div>
      </div>
    );
  }

  const verdict = heatOf(summary);

  return (
    <div className="blk">
      <h4>
        Activité démo
        <button
          type="button"
          className="ck-dv-refresh"
          onClick={() => void load()}
          aria-label="Rafraîchir l'activité démo"
        >
          <RefreshCw className={loading ? "ico-xs spin" : "ico-xs"} />
        </button>
      </h4>

      {!summary || summary.visits === 0 ? (
        <div className="ck-empty">
          {loading ? "Chargement…" : "Démo jamais ouverte — l'accroche ne peut pas s'appuyer dessus."}
        </div>
      ) : (
        <>
          <div className={`ck-dv-verdict h-${verdict.heat}`}>
            <Flame className="ico-sm" />
            <div className="tx">
              <strong>{HEAT_LABEL[verdict.heat]}</strong>
              <span>{verdict.reason}</span>
            </div>
          </div>

          <div className="ck-dv-stats">
            <div className="st">
              <b>{summary.visits}</b>
              <span>{summary.visits > 1 ? "ouvertures" : "ouverture"}</span>
            </div>
            <div className="st">
              <b>{formatDuration(summary.total_duration_ms)}</b>
              <span>au total</span>
            </div>
            <div className="st">
              <b>{summary.distinct_days}</b>
              <span>{summary.distinct_days > 1 ? "jours" : "jour"}</span>
            </div>
          </div>

          <ul className="ck-dv-list">
            {visits.map((v) => (
              <li key={v.id} className={isNoise(v) ? "noise" : ""}>
                <div className="hd">
                  <span className="dt">{relDay(v.started_at)}</span>
                  <span className="du">{formatDuration(v.duration_ms)}</span>
                </div>
                <div className="mt">
                  {v.contact_name ? <span className="who">{v.contact_name}</span> : null}
                  <span className="pg">
                    <Eye className="ico-xs" />
                    {v.paths.slice(0, 3).map(prettyPath).join(" · ")}
                    {v.paths.length > 3 ? ` +${v.paths.length - 3}` : ""}
                  </span>
                  {v.device ? (
                    <span className="dv">
                      <MonitorSmartphone className="ico-xs" />
                      {v.device === "mobile" ? "Mobile" : "Ordi"}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
