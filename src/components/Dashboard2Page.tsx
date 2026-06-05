"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Sparkles,
  Globe,
  FileSearch,
  ListTodo,
  Layers,
  Building2,
  TrendingUp,
  ArrowRight,
  Phone,
  Mail,
  CalendarCheck,
  Activity as ActivityIcon,
} from "lucide-react";
import { useAppData } from "./AppDataContext";
import { supabase } from "@/utils/supabase/client";
import logger from "../utils/logger";

/* ── Helpers ───────────────────────────────────────────────── */

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const dateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Lundi 00:00 → dimanche 23:59 de la semaine contenant `ref`. */
const getWeekRange = (ref = new Date()) => {
  const day = ref.getDay(); // 0 = dimanche
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(ref.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
};

const isoWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/** Répartit un objectif hebdo sur lundi→vendredi, somme exacte conservée. */
const distributeWeekly = (weekly: number): number[] => {
  const w = Math.max(0, Math.round(weekly || 0));
  const base = Math.floor(w / 5);
  const rem = w % 5;
  return [0, 1, 2, 3, 4].map((i) => base + (i < rem ? 1 : 0));
};

const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} j`;
};

const fmtInt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

const eur = (n: number) => {
  if (n >= 1000) return `${Math.round(n / 1000)}k€`;
  return `${Math.round(n)}€`;
};

/* ── Types locaux ──────────────────────────────────────────── */

interface TaskRow {
  id: string;
  titre: string;
  description: string | null;
  status: "a_faire" | "en_cours" | "termine";
  priority: "haute" | "moyenne" | "basse";
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
}

interface ActivityRow {
  id: number;
  occurred_at: string;
  activity_type: string | null;
  title: string | null;
  description: string | null;
}

interface WeekGoals {
  qualifier: number;
  enrichir: number;
  site: number;
  audit: number;
}

interface WeekDone {
  qualifier: number;
  enrichir: number;
  site: number;
  audit: number;
}

/* ── Composant principal ───────────────────────────────────── */

export const Dashboard2Page: React.FC = () => {
  const {
    companies,
    opportunities,
    pipelineStages,
    totalCompanies,
    totalQualifiedCompanies,
  } = useAppData();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [goals, setGoals] = useState<WeekGoals>({ qualifier: 0, enrichir: 0, site: 0, audit: 0 });
  const [done, setDone] = useState<WeekDone>({ qualifier: 0, enrichir: 0, site: 0, audit: 0 });

  const today = useMemo(() => new Date(), []);
  const { monday, sunday } = useMemo(() => getWeekRange(today), [today]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    }),
    [monday]
  );
  // index 0..6 (lun..dim) du jour courant
  const todayIdx = useMemo(() => {
    const day = today.getDay();
    return day === 0 ? 6 : day - 1;
  }, [today]);
  const todayKey = useMemo(() => dateKey(today), [today]);

  /* — Tâches du jour — */
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .select("id,titre,description,status,priority,due_date,start_at,end_at")
        .is("project_id", null)
        .limit(300);
      if (error) {
        logger.error("Dashboard 2 — tâches:", error);
        return;
      }
      setTasks((data as TaskRow[] | null) ?? []);
    };
    void load();
  }, []);

  /* — Objectifs hebdo + réalisé de la semaine + activité — */
  useEffect(() => {
    const load = async () => {
      const startISO = monday.toISOString();
      const endISO = sunday.toISOString();
      const mondayDate = dateKey(monday);

      try {
        const [
          goalRow,
          qualifiedWeek,
          enrichedWeek,
          sitesWeek,
          auditsWeek,
          activityRows,
        ] = await Promise.all([
          supabase
            .from("kpi_targets")
            .select("leads_qualifies,entreprises_enrichies,sites_crees,audits_crees")
            .eq("scope", "global")
            .is("owner_id", null)
            .eq("period_unit", "week")
            .eq("period_start", mondayDate)
            .maybeSingle(),
          supabase
            .from("entreprises")
            .select("id", { count: "exact", head: true })
            .eq("qualifie", true)
            .gte("updated_at", startISO)
            .lte("updated_at", endISO),
          supabase
            .from("entreprises")
            .select("id", { count: "exact", head: true })
            .gte("enriched_at", startISO)
            .lte("enriched_at", endISO),
          supabase
            .from("sites")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startISO)
            .lte("created_at", endISO),
          supabase
            .from("audits")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startISO)
            .lte("created_at", endISO),
          supabase
            .from("activity_log")
            .select("id,occurred_at,activity_type,title,description")
            .order("occurred_at", { ascending: false })
            .limit(6),
        ]);

        const g = goalRow.data as
          | { leads_qualifies?: number; entreprises_enrichies?: number; sites_crees?: number; audits_crees?: number }
          | null;
        setGoals({
          qualifier: Number(g?.leads_qualifies ?? 0),
          enrichir: Number(g?.entreprises_enrichies ?? 0),
          site: Number(g?.sites_crees ?? 0),
          audit: Number(g?.audits_crees ?? 0),
        });
        setDone({
          qualifier: qualifiedWeek.count ?? 0,
          enrichir: enrichedWeek.count ?? 0,
          site: sitesWeek.count ?? 0,
          audit: auditsWeek.count ?? 0,
        });
        setActivity((activityRows.data as ActivityRow[] | null) ?? []);
      } catch (err) {
        logger.error("Dashboard 2 — chargement:", err);
      }
    };
    void load();
  }, [monday, sunday]);

  /* — Backlog calculé côté client — */
  const backlog = useMemo(() => {
    let aQualifier = 0;
    let aEnrichir = 0;
    for (const c of companies) {
      if (!c.qualifie && !c.hidden_in_qualification) aQualifier += 1;
      if (c.qualifie && !c.manually_enriched && !c.enriched_at) aEnrichir += 1;
    }
    return { aQualifier, aEnrichir };
  }, [companies]);

  /* — Tâches du jour — */
  const todayTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        const d =
          t.due_date ??
          t.start_at?.slice(0, 10) ??
          t.end_at?.slice(0, 10) ??
          null;
        return d === todayKey;
      })
      .sort((a, b) => {
        const ta = a.start_at ?? "99";
        const tb = b.start_at ?? "99";
        return ta.localeCompare(tb);
      });
  }, [tasks, todayKey]);

  const tasksDone = todayTasks.filter((t) => t.status === "termine").length;

  /* — Définition des 4 métriques — */
  const metrics = useMemo(
    () => [
      {
        key: "qualifier",
        label: "Entreprises à qualifier",
        icon: CheckCircle2,
        tint: "var(--accent-tint)",
        color: "var(--accent-2)",
        weekly: goals.qualifier,
        done: done.qualifier,
        backlog: backlog.aQualifier,
        href: "/qualification",
      },
      {
        key: "enrichir",
        label: "Entreprises à enrichir",
        icon: Sparkles,
        tint: "var(--magic-tint)",
        color: "var(--magic)",
        weekly: goals.enrichir,
        done: done.enrichir,
        backlog: backlog.aEnrichir,
        href: "/qualified",
      },
      {
        key: "site",
        label: "Sites à créer",
        icon: Globe,
        tint: "var(--info-tint)",
        color: "var(--info)",
        weekly: goals.site,
        done: done.site,
        backlog: null,
        href: "/site-builder",
      },
      {
        key: "audit",
        label: "Audits à créer",
        icon: FileSearch,
        tint: "var(--warn-tint)",
        color: "var(--warn)",
        weekly: goals.audit,
        done: done.audit,
        backlog: null,
        href: "/audits",
      },
    ],
    [goals, done, backlog]
  );

  // Objectif du jour = somme des cibles journalières des 4 métriques
  const todayTarget = useMemo(() => {
    if (todayIdx > 4) return 0;
    return metrics.reduce((acc, m) => acc + distributeWeekly(m.weekly)[todayIdx], 0);
  }, [metrics, todayIdx]);

  /* — Pipeline (répartition des opportunités) — */
  const pipelineRows = useMemo(() => {
    const stageById = new Map(pipelineStages.map((s) => [s.id, s]));
    const counts = new Map<number, number>();
    for (const o of opportunities) {
      if (o.stage_id == null) continue;
      counts.set(o.stage_id, (counts.get(o.stage_id) ?? 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .map(([stageId, count]) => ({
        stageId,
        count,
        nom: stageById.get(stageId)?.nom ?? `Étape ${stageId}`,
        ordre: stageById.get(stageId)?.ordre ?? 999,
      }))
      .sort((a, b) => a.ordre - b.ordre)
      .slice(0, 8);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return { rows, max };
  }, [opportunities, pipelineStages]);

  const pipelineValue = useMemo(
    () => opportunities.reduce((acc, o) => acc + (Number(o.montant) || 0), 0),
    [opportunities]
  );

  /* — Rendu — */
  const kpiFootStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-3)",
    marginTop: "auto",
  };
  const dateLabel = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="studio-surface da2 flex min-h-full flex-col px-3 py-4 md:p-6">
      <div className="ws-header">
        <div>
          <div className="ws-eyebrow">{dateLabel} · semaine {isoWeekNumber(today)}</div>
          <h1>
            Plan de <em>la semaine</em>
          </h1>
          <div className="sub">Votre plan d&apos;action de la semaine, en un coup d&apos;œil.</div>
        </div>
        <span className="pill">Beta · Dashboard 2</span>
      </div>

      <div className="da2-dash-grid">
          {/* ── GAUCHE — Tâches du jour ── */}
          <aside className="card" style={{ padding: "14px 18px 12px" }}>
            <div className="ws-eyebrow" style={{ marginBottom: 6 }}>
              {dateLabel} · semaine {isoWeekNumber(today)}
            </div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
              Aujourd&apos;hui
            </h3>
            <div className="da2-greet-sub">
              {todayTasks.length === 0
                ? "Aucune tâche planifiée."
                : `${todayTasks.length} tâche${todayTasks.length > 1 ? "s" : ""} · ${tasksDone} terminée${tasksDone > 1 ? "s" : ""}.`}
            </div>

            {todayTasks.length === 0 ? (
              <div className="da2-today-empty">
                Rien au programme — concentrez-vous sur vos objectifs du jour.
              </div>
            ) : (
              <div className="da2-timeline">
                {todayTasks.map((t) => {
                  const state =
                    t.status === "termine" ? "done" : t.status === "en_cours" ? "now" : "next";
                  const time = t.start_at
                    ? new Date(t.start_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  return (
                    <div key={t.id} className="da2-tl-item" data-state={state}>
                      <div className="da2-h">{time}</div>
                      <div className="da2-ttl">{t.titre}</div>
                      {t.description && <div className="da2-det">{t.description}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="da2-today-foot">
              <span className="pill">{todayTasks.length - tasksDone} à faire</span>
              <Link href="/calendar" className="btn ghost sm">
                Calendrier <ArrowRight className="ico-sm" />
              </Link>
            </div>
          </aside>

          {/* ── DROITE — Contenu principal ── */}
          <div className="da2-main">
            {/* Plan de la semaine */}
            <div className="card">
              <div className="card-hd">
                <h3>Plan de la semaine</h3>
                <span className="meta">objectif hebdo ÷ 5 · lun → ven</span>
                <Link href="/objectifs" className="btn ghost sm" style={{ marginLeft: "auto" }}>
                  Modifier les objectifs <ArrowRight className="ico-sm" />
                </Link>
              </div>
              <div className="da2-card-bd" style={{ padding: "4px 18px 18px" }}>
                <div className="da2-week">
                  {/* En-tête */}
                  <div className="da2-week-cell da2-week-head da2-week-label">
                    <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--da2-font-mono)" }}>
                      ACTIVITÉ
                    </span>
                  </div>
                  {weekDates.map((d, i) => (
                    <div
                      key={i}
                      className={`da2-week-cell da2-week-head${i === todayIdx ? " da2-today-col" : ""}${i > 4 ? " da2-weekend" : ""}`}
                    >
                      <span className="da2-dow">{DOW[i]}</span>
                      <span className="da2-dom">{d.getDate()}</span>
                    </div>
                  ))}

                  {/* Lignes métriques */}
                  {metrics.map((m) => {
                    const daily = distributeWeekly(m.weekly);
                    const pct = m.weekly > 0 ? Math.min(100, (m.done / m.weekly) * 100) : 0;
                    const Icon = m.icon;
                    return (
                      <React.Fragment key={m.key}>
                        <div className="da2-week-cell da2-week-label">
                          <div className="da2-ml-top">
                            <span
                              className="da2-ml-ico"
                              style={{ background: m.tint, color: m.color }}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="da2-ml-name">{m.label}</span>
                          </div>
                          <div className="da2-ml-sub">
                            <span>
                              <b>{m.done}</b>/{m.weekly || "—"} sem.
                            </span>
                            {m.backlog != null && (
                              <span>
                                <b>{fmtInt(m.backlog)}</b> en attente
                              </span>
                            )}
                          </div>
                          <div className="da2-mini-bar">
                            <i
                              style={{
                                width: `${pct}%`,
                                background: pct >= 100 ? "var(--ok)" : m.color,
                              }}
                            />
                          </div>
                        </div>
                        {weekDates.map((_, i) => {
                          if (i > 4) {
                            return (
                              <div key={i} className="da2-week-cell da2-weekend">
                                <span className="da2-week-free">libre</span>
                              </div>
                            );
                          }
                          const val = daily[i];
                          return (
                            <div
                              key={i}
                              className={`da2-week-cell${i === todayIdx ? " da2-today-col" : ""}`}
                            >
                              <span className={`da2-week-target${val === 0 ? " da2-zero" : ""}`}>
                                {val}
                              </span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bento KPI */}
            <div className="kpi-strip">
              <div className="kpi">
                <div className="lb"><ListTodo className="ico-xs" />à traiter aujourd&apos;hui</div>
                <div className="vl">
                  {todayIdx > 4 ? "0" : todayTarget}
                  <small>entreprises</small>
                </div>
                <div style={kpiFootStyle}>
                  {todayIdx > 4 ? "week-end · repos bien mérité" : "réparti sur les 4 activités"}
                </div>
              </div>

              <div className="kpi">
                <div className="lb"><Layers className="ico-xs" />pipeline ouvert</div>
                <div className="vl">
                  {eur(pipelineValue)}
                  <small>{opportunities.length} deals</small>
                </div>
                <div style={kpiFootStyle}>valeur totale des opportunités</div>
              </div>

              <div className="kpi">
                <div className="lb"><Building2 className="ico-xs" />entreprises qualifiées</div>
                <div className="vl">
                  {fmtInt(totalQualifiedCompanies)}
                  <small>/ {fmtInt(totalCompanies)}</small>
                </div>
                <div style={kpiFootStyle}>{fmtInt(backlog.aQualifier)} encore à qualifier</div>
              </div>

              <div className="kpi">
                <div className="lb"><TrendingUp className="ico-xs" />tâches du jour</div>
                <div className="vl">
                  {todayTasks.length}
                  <small>{tasksDone} faites</small>
                </div>
                <div style={kpiFootStyle}>{todayTasks.length - tasksDone} restantes</div>
              </div>
            </div>

            {/* Rangée 2 — Pipeline + Activité */}
            <div className="da2-row2">
              <div className="card">
                <div className="card-hd">
                  <h3>Pipeline commercial</h3>
                  <span className="meta">opportunités par étape</span>
                </div>
                <div className="da2-card-bd">
                  {pipelineRows.rows.length === 0 ? (
                    <div className="da2-empty">Aucune opportunité.</div>
                  ) : (
                    pipelineRows.rows.map((r) => (
                      <div key={r.stageId} className="da2-stage">
                        <span className="da2-stage-nm">{r.nom}</span>
                        <span className="da2-stage-ct">{r.count}</span>
                        <span className="da2-stage-bar">
                          <i style={{ width: `${(r.count / pipelineRows.max) * 100}%` }} />
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-hd">
                  <h3>Activité récente</h3>
                  <span className="meta">workspace</span>
                </div>
                <div className="da2-card-bd">
                  {activity.length === 0 ? (
                    <div className="da2-empty">Aucune activité enregistrée.</div>
                  ) : (
                    <div className="da2-activity">
                      {activity.map((a) => {
                        const type = (a.activity_type ?? "").toLowerCase();
                        let cls = "";
                        let Ico = ActivityIcon;
                        if (/call|appel|phone/.test(type)) {
                          cls = "call";
                          Ico = Phone;
                        } else if (/mail|email/.test(type)) {
                          cls = "email";
                          Ico = Mail;
                        } else if (/rdv|meeting|cal/.test(type)) {
                          cls = "cal";
                          Ico = CalendarCheck;
                        } else if (/sign|win|gagn|closing/.test(type)) {
                          cls = "win";
                          Ico = CheckCircle2;
                        }
                        return (
                          <div key={a.id} className="da2-act-row">
                            <span className={`da2-act-ic ${cls}`}>
                              <Ico size={13} />
                            </span>
                            <div>
                              <div className="da2-act-tx">{a.title ?? "Activité"}</div>
                              {a.description && (
                                <div className="da2-act-det">{a.description}</div>
                              )}
                            </div>
                            <div className="da2-act-h">{relativeTime(a.occurred_at)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Dashboard2Page;
