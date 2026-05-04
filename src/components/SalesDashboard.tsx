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
  Target,
  Settings2,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  TrendingUp,
  Zap,
  X,
  Save,
  GitBranch,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            <h1 className="text-xl font-bold">Dashboard Sales</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">
            {today}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global progress */}
          <div className="mr-2 flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-2">
            <div className="text-center">
              <p className="text-lg font-bold">{globalPct}%</p>
              <p className="text-xs text-muted-foreground">Objectifs</p>
            </div>
            <div className="h-10 w-24">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-500"
                  style={{ width: `${globalPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {totalDone} / {totalObj} actions
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleOpenObjectives}
          >
            <Settings2 className="h-4 w-4" />
            Objectifs
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/pipeline">
              <GitBranch className="h-4 w-4" />
              Pipeline
            </Link>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Action counters grid */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Target className="h-4 w-4" />
              Actions du jour
            </h2>
            <div className="-mx-6 w-screen overflow-x-auto pb-2">
              <div className="grid min-w-[1000px] grid-cols-2 gap-3 px-6 lg:grid-cols-3 xl:grid-cols-6">
                {ACTION_CARDS.map((card) => {
                  const data = counters[card.key];
                  const obj = objectives[card.key];
                  const pct =
                    obj > 0
                      ? Math.min(Math.round((data.count / obj) * 100), 100)
                      : 0;
                  const isExpanded = expandedCard === card.key;
                  const Icon = card.icon;

                  return (
                    <div key={card.key} className="flex flex-col">
                      <button
                        onClick={() =>
                          setExpandedCard(isExpanded ? null : card.key)
                        }
                        className={cn(
                          "relative flex flex-col rounded-xl border p-4 text-left transition-all hover:shadow-md",
                          card.bgColor,
                          card.borderColor,
                          isExpanded &&
                            "ring-2 ring-offset-1 ring-offset-background",
                          data.count > 0 ? "cursor-pointer" : "opacity-60",
                        )}
                        style={
                          isExpanded
                            ? { ["--tw-ring-color" as string]: "currentColor" }
                            : {}
                        }
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-black/20",
                            card.color,
                          )}
                        >
                          <Icon className="h-4.5 w-4.5 h-5 w-5" />
                        </div>
                        <div className="mt-3">
                          <p
                            className={cn(
                              "text-3xl font-extrabold tracking-tight",
                              card.color,
                            )}
                          >
                            {loading ? "…" : data.count}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold leading-tight">
                            {card.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {card.sublabel}
                          </p>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Obj. {obj}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                card.color.replace("text-", "bg-"),
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {data.count > 0 && (
                          <ChevronRight
                            className={cn(
                              "absolute right-2 top-2 h-4 w-4 transition-transform",
                              card.color,
                              isExpanded && "rotate-90",
                            )}
                          />
                        )}
                      </button>

                      {/* Go to page link */}
                      <Link
                        href={card.href}
                        className={cn(
                          "mt-1 flex items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-medium transition-colors hover:bg-accent",
                          card.color,
                        )}
                      >
                        Accéder <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Expanded company list */}
          {expandedCard && (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const card = ACTION_CARDS.find(
                      (c) => c.key === expandedCard,
                    )!;
                    const Icon = card.icon;
                    return (
                      <>
                        <Icon className={cn("h-4 w-4", card.color)} />
                        <span className="font-semibold">{card.label}</span>
                        <Badge variant="secondary">
                          {counters[expandedCard].count}
                        </Badge>
                      </>
                    );
                  })()}
                </div>
                <button
                  onClick={() => setExpandedCard(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y">
                {counters[expandedCard].companies
                  .slice(0, 50)
                  .map((company) => (
                    <Link
                      key={company.id}
                      href={`/companies/${company.id}`}
                      className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {(company.name[0] ?? "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{company.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {company.tel && <span>{company.tel}</span>}
                            {company.email && <span>{company.email}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {company.site_web && (
                          <Badge variant="outline" className="text-[10px]">
                            Site
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                {counters[expandedCard].companies.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium">Tout est bon ici !</p>
                    <p className="text-xs">
                      Aucune action requise pour cette catégorie.
                    </p>
                  </div>
                )}
                {counters[expandedCard].companies.length > 50 && (
                  <p className="px-4 py-2 text-xs text-muted-foreground">
                    … et {counters[expandedCard].companies.length - 50} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pipeline mini overview */}
          {pipelineStages.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <GitBranch className="h-4 w-4" />
                Pipeline — vue rapide
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pipelineStages.map((stage, i) => {
                  const maxCount = Math.max(
                    ...pipelineStages.map((s) => s.count),
                    1,
                  );
                  const pct = Math.round((stage.count / maxCount) * 100);
                  return (
                    <Link
                      key={stage.id}
                      href="/pipeline"
                      className="flex min-w-[120px] flex-col rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:border-primary/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground truncate">
                          {stage.nom}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          #{i + 1}
                        </span>
                      </div>
                      <p className="mt-1 text-2xl font-bold">{stage.count}</p>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all"
                          style={{ width: `${pct}%` }}
                        />
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
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Objectifs quotidiens</h3>
                <p className="text-sm text-muted-foreground">
                  Définissez vos objectifs d'actions par jour
                </p>
              </div>
              <button onClick={() => setShowObjectivesModal(false)}>
                <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              {ACTION_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.key} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        card.bgColor,
                        card.color,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{card.label}</p>
                      <p className="text-xs text-muted-foreground">
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
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setEditingObjectives(DEFAULT_OBJECTIVES)}
              >
                Réinitialiser
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowObjectivesModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSaveObjectives}
                >
                  <Save className="h-4 w-4" />
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
