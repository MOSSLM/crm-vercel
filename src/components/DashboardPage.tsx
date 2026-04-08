"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppData } from "./AppDataContext";
import { journalApi, JournalKpiTotals } from "../utils/journalApi";
import { Zap } from "lucide-react";
import logger from "../utils/logger";
import { supabase } from "@/utils/supabase/client";

import { PeriodType } from "./dashboard/types";
import { calculateDashboardMetrics } from "./dashboard/calculations";

import { KpiActivityCard } from "./dashboard/KpiActivityCard";
import { ColdCallProjectionCard } from "./dashboard/ColdCallProjectionCard";
import { FinancialMetricCards } from "./dashboard/FinancialMetricCards";
import { PerformanceTrendCard } from "./dashboard/PerformanceTrendCard";
import { MainStatsCards } from "./dashboard/MainStatsCards";
import { RecentActivityCard } from "./dashboard/RecentActivityCard";
import { DistributionCard } from "./dashboard/DistributionCard";
import { CommercialTabContent } from "./dashboard/CommercialTabContent";
import { FunnelTabContent } from "./dashboard/FunnelTabContent";

type ViewMode = "overview" | "commercial" | "funnel";
type PerformanceMetric = "revenue" | "customers" | "appointments" | "calls";
type TaskStatus = "a_faire" | "en_cours" | "termine";
type TaskPriority = "haute" | "moyenne" | "basse";

interface TaskCalendarItem {
  id: string;
  titre: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
}

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const emptyKpiPeriod = {
  total_appels: 0,
  total_relances: 0,
  total_rdvs: 0,
  total_devis: 0,
  total_signatures: 0,
  total_acomptes: 0,
  total_lead_magnets: 0,
};

const emptyKpis: JournalKpiTotals = {
  ...emptyKpiPeriod,
  week: { ...emptyKpiPeriod },
  month: { ...emptyKpiPeriod },
  quarter: { ...emptyKpiPeriod },
  year: { ...emptyKpiPeriod },
};

