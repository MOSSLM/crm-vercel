"use client";

import { Icon } from "./DemIcon";
import { one } from "@/components/agent-portal/format";
import { demCh } from "./channels";
import type { DemarchageQueueMeta, DemarchageTask } from "./types";
import type { DemarchageBucketKey, DemarchageBuckets } from "@/lib/agent-portal/demarchage-buckets";

/** Les jours de la file — mêmes libellés que la maquette, dates réelles. */
export const DAY_TABS: { id: DemarchageBucketKey; lb: string }[] = [
  { id: "overdue", lb: "Retard" },
  { id: "today", lb: "Aujourd'hui" },
  { id: "tomorrow", lb: "Demain" },
  { id: "week", lb: "Cette semaine" },
  { id: "later", lb: "Plus tard" },
];

const FILTERS: [string, string][] = [
  ["all", "Tout"],
  ["call", "Appels"],
  ["msg", "Messages"],
  ["wait", "Attentes"],
];

const hm = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "—";
  }
};

/** Sous-titre du bloc session : la date réelle du jour regardé. */
function dayLabel(day: DemarchageBucketKey): string {
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  if (day === "overdue") return "à rattraper";
  if (day === "week") return "les 7 prochains jours";
  if (day === "later") return "au-delà";
  return fmt.format(d);
}

export function DemRail({
  buckets,
  day,
  setDay,
  filt,
  setFilt,
  tasks,
  meta,
  agentName,
  loading,
  sel,
  onPick,
}: {
  buckets: DemarchageBuckets<DemarchageTask>;
  day: DemarchageBucketKey;
  setDay: (d: DemarchageBucketKey) => void;
  filt: string;
  setFilt: (f: string) => void;
  tasks: DemarchageTask[];
  meta: DemarchageQueueMeta;
  agentName: string | null;
  loading: boolean;
  sel: string | null;
  onPick: (id: string) => void;
}) {
  const tot = meta.due_today;
  const nb = meta.done_today;
  const cnt = (fn: (t: DemarchageTask) => boolean) => tasks.filter(fn).length;

  return (
    <aside className="dm-rail">
      <div className="dm-sess">
        <div className="lb">Ma file · {dayLabel(day)}</div>
        <div className="vl">
          {nb}
          <span>/{tot}</span>
        </div>
        <div className="sub">
          actions traitées{agentName ? ` — attribuées à ${agentName}` : ""}
        </div>
        <div className="dm-prog">
          <i style={{ width: `${tot ? Math.min(100, (nb / tot) * 100) : 0}%` }} />
        </div>
        <div className="mini">
          <div>
            <span className="k">
              <Icon name="phone" className="ico-xs" />
              Appels
            </span>
            <div className="n">{cnt((t) => t.kind === "call")}</div>
          </div>
          <div>
            <span className="k">
              <Icon name="whatsapp" className="ico-xs" />
              Messages
            </span>
            <div className="n">{cnt((t) => t.kind === "whatsapp" || t.kind === "linkedin")}</div>
          </div>
          <div>
            <span className="k">
              <Icon name="clock" className="ico-xs" />
              Attentes
            </span>
            <div className="n">{cnt((t) => t.kind === "wait")}</div>
          </div>
        </div>
      </div>

      <div className="dm-days" role="tablist" aria-label="Jour de la file">
        {DAY_TABS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            className="dm-day"
            aria-selected={day === d.id}
            data-late={d.id === "overdue" ? "1" : undefined}
            onClick={() => setDay(d.id)}
          >
            <span className="l">{d.lb}</span>
            <span className="n">{buckets[d.id].length} act.</span>
          </button>
        ))}
      </div>

      <div className="dm-filt">
        {FILTERS.map(([id, lb]) => (
          <button key={id} className="dm-chip" aria-pressed={filt === id} onClick={() => setFilt(id)}>
            {lb}
          </button>
        ))}
      </div>

      <div className="dm-fr">
        <div className="dm-fr-h">
          <Icon name="clock" className="ico-xs" />
          ordre de passage
          <span className="ln" />
        </div>

        {loading && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>Chargement…</div>
        )}
        {!loading && tasks.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>
            Rien dans ce filtre.
          </div>
        )}

        {tasks.map((t) => {
          const ent = one(t.entreprise);
          const contact = one(t.contact);
          const ch = demCh(t.kind);
          const name =
            ent?.name ||
            `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
            "Prospect";
          const state = t.id === sel ? "now" : "next";
          return (
            <div
              key={t.id}
              className="dm-tk"
              data-s={state}
              aria-selected={t.id === sel}
              onClick={() => onPick(t.id)}
            >
              <span className="tm">{hm(t.due_at)}</span>
              <div className="bd">
                <div className="nm">
                  <span className="t">{name}</span>
                </div>
                <div className="wy">{t.sequence?.stepLabel || t.title || ch.lb}</div>
                <div className="mt">
                  <span className="kc" style={{ background: ch.c + "1a", color: ch.c }}>
                    <Icon name={ch.ic} className="ico-xs" />
                    {ch.lb}
                  </span>
                  {t.sequence?.stepIndex != null && (
                    <span className="st">étape {t.sequence.stepIndex}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="dm-rail-ft">
        <Icon name="info" className="ico-xs" />
        Chaque relance de séquence crée sa propre ligne — appels compris.
      </div>
    </aside>
  );
}
