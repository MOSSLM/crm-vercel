"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import {
  Users,
  Globe,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  Settings2,
  ChevronRight,
  CheckCircle2,
  X,
  Save,
  GitBranch,
  MessageCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesObjectives {
  qualifications: number;
  sites: number;
  audits: number;
  messages: number;
  relances: number;
  appels: number;
}

interface ActionCounter {
  key: keyof SalesObjectives;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  href: string;
  count: number;
  objective: number;
  companies: CompanyItem[];
}

interface CompanyItem {
  id: number;
  name: string;
  tel?: string | null;
  email?: string | null;
  site_web?: string | null;
}

const OBJECTIVES_KEY = "crm-sales-objectives";

const DEFAULT_OBJECTIVES: SalesObjectives = {
  qualifications: 30,
  sites: 25,
  audits: 20,
  messages: 20,
  relances: 20,
  appels: 15,
};

function loadObjectives(): SalesObjectives {
  try {
    const stored = localStorage.getItem(OBJECTIVES_KEY);
    if (stored) return { ...DEFAULT_OBJECTIVES, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_OBJECTIVES;
}

function saveObjectives(obj: SalesObjectives) {
  localStorage.setItem(OBJECTIVES_KEY, JSON.stringify(obj));
}

// ─── Pipeline mini view ───────────────────────────────────────────────────────

interface PipelineStageCount {
  id: number;
  nom: string;
  ordre: number;
  count: number;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function SalesDashboard() {
  const router = useRouter();
  const [objectives, setObjectives] =
    useState<SalesObjectives>(DEFAULT_OBJECTIVES);
  const [editingObjectives, setEditingObjectives] =
    useState<SalesObjectives | null>(null);
  const [showObjectivesModal, setShowObjectivesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState<
    Record<keyof SalesObjectives, { count: number; companies: CompanyItem[] }>
  >({
    qualifications: { count: 0, companies: [] },
    sites: { count: 0, companies: [] },
    audits: { count: 0, companies: [] },
    messages: { count: 0, companies: [] },
    relances: { count: 0, companies: [] },
    appels: { count: 0, companies: [] },
  });
  const [pipelineStages, setPipelineStages] = useState<PipelineStageCount[]>(
    [],
  );
  const [expandedCard, setExpandedCard] = useState<
    keyof SalesObjectives | null
  >(null);

  useEffect(() => {
    setObjectives(loadObjectives());
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Entreprises à qualifier
      const { data: toQualify } = await supabase
        .from("entreprises")
        .select("id, name, telephone, email, site_web_canonique")
        .eq("qualifie", false)
        .or("hidden_in_qualification.is.null,hidden_in_qualification.eq.false")
        .limit(200);

      // 2. Entreprises qualifiées sans site (lead magnet)
      const { data: qualifiedAll } = await supabase
        .from("entreprises")
        .select("id, name, telephone, email, site_web_canonique")
        .eq("qualifie", true)
        .limit(200);

      const qualifiedIds = (qualifiedAll ?? []).map((c) => c.id);

      // Opportunités avec lead magnet déjà créé
      let oppWithLm: number[] = [];
      if (qualifiedIds.length > 0) {
        const { data: oppsLm } = await supabase
          .from("opportunites")
          .select("entreprise_id")
          .in("entreprise_id", qualifiedIds)
          .eq("lead_magnet", true);
        oppWithLm = (oppsLm ?? [])
          .map((o) => o.entreprise_id)
          .filter(Boolean) as number[];
      }
      const sitesToPrepare = (qualifiedAll ?? []).filter(
        (c) => !oppWithLm.includes(c.id),
      );

      // 3. Opportunités avec LM prêt mais sans audit ready
      const { data: lmProjects } = await supabase
        .from("lead_magnet_projects")
        .select("id, opportunite_id")
        .eq("statut", "ready")
        .limit(200);

      const lmOppIds = (lmProjects ?? [])
        .map((p) => p.opportunite_id)
        .filter(Boolean) as string[];

      let auditsToGenerate: CompanyItem[] = [];
      if (lmOppIds.length > 0) {
        // Check which of these opps have an audit already
        const { data: existingAudits } = await supabase
          .from("audits")
          .select("opportunite_id")
          .in("opportunite_id", lmOppIds)
          .eq("statut", "ready");
        const auditedOppIds = new Set(
          (existingAudits ?? []).map((a) => a.opportunite_id),
        );
        const needAudit = lmOppIds.filter((id) => !auditedOppIds.has(id));

        if (needAudit.length > 0) {
          const { data: oppsForAudit } = await supabase
            .from("opportunites")
            .select("entreprise_id")
            .in("id", needAudit);
          const entIds = [
            ...new Set(
              (oppsForAudit ?? [])
                .map((o) => o.entreprise_id)
                .filter(Boolean) as number[],
            ),
          ];
          if (entIds.length > 0) {
            const { data: entForAudit } = await supabase
              .from("entreprises")
              .select("id, name, telephone, email, site_web_canonique")
              .in("id", entIds);
            auditsToGenerate = entForAudit ?? [];
          }
        }
      }

      // 4. Audits prêts sans email envoyé dans les 7 derniers jours
      const { data: readyAudits } = await supabase
        .from("audits")
        .select("opportunite_id")
        .eq("statut", "ready")
        .limit(200);

      const readyAuditOppIds = (readyAudits ?? [])
        .map((a) => a.opportunite_id)
        .filter(Boolean) as string[];
      let messagesToSend: CompanyItem[] = [];
      if (readyAuditOppIds.length > 0) {
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { data: recentEmails } = await supabase
          .from("email_logs")
          .select("opportunite_id")
          .in("opportunite_id", readyAuditOppIds)
          .gte("sent_at", sevenDaysAgo)
          .eq("status", "sent");
        const recentEmaildOppIds = new Set(
          (recentEmails ?? []).map((e) => e.opportunite_id),
        );
        const needMessage = readyAuditOppIds.filter(
          (id) => !recentEmaildOppIds.has(id),
        );

        if (needMessage.length > 0) {
          const { data: oppsMsg } = await supabase
            .from("opportunites")
            .select("entreprise_id")
            .in("id", needMessage);
          const entIds = [
            ...new Set(
              (oppsMsg ?? [])
                .map((o) => o.entreprise_id)
                .filter(Boolean) as number[],
            ),
          ];
          if (entIds.length > 0) {
            const { data: entMsg } = await supabase
              .from("entreprises")
              .select("id, name, telephone, email, site_web_canonique")
              .in("id", entIds);
            messagesToSend = entMsg ?? [];
          }
        }
      }

      // 5. Relances — opportunités avec date_prochain_suivi dépassée ou proche
      const today = new Date().toISOString().split("T")[0];
      const { data: relanceOpps } = await supabase
        .from("opportunites")
        .select("id, entreprise_id, date_prochain_suivi")
        .lte("date_prochain_suivi", today)
        .not("date_prochain_suivi", "is", null)
        .limit(100);

      let relances: CompanyItem[] = [];
      const relanceEntIds = [
        ...new Set(
          (relanceOpps ?? [])
            .map((o) => o.entreprise_id)
            .filter(Boolean) as number[],
        ),
      ];
      if (relanceEntIds.length > 0) {
        const { data: entRelance } = await supabase
          .from("entreprises")
          .select("id, name, telephone, email, site_web_canonique")
          .in("id", relanceEntIds);
        relances = entRelance ?? [];
      }

      // 6. Appels — opportunités dans les étapes "approche" ou "appel"
      const { data: callStages } = await supabase
        .from("etapes_pipeline")
        .select("id, nom")
        .or("nom.ilike.%approche%,nom.ilike.%appel%,nom.ilike.%contact%");

      const callStageIds = (callStages ?? []).map((s) => s.id);
      let appels: CompanyItem[] = [];
      if (callStageIds.length > 0) {
        const { data: callOpps } = await supabase
          .from("opportunites")
          .select("entreprise_id")
          .in("stage_id", callStageIds)
          .limit(100);
        const callEntIds = [
          ...new Set(
            (callOpps ?? [])
              .map((o) => o.entreprise_id)
              .filter(Boolean) as number[],
          ),
        ];
        if (callEntIds.length > 0) {
          const { data: entCall } = await supabase
            .from("entreprises")
            .select("id, name, telephone, email, site_web_canonique")
            .in("id", callEntIds);
          appels = entCall ?? [];
        }
      }

      // Pipeline stages count
      const { data: allStages } = await supabase
        .from("etapes_pipeline")
        .select("id, nom, ordre")
        .order("ordre");

      const { data: allOpps } = await supabase
        .from("opportunites")
        .select("stage_id");

      const stageCounts = new Map<number, number>();
      for (const opp of allOpps ?? []) {
        if (opp.stage_id)
          stageCounts.set(
            opp.stage_id,
            (stageCounts.get(opp.stage_id) ?? 0) + 1,
          );
      }

      setPipelineStages(
        (allStages ?? []).map((s) => ({
          ...s,
          count: stageCounts.get(s.id) ?? 0,
        })),
      );

      const toItem = (c: {
        id: number;
        name: string | null;
        telephone?: string | null;
        email?: string | null;
        site_web_canonique?: string | null;
      }): CompanyItem => ({
        id: c.id,
        name: c.name ?? `Entreprise #${c.id}`,
        tel: c.telephone,
        email: c.email,
        site_web: c.site_web_canonique,
      });

      setCounters({
        qualifications: {
          count: (toQualify ?? []).length,
          companies: (toQualify ?? []).map(toItem),
        },
        sites: {
          count: sitesToPrepare.length,
          companies: sitesToPrepare.map(toItem),
        },
        audits: {
          count: auditsToGenerate.length,
          companies: auditsToGenerate.map(toItem),
        },
        messages: {
          count: messagesToSend.length,
          companies: messagesToSend.map(toItem),
        },
        relances: { count: relances.length, companies: relances.map(toItem) },
        appels: { count: appels.length, companies: appels.map(toItem) },
      });
    } catch (err) {
      console.error("SalesDashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ACTION_CARDS: Omit<
    ActionCounter,
    "count" | "companies" | "objective"
  >[] = [
    {
      key: "qualifications",
      label: "À qualifier",
      sublabel: "Entreprises sans qualification",
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-50 dark:bg-violet-950/30",
      borderColor: "border-violet-200 dark:border-violet-800",
      href: "/qualification",
    },
    {
      key: "sites",
      label: "Sites à préparer",
      sublabel: "Qualifiés sans lead magnet",
      icon: Globe,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      borderColor: "border-emerald-200 dark:border-emerald-800",
      href: "/production/lead-magnets",
    },
    {
      key: "audits",
      label: "Audits à générer",
      sublabel: "LM prêt, audit manquant",
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      borderColor: "border-blue-200 dark:border-blue-800",
      href: "/opportunities",
    },
    {
      key: "messages",
      label: "Messages à envoyer",
      sublabel: "Audit prêt, pas d'email récent",
      icon: Mail,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/30",
      borderColor: "border-orange-200 dark:border-orange-800",
      href: "/messagerie",
    },
    {
      key: "relances",
      label: "Relances",
      sublabel: "Suivi à faire aujourd'hui",
      icon: MessageCircle,
      color: "text-pink-600",
      bgColor: "bg-pink-50 dark:bg-pink-950/30",
      borderColor: "border-pink-200 dark:border-pink-800",
      href: "/messagerie",
    },
    {
      key: "appels",
      label: "Appels à passer",
      sublabel: "En phase approche/contact",
      icon: Phone,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
      borderColor: "border-cyan-200 dark:border-cyan-800",
      href: "/qualified?mode=cold_call",
    },
  ];

  const handleOpenObjectives = () => {
    setEditingObjectives({ ...objectives });
    setShowObjectivesModal(true);
  };

  const handleSaveObjectives = () => {
    if (!editingObjectives) return;
    setObjectives(editingObjectives);
    saveObjectives(editingObjectives);
    setShowObjectivesModal(false);
  };

  const totalDone = Object.entries(counters).reduce((sum, [key, val]) => {
    const obj = objectives[key as keyof SalesObjectives];
    return sum + Math.min(val.count, obj);
  }, 0);
  const totalObj = Object.values(objectives).reduce((a, b) => a + b, 0);
  const globalPct = totalObj > 0 ? Math.round((totalDone / totalObj) * 100) : 0;

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const expandedCardDef = expandedCard
    ? ACTION_CARDS.find((c) => c.key === expandedCard)
    : null;

  return (
    <div className="studio-surface flex min-h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="ws-overview">
          {/* Header */}
          <div className="ws-header">
            <div>
              <div className="ws-eyebrow capitalize">{today}</div>
              <h1>
                Objectifs du jour — <em>{globalPct}%</em>
              </h1>
              <div className="sub">
                {totalDone} / {totalObj} actions réalisées ·{" "}
                {pipelineStages.length} étapes pipeline
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn outline sm"
                onClick={handleOpenObjectives}
              >
                <Settings2 className="ico-sm" />
                Objectifs
              </button>
              <button
                type="button"
                className="btn outline sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={cn("ico-sm", loading && "animate-spin")} />
                Actualiser
              </button>
              <Link href="/pipeline" className="btn outline sm">
                <GitBranch className="ico-sm" />
                Pipeline
              </Link>
            </div>
          </div>

          {/* KPI strip — action counters */}
          <div
            className="kpi-strip"
            style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 18 }}
          >
            {ACTION_CARDS.map((card) => {
              const data = counters[card.key];
              const obj = objectives[card.key];
              const pct =
                obj > 0
                  ? Math.min(Math.round((data.count / obj) * 100), 100)
                  : 0;
              const isExpanded = expandedCard === card.key;
              const Icon = card.icon;
              const below = data.count < obj;

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setExpandedCard(isExpanded ? null : card.key)}
                  className="kpi"
                  style={{
                    textAlign: "left",
                    border: 0,
                    cursor: data.count > 0 ? "pointer" : "default",
                    background: isExpanded ? "var(--surface-2)" : undefined,
                    fontFamily: "inherit",
                  }}
                >
                  <div className="lb">
                    <Icon className="ico-xs" />
                    {card.label}
                  </div>
                  <div className="vl">{loading ? "…" : data.count}</div>
                  <div className={cn("delta", below && "dn")}>
                    obj. {obj} · {pct}%
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded company list */}
          {expandedCard && expandedCardDef && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-hd">
                {(() => {
                  const Icon = expandedCardDef.icon;
                  return <Icon className="ico-lg" />;
                })()}
                <h3>{expandedCardDef.label}</h3>
                <span className="meta">{counters[expandedCard].count}</span>
                <button
                  type="button"
                  onClick={() => setExpandedCard(null)}
                  className="btn ghost sm icon"
                  aria-label="Fermer"
                >
                  <X className="ico-sm" />
                </button>
              </div>
              <div>
                {counters[expandedCard].companies
                  .slice(0, 50)
                  .map((company) => (
                    <Link
                      key={company.id}
                      href={`/companies/${company.id}`}
                      className="src-row"
                      style={{
                        gridTemplateColumns: "28px 1fr auto auto",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div
                        className="icw"
                        style={{
                          background: "var(--bg-2)",
                          color: "var(--text-2)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {(company.name[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div className="nm">{company.name}</div>
                        <div className="det">
                          {[company.tel, company.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      {company.site_web ? (
                        <span className="pill">Site</span>
                      ) : (
                        <span />
                      )}
                      <ChevronRight className="ico-sm" />
                    </Link>
                  ))}
                {counters[expandedCard].companies.length === 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "40px 0",
                      color: "var(--text-3)",
                    }}
                  >
                    <CheckCircle2
                      className="ico-xl"
                      style={{ color: "var(--ok)" }}
                    />
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                      Tout est bon ici !
                    </p>
                    <p style={{ fontSize: 11.5, margin: 0 }}>
                      Aucune action requise pour cette catégorie.
                    </p>
                  </div>
                )}
                {counters[expandedCard].companies.length > 50 && (
                  <p
                    style={{
                      padding: "8px 16px",
                      fontSize: 11,
                      color: "var(--text-3)",
                      fontFamily: "var(--font-mono)",
                      margin: 0,
                    }}
                  >
                    … et {counters[expandedCard].companies.length - 50} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pipeline mini overview */}
          {pipelineStages.length > 0 && (
            <div className="card">
              <div className="card-hd">
                <GitBranch className="ico-lg" />
                <h3>Pipeline — vue rapide</h3>
                <span className="meta">{pipelineStages.length} étapes</span>
              </div>
              <div className="team-grid">
                {pipelineStages.map((stage, i) => {
                  const maxCount = Math.max(
                    ...pipelineStages.map((s) => s.count),
                    1,
                  );
                  const pct = Math.round((stage.count / maxCount) * 100);
                  return (
                    <Link key={stage.id} href="/pipeline" className="team-row-2">
                      <div
                        className="av"
                        style={{ background: "var(--text-3)" }}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <div className="nm">{stage.nom}</div>
                        <div className="r">étape #{i + 1}</div>
                      </div>
                      <div className="vl">
                        <div className="num">{stage.count}</div>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Objectives modal */}
      {showObjectivesModal && editingObjectives && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="studio-surface w-full max-w-md card" style={{ padding: 24 }}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 400,
                    fontSize: 20,
                    margin: 0,
                    letterSpacing: "-0.005em",
                  }}
                >
                  Objectifs quotidiens
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-3)",
                    marginTop: 4,
                  }}
                >
                  Définissez vos objectifs d&apos;actions par jour
                </p>
              </div>
              <button
                type="button"
                className="btn ghost sm icon"
                aria-label="Fermer"
                onClick={() => setShowObjectivesModal(false)}
              >
                <X className="ico-sm" />
              </button>
            </div>
            <div className="space-y-4">
              {ACTION_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.key} className="flex items-center gap-3">
                    <div
                      className="icw"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--bg-2)",
                        color: "var(--text-2)",
                        flexShrink: 0,
                      }}
                    >
                      <Icon className="ico-sm" />
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                        {card.label}
                      </p>
                      <p
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-3)",
                          margin: 0,
                        }}
                      >
                        {card.sublabel}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={999}
                      value={editingObjectives[card.key]}
                      onChange={(e) =>
                        setEditingObjectives({
                          ...editingObjectives,
                          [card.key]: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        })
                      }
                      className="w-20 text-center text-sm font-semibold"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setEditingObjectives(DEFAULT_OBJECTIVES)}
              >
                Réinitialiser
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setShowObjectivesModal(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn accent sm"
                  onClick={handleSaveObjectives}
                >
                  <Save className="ico-sm" />
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