export const DashboardPage: React.FC = () => {
  const {
    companies,
    contacts,
    opportunities,
    pipelineStages,
    getOpportunitiesByStage,
    totalCompanies,
    totalQualifiedCompanies,
    keywordStats,
    locationStats,
  } = useAppData();

  const [showByKeywords, setShowByKeywords] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [isMobile, setIsMobile] = useState(false);
  const [journalKpis, setJournalKpis] = useState<JournalKpiTotals>(emptyKpis);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("week");
  const [selectedPerformanceMetric, setSelectedPerformanceMetric] = useState<PerformanceMetric>("revenue");
  const [taskCalendarMonth, setTaskCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [taskCalendarItems, setTaskCalendarItems] = useState<TaskCalendarItem[]>([]);
  const [pickupRate, setPickupRate] = useState(40);
  const [pickupEditing, setPickupEditing] = useState(false);
  const [pickupDraft, setPickupDraft] = useState(40);

  // Load journal KPIs
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingKpis(true);
        setKpiError(null);
        const kpis = await journalApi.getJournalKpiTotals();
        setJournalKpis(kpis);
      } catch (error) {
        logger.error("Erreur KPI journal:", error);
        setKpiError(error instanceof Error ? error.message : "Erreur de chargement");
      } finally {
        setLoadingKpis(false);
      }
    };

    void load();

    const handleVisibility = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load tasks for calendar
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .select("id,titre,status,priority,due_date,start_at,end_at")
        .is("project_id", null)
        .neq("status", "termine");
      if (error) { logger.error("Erreur tâches dashboard:", error); return; }
      setTaskCalendarItems((data as TaskCalendarItem[] | null) ?? []);
    };
    void load();
  }, []);

  // Load pickup rate
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("playbook_settings").select("pickup_rate").maybeSingle();
      if (data?.pickup_rate != null) {
        setPickupRate(data.pickup_rate);
        setPickupDraft(data.pickup_rate);
      }
    };
    void load();
  }, []);

  const savePickupRate = async (value: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("playbook_settings")
      .upsert({ user_id: user.id, pickup_rate: value }, { onConflict: "user_id" });
  };

  const getOppsByStageForCalc = React.useCallback(
    (stageId: string) => {
      const idNum = Number(stageId);
      if (Number.isNaN(idNum)) return [];
      return getOpportunitiesByStage(idNum);
    },
    [getOpportunitiesByStage]
  );

  const calculations = calculateDashboardMetrics(
    journalKpis,
    selectedPeriod,
    opportunities,
    pipelineStages,
    getOppsByStageForCalc,
    contacts,
    totalCompanies,
    totalQualifiedCompanies
  );

  const {
    totalRelances, totalAppels, totalRdv, totalDevis,
    totalSignatures, totalAcomptes, totalLeadMagnets,
    totalPipelineValue, averageDealValue, callsToBeMade,
    totalSigned, totalCollected, totalPending,
    funnelSteps, pipelineBreakdown, recentActivity,
    appelsParJour, tauxInteretReel, tauxClosingReel, avgPaidPrice,
  } = calculations;

  const distributionData = showByKeywords
    ? Object.entries(keywordStats).map(([name, value]) => ({ name, value }))
    : Object.entries(locationStats).map(([name, value]) => ({ name, value }));

  const trendLabelsByPeriod: Record<Exclude<PeriodType, "total">, string[]> = {
    week: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    month: ["S1", "S2", "S3", "S4"],
    quarter: ["M1", "M2", "M3"],
    year: ["T1", "T2", "T3", "T4"],
  };

  const performanceTrendData = useMemo(() => {
    if (selectedPeriod === "total") {
      return [{ label: "Tout le temps", revenue: totalSigned, customers: totalSignatures, appointments: totalRdv, calls: totalAppels }];
    }
    const labels = trendLabelsByPeriod[selectedPeriod];
    const weightsByPeriod: Record<Exclude<PeriodType, "total">, number[]> = {
      week: [0.1, 0.12, 0.13, 0.15, 0.18, 0.16, 0.16],
      month: [0.22, 0.25, 0.26, 0.27],
      quarter: [0.29, 0.33, 0.38],
      year: [0.2, 0.24, 0.27, 0.29],
    };
    const weights = weightsByPeriod[selectedPeriod];
    return labels.map((label, i) => ({
      label,
      revenue: Math.round(totalSigned * weights[i]),
      customers: Math.round(totalSignatures * weights[i]),
      appointments: Math.round(totalRdv * weights[i]),
      calls: Math.round(totalAppels * weights[i]),
    }));
  }, [selectedPeriod, totalSigned, totalSignatures, totalRdv, totalAppels]);

  const PLAYBOOK_WD = 22;
  const playbookProjection = useMemo(() => {
    const pd = pickupRate / 100;
    const ir = tauxInteretReel / 100;
    const cr = tauxClosingReel / 100;
    return {
      decideurs: Number((appelsParJour * pd).toFixed(1)),
      interesses: Number((appelsParJour * pd * ir).toFixed(1)),
      ventesParMois: Math.round(appelsParJour * pd * ir * cr * PLAYBOOK_WD),
      caParMois: Math.round(appelsParJour * pd * ir * cr * PLAYBOOK_WD) * (avgPaidPrice > 0 ? avgPaidPrice : 1750),
    };
  }, [pickupRate, appelsParJour, tauxInteretReel, tauxClosingReel, avgPaidPrice]);

  const funnelBarData = funnelSteps.map((step, index) => ({
    name: step.name,
    value: step.value,
    conversion: index === 0 ? 100 : step.percentage,
  }));

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const tasksByDate = useMemo(() => {
    return taskCalendarItems.reduce<Record<string, TaskCalendarItem[]>>((acc, task) => {
      const taskDate = task.due_date ?? task.start_at?.slice(0, 10) ?? task.end_at?.slice(0, 10);
      if (!taskDate) return acc;
      if (!acc[taskDate]) acc[taskDate] = [];
      acc[taskDate].push(task);
      return acc;
    }, {});
  }, [taskCalendarItems]);

  const todayTasks = tasksByDate[todayKey] ?? [];

  const monthDays = useMemo(() => {
    const year = taskCalendarMonth.getFullYear();
    const month = taskCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: startOffset + daysInMonth }, (_, index) => {
      if (index < startOffset) return null;
      const day = index - startOffset + 1;
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      return { dateKey, day, tasks: tasksByDate[dateKey] ?? [] };
    });
  }, [taskCalendarMonth, tasksByDate]);

  const taskMonthLabel = taskCalendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="mobile-safe-pb space-y-4 px-3 py-4 md:space-y-6 md:p-6">
      <div>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground">Vue d&apos;ensemble de votre activité commerciale</p>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1 text-xs md:text-sm">
            <span className="hidden md:inline">Vue d&apos;ensemble</span>
            <span className="md:hidden">Vue</span>
          </TabsTrigger>
          <TabsTrigger value="commercial" className="flex-1 text-xs md:text-sm">
            <span className="hidden md:inline">Performance commerciale</span>
            <span className="md:hidden">Perf.</span>
          </TabsTrigger>
          <TabsTrigger value="funnel" className="flex-1 text-xs md:text-sm">
            <div className="flex items-center gap-1 md:gap-2">
              <Zap className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden md:inline">Entonnoir de conversion</span>
              <span className="md:hidden">Entonnoir</span>
            </div>
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <KpiActivityCard
            journalKpis={journalKpis}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            totalAppels={totalAppels}
            totalRelances={totalRelances}
            totalRdv={totalRdv}
            totalDevis={totalDevis}
            totalSignatures={totalSignatures}
            totalAcomptes={totalAcomptes}
            totalLeadMagnets={totalLeadMagnets}
            loadingKpis={loadingKpis}
            kpiError={kpiError}
          />

          <ColdCallProjectionCard
            appelsParJour={appelsParJour}
            tauxInteretReel={tauxInteretReel}
            tauxClosingReel={tauxClosingReel}
            avgPaidPrice={avgPaidPrice}
            pickupRate={pickupRate}
            pickupDraft={pickupDraft}
            pickupEditing={pickupEditing}
            onPickupDraftChange={setPickupDraft}
            onPickupEditToggle={() => { setPickupDraft(pickupRate); setPickupEditing(true); }}
            onPickupSave={(v) => {
              setPickupRate(v);
              setPickupEditing(false);
              void savePickupRate(v);
            }}
            projection={playbookProjection}
          />

          <FinancialMetricCards
            totalSigned={totalSigned}
            totalCollected={totalCollected}
            totalPending={totalPending}
            totalSignatures={totalSignatures}
            totalAcomptes={totalAcomptes}
            callsToBeMade={callsToBeMade}
          />

          <PerformanceTrendCard
            selectedMetric={selectedPerformanceMetric}
            onMetricChange={setSelectedPerformanceMetric}
            data={performanceTrendData}
          />

          <MainStatsCards
            totalCompanies={totalCompanies}
            totalQualifiedCompanies={totalQualifiedCompanies}
            contactsCount={contacts.length}
            opportunitiesCount={opportunities.length}
            totalPipelineValue={totalPipelineValue}
            averageDealValue={averageDealValue}
            totalAppels={totalAppels}
          />

          <RecentActivityCard
            recentActivity={recentActivity}
            totalRelances={totalRelances}
            totalSigned={totalSigned}
            totalCollected={totalCollected}
            todayTasks={todayTasks}
            todayKey={todayKey}
            monthDays={monthDays}
            taskMonthLabel={taskMonthLabel}
            onPreviousMonth={() =>
              setTaskCalendarMonth((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
            }
            onNextMonth={() =>
              setTaskCalendarMonth((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
            }
          />

          <DistributionCard
            distributionData={distributionData}
            showByKeywords={showByKeywords}
            onToggle={setShowByKeywords}
            isMobile={isMobile}
          />
        </TabsContent>

        {/* ── Commercial ───────────────────────── */}
        <TabsContent value="commercial" className="mt-6">
          <CommercialTabContent
            totalSigned={totalSigned}
            totalCollected={totalCollected}
            totalPending={totalPending}
            callsToBeMade={callsToBeMade}
            contactToCallRate={calculations.contactToCallRate}
            callToMeetingRate={calculations.callToMeetingRate}
            meetingToQuoteRate={calculations.meetingToQuoteRate}
            quoteToSignRate={calculations.quoteToSignRate}
            totalAppels={totalAppels}
            totalRdv={totalRdv}
            totalDevis={totalDevis}
            totalSignatures={totalSignatures}
            contactsCount={contacts.length}
            pipelineBreakdown={pipelineBreakdown}
            isMobile={isMobile}
          />
        </TabsContent>

        {/* ── Funnel ───────────────────────────── */}
        <TabsContent value="funnel" className="mt-6">
          <FunnelTabContent
            funnelSteps={funnelSteps}
            funnelBarData={funnelBarData}
            isMobile={isMobile}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
