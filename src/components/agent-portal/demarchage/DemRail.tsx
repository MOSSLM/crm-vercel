"use client";

import { Icon } from "./DemIcon";
import { one } from "@/components/agent-portal/format";
import { demCh } from "./channels";
import type { DemarchageQueueMeta, DemarchageTask } from "./types";
import {
  DAILY_QUOTA,
  countByKind,
  isLate,
  type DemarchageBucketKey,
  type DemarchageBuckets,
} from "@/lib/agent-portal/demarchage-buckets";

/** Les jours de la file — mêmes libellés que la maquette, dates réelles.
 *  Les deux premiers onglets ne sont pas des jours mais des signaux mesurés :
 *  un prospect qui vient de rouvrir sa démo prime sur n'importe quelle
 *  échéance décidée à l'avance.
 *
 *  Il n'y a PLUS d'onglet « Retard » : la file ne planifie plus à l'heure mais
 *  à la cadence, et une relance en retard repart simplement en tête du plan du
 *  jour. Le retard reste dit, mais sur la ligne concernée. */
export const DAY_TABS: { id: DemarchageBucketKey; lb: string }[] = [
  { id: "missed", lb: "Non rappelés" },
  { id: "conversation", lb: "En discussion" },
  { id: "hot", lb: "Chauds" },
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

/** Les jours que le plan remplit — les deux paniers de signal ignorent la cadence. */
const PLANNED: DemarchageBucketKey[] = ["today", "tomorrow", "week", "later"];

/** Durée d'engagement, lisible d'un coup d'œil. */
const dureeCourte = (sec: number) =>
  sec >= 60 ? `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, "0")}` : `${Math.round(sec)}s`;

/** « aujourd'hui » / « hier » / « il y a 3 j » à partir d'une date ISO. */
function jourRelatif(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  const j = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d.getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return "hier";
  return `il y a ${j} j`;
}

/** Sous-titre du bloc session : la date réelle du jour regardé. */
function dayLabel(day: DemarchageBucketKey): string {
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  if (day === "missed") return "signal chaud jamais rappelé";
  if (day === "conversation") return "ils ont répondu — à traiter maintenant";
  if (day === "hot") return "signaux d'intention du moment";
  if (day === "week") return "les 7 prochains jours";
  if (day === "later") return "au-delà";
  return fmt.format(d);
}

/**
 * Une tuile de cadence : ce que le jour regardé contient RÉELLEMENT pour ce
 * canal, et la cadence de référence quand il y en a une.
 *
 * Le nombre est toujours celui des tâches présentes — jamais le quota. Aucun
 * appel en séquence aujourd'hui, la tuile affiche 0 : c'est l'information, pas
 * un trou à combler.
 */
function QuotaTile({
  ic,
  lb,
  n,
  quota,
  reste,
}: {
  ic: string;
  lb: string;
  n: number;
  /** Cadence quotidienne du canal, `null` quand il n'a pas de plafond. */
  quota: number | null;
  /** Tâches du même canal renvoyées aux jours suivants, faute de place. */
  reste: number;
}) {
  return (
    <div data-empty={n === 0 ? "1" : undefined}>
      <span className="k">
        <Icon name={ic} className="ico-xs" />
        {lb}
      </span>
      <div className="n">
        {n}
        {quota != null && n > 0 && <span className="q">/{quota}</span>}
      </div>
      {reste > 0 && <div className="r">+{reste} reportés</div>}
    </div>
  );
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
  /** La liste RÉELLEMENT affichée : le panier du jour, passé au filtre de canal. */
  tasks: DemarchageTask[];
  meta: DemarchageQueueMeta;
  agentName: string | null;
  loading: boolean;
  sel: string | null;
  onPick: (id: string) => void;
}) {
  // Les tuiles comptent le panier ENTIER, pas la liste filtrée : cliquer
  // « Appels » ne doit pas faire tomber le compteur Messages à zéro.
  const dayTasks = buckets[day];
  const parCanal = countByKind(dayTasks);
  const planifie = PLANNED.includes(day);

  // Ce qui, du même canal, a été renvoyé aux jours suivants faute de place —
  // la moitié de l'explication du chiffre affiché.
  const apres = PLANNED.slice(PLANNED.indexOf(day) + 1);
  const reporte = planifie ? countByKind(apres.flatMap((k) => buckets[k])) : {};

  const nb = meta.done_today;
  // La journée, c'est ce qui a été fait plus ce qui reste à faire aujourd'hui —
  // signaux compris, eux aussi se traitent le jour même.
  const tot = nb + buckets.today.length + buckets.hot.length + buckets.missed.length;

  const nbLinkedin = parCanal.linkedin ?? 0;
  const nbWait = parCanal.wait ?? 0;

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
          <QuotaTile
            ic="phone"
            lb="Appels"
            n={parCanal.call ?? 0}
            quota={planifie ? DAILY_QUOTA.call : null}
            reste={reporte.call ?? 0}
          />
          <QuotaTile
            ic="whatsapp"
            lb="WhatsApp"
            n={parCanal.whatsapp ?? 0}
            quota={planifie ? DAILY_QUOTA.whatsapp : null}
            reste={reporte.whatsapp ?? 0}
          />
          {/* LinkedIn et les attentes n'apparaissent que s'il y en a : une
              tuile vide sur un canal qu'on n'utilise pas est du bruit. */}
          {nbLinkedin > 0 && (
            <QuotaTile
              ic="linkedin"
              lb="LinkedIn"
              n={nbLinkedin}
              quota={planifie ? DAILY_QUOTA.linkedin : null}
              reste={reporte.linkedin ?? 0}
            />
          )}
          {nbWait > 0 && <QuotaTile ic="clock" lb="Attentes" n={nbWait} quota={null} reste={0} />}
        </div>
        {planifie && (
          <div className="cad">
            <Icon name="info" className="ico-xs" />
            cadence : {DAILY_QUOTA.call} appels et {DAILY_QUOTA.whatsapp} premiers contacts WhatsApp par
            jour — le surplus part au lendemain. Les discussions en cours ne comptent pas.
          </div>
        )}
        {day === "conversation" && (
          <div className="cad">
            <Icon name="info" className="ico-xs" />
            Ils ont répondu : on répond à ce qui vient, sans plafond ni report.
          </div>
        )}
      </div>

      <div className="dm-days" role="tablist" aria-label="Jour de la file">
        {DAY_TABS.map((d) => {
          const n = buckets[d.id].length;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              className="dm-day"
              aria-selected={day === d.id}
              data-live={d.id === "conversation" ? "1" : undefined}
              onClick={() => setDay(d.id)}
            >
              <span className="l">{d.lb}</span>
              {/* Rien à faire ce jour-là : on l'écrit « — », pas « 0 act. ». */}
              <span className="n">{n > 0 ? `${n} act.` : "—"}</span>
            </button>
          );
        })}
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
          <Icon name="layers" className="ico-xs" />
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

        {tasks.map((t, i) => {
          const ent = one(t.entreprise);
          const contact = one(t.contact);
          const ch = demCh(t.kind);
          const name =
            ent?.name ||
            `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
            "Prospect";
          const state = t.id === sel ? "now" : "next";
          const missed = t.intent?.missed === true;
          const hot = t.intent?.callWhen === "maintenant" || t.intent?.callWhen === "aujourdhui";
          const heat = missed ? "missed" : hot ? "hot" : undefined;
          const late = isLate(t);
          return (
            <div
              key={t.id}
              className="dm-tk"
              data-s={state}
              data-heat={heat}
              aria-selected={t.id === sel}
              onClick={() => onPick(t.id)}
            >
              {/* Le rang dans la journée, pas une heure : une tâche manuelle se
                  fait « en troisième », jamais « à 9 h 04 ». */}
              <span className="tm">{i + 1}</span>
              <div className="bd">
                <div className="nm">
                  <span className="t">{name}</span>
                  {/* Le signal a sa propre case, à l'écart du nom : collé au
                      texte, il se lisait comme une partie de la raison sociale
                      et ne sautait plus aux yeux. */}
                  {t.intent?.flame ? (
                    <span className="fl" data-heat={heat} title={t.intent.reasons.join(" · ")}>
                      {t.intent.flame}
                    </span>
                  ) : null}
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
                  {late && <span className="st late">échéance passée</span>}
                </div>
                {/* Ce que le prospect a fait de sa démo : l'information qui
                    décide s'il faut décrocher maintenant ou laisser la
                    séquence suivre son cours. Lisible sans ouvrir la fiche. */}
                {t.intent && t.intent.sessions > 0 && (
                  <div className="vu" data-heat={heat}>
                    <Icon name="eye" className="ico-xs" />
                    {missed && t.intent.daysSinceVisit != null
                      ? `Chaud depuis ${t.intent.daysSinceVisit} j, jamais rappelé`
                      : `Démo vue ${t.intent.sessions}×${
                          t.intent.engagementSec > 0 ? ` · ${dureeCourte(t.intent.engagementSec)}` : ""
                        }${t.intent.lastDay ? ` · ${jourRelatif(t.intent.lastDay)}` : ""}`}
                  </div>
                )}
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
