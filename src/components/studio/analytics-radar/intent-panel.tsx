// intent-panel.tsx — « À appeler maintenant » : la sortie utile du radar.
//
// Le reste du tableau de bord décrit ce qui s'est passé ; ce panneau dit quoi
// faire. Chaque ligne porte ses raisons, et chaque raison correspond à une
// mesure réelle (cf. src/lib/analytics-radar/intent.ts) — un commercial doit
// pouvoir décrocher son téléphone en sachant exactement ce que le prospect a
// fait, sans risquer d'affirmer quelque chose d'inventé.
import React from "react";
import { Icon } from "./icons";
import { Av } from "./parts";
import { anDur } from "./format";
import { CALL_WHEN_LABEL } from "@/lib/analytics-radar/intent";
import type { AnalyticsRadarIntentRow } from "./types";

const TONE: Record<AnalyticsRadarIntentRow["callWhen"], string> = {
  maintenant: "dg",
  aujourdhui: "wn",
  j1: "ac",
  j2: "",
  plus_tard: "",
};

function dayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  const days = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - d.getTime()) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export function IntentPanel({ rows, onPick }: { rows: AnalyticsRadarIntentRow[]; onPick?: (hostname: string) => void }) {
  if (!rows.length) {
    return <div className="a-empty">Aucun signal d'intention sur la période — personne n'a encore ouvert sa démo.</div>;
  }
  return (
    <div className="a-feed">
      {rows.map((r) => (
        <div className="a-ev" key={r.hostname} onClick={() => onPick?.(r.hostname)} style={{ cursor: onPick ? "pointer" : undefined }}>
          <Av name={r.companyName} color="#2F7AE0" size={22} radius={7} />
          <div style={{ minWidth: 0 }}>
            <div className="t">
              <b>{r.companyName}</b> <span style={{ letterSpacing: "-.05em" }}>{r.flame}</span>
              <span className={"a-tag " + TONE[r.callWhen]} style={{ marginLeft: 6 }}>
                {CALL_WHEN_LABEL[r.callWhen]}
              </span>
            </div>
            <div className="m">
              {r.sessions} visite{r.sessions > 1 ? "s" : ""} · {r.pageViews} page{r.pageViews > 1 ? "s" : ""}
              {r.engagementSec > 0 ? ` · ${anDur(r.engagementSec)}` : ""}
              {r.lastDay ? ` · ${dayLabel(r.lastDay)}` : ""}
            </div>
            <div className="m" style={{ color: "var(--tx-2)", marginTop: 3 }}>
              {r.reasons.slice(0, 3).join(" · ")}
            </div>
          </div>
          <span className="h">
            <Icon name="phone" className="ico s" />
          </span>
        </div>
      ))}
    </div>
  );
}
