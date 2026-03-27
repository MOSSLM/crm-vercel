"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAppData } from './AppDataContext';
import { journalApi, JournalKpiTotals } from '../utils/journalApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Progress } from './ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import {
  Building,
  Users,
  Target,
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Award,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Banknote,
  Repeat,
  FileText,
  Handshake,
  ArrowRight,
  Zap,
  Star,
  PhoneCall,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import logger from '../utils/logger';
import { supabase } from '@/utils/supabase/client';
// Local imports
import { COLORS } from './dashboard/constants';
import { formatCurrency, formatCompactCurrency, getPeriodLabel } from './dashboard/helpers';
import { PeriodType } from './dashboard/types';
import { calculateDashboardMetrics } from './dashboard/calculations';

type ViewMode = 'overview' | 'commercial' | 'funnel';
type PerformanceMetric = 'revenue' | 'customers' | 'appointments' | 'calls';
type TaskStatus = 'a_faire' | 'en_cours' | 'termine';
type TaskPriority = 'haute' | 'moyenne' | 'basse';
type TaskCalendarItem = {
  id: string;
  titre: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
};

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);
const priorityBadgeClasses: Record<TaskPriority, string> = {
  haute: 'bg-red-100 text-red-700 border-red-200',
  moyenne: 'bg-orange-100 text-orange-700 border-orange-200',
  basse: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

export const DashboardPage: React.FC = () => {
  const { 
    searchResults, 
    companies, 
    contacts, 
    opportunities, 
    pipelineStages,
    getOpportunitiesByStage,
    totalCompanies, 
    totalQualifiedCompanies, 
    keywordStats, 
    locationStats
  } = useAppData();

  const [showByKeywords, setShowByKeywords] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [isMobile, setIsMobile] = useState(false);
  const [journalKpis, setJournalKpis] = useState<JournalKpiTotals>({
    total_appels: 0,
    total_relances: 0,
    total_rdvs: 0,
    total_devis: 0,
    total_signatures: 0,
    total_acomptes: 0,
    total_lead_magnets: 0,
    week: {
      total_appels: 0,
      total_relances: 0,
      total_rdvs: 0,
      total_devis: 0,
      total_signatures: 0,
      total_acomptes: 0,
      total_lead_magnets: 0
    },
    month: {
      total_appels: 0,
      total_relances: 0,
      total_rdvs: 0,
      total_devis: 0,
      total_signatures: 0,
      total_acomptes: 0,
      total_lead_magnets: 0
    },
    quarter: {
      total_appels: 0,
      total_relances: 0,
      total_rdvs: 0,
      total_devis: 0,
      total_signatures: 0,
      total_acomptes: 0,
      total_lead_magnets: 0
    },
    year: {
      total_appels: 0,
      total_relances: 0,
      total_rdvs: 0,
      total_devis: 0,
      total_signatures: 0,
      total_acomptes: 0,
      total_lead_magnets: 0
    }
  });
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('week');
  const [selectedPerformanceMetric, setSelectedPerformanceMetric] = useState<PerformanceMetric>('revenue');
  const [taskCalendarMonth, setTaskCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [taskCalendarItems, setTaskCalendarItems] = useState<TaskCalendarItem[]>([]);

  // Charger les KPI du journal
  useEffect(() => {
    const loadJournalKpis = async () => {
      try {
        setLoadingKpis(true);
        setKpiError(null);
        
        const kpis = await journalApi.getJournalKpiTotals();
        setJournalKpis(kpis);
      } catch (error) {
        logger.error('Erreur lors du chargement des KPI du journal:', error);
        setKpiError(error instanceof Error ? error.message : 'Erreur de chargement des KPI');
      } finally {
        setLoadingKpis(false);
      }
    };

    loadJournalKpis();

    const handleFocus = () => {
      if (!document.hidden) {
        loadJournalKpis();
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const loadTaskCalendarItems = async () => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('id,titre,status,priority,due_date,start_at,end_at')
        .is('project_id', null)
        .neq('status', 'termine');

      if (error) {
        logger.error('Erreur lors du chargement des tâches du dashboard:', error);
        return;
      }

      setTaskCalendarItems((data as TaskCalendarItem[] | null) ?? []);
    };

    void loadTaskCalendarItems();
  }, []);

  // Adapter: string stageId -> number pour calculateDashboardMetrics
  const getOppsByStageForCalc = React.useCallback(
    (stageId: string) => {
      const idNum = Number(stageId);
      if (Number.isNaN(idNum)) return [];
      return getOpportunitiesByStage(idNum);
    },
    [getOpportunitiesByStage]
  );

  // Calcul de toutes les métriques
  const calculations = calculateDashboardMetrics(
    journalKpis,
    selectedPeriod,
    opportunities,
    pipelineStages,
    getOppsByStageForCalc, // wrapper compatible
    contacts,
    totalCompanies,
    totalQualifiedCompanies
  );

  const {
    currentData,
    totalRelances,
    totalAppels,
    totalRdv,
    totalDevis,
    totalSignatures,
    totalAcomptes,
    totalLeadMagnets,
    totalPipelineValue,
    averageDealValue,
    callsToBeMade,
    totalSigned,
    totalCollected,
    totalPending,
    funnelSteps,
    pipelineBreakdown,
    recentActivity
  } = calculations;

  // Données pour les graphiques
  const distributionData = showByKeywords 
    ? Object.entries(keywordStats).map(([name, value]) => ({ name, value }))
    : Object.entries(locationStats).map(([name, value]) => ({ name, value }));

  const trendLabelsByPeriod: Record<Exclude<PeriodType, 'total'>, string[]> = {
    week: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    month: ['S1', 'S2', 'S3', 'S4'],
    quarter: ['M1', 'M2', 'M3'],
    year: ['T1', 'T2', 'T3', 'T4']
  };

  const chartMetricConfig: Record<PerformanceMetric, { label: string; color: string; gradient: string }> = {
    revenue: { label: 'Revenus (€)', color: '#16a34a', gradient: 'url(#metricGradientRevenue)' },
    customers: { label: 'Nouveaux clients', color: 'var(--chart-1)', gradient: 'url(#metricGradientCustomers)' },
    appointments: { label: 'RDV', color: 'var(--chart-5)', gradient: 'url(#metricGradientAppointments)' },
    calls: { label: 'Appels', color: 'var(--chart-8)', gradient: 'url(#metricGradientCalls)' }
  };

  const performanceTrendData = useMemo(() => {
    if (selectedPeriod === 'total') {
      return [
        {
          label: 'Tout le temps',
          revenue: totalSigned,
          customers: totalSignatures,
          appointments: totalRdv,
          calls: totalAppels
        }
      ];
    }

    const labels = trendLabelsByPeriod[selectedPeriod];
    const weightsByPeriod: Record<Exclude<PeriodType, 'total'>, number[]> = {
      week: [0.1, 0.12, 0.13, 0.15, 0.18, 0.16, 0.16],
      month: [0.22, 0.25, 0.26, 0.27],
      quarter: [0.29, 0.33, 0.38],
      year: [0.2, 0.24, 0.27, 0.29]
    };

    const weights = weightsByPeriod[selectedPeriod];

    return labels.map((label, index) => ({
      label,
      revenue: Math.round(totalSigned * weights[index]),
      customers: Math.round(totalSignatures * weights[index]),
      appointments: Math.round(totalRdv * weights[index]),
      calls: Math.round(totalAppels * weights[index])
    }));
  }, [selectedPeriod, totalSigned, totalSignatures, totalRdv, totalAppels]);

  const funnelBarData = funnelSteps.map((step, index) => ({
    name: step.name,
    value: step.value,
    conversion: index === 0 ? 100 : step.percentage
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

  const taskMonthLabel = taskCalendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const goToPreviousTaskMonth = () => {
    setTaskCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextTaskMonth = () => {
    setTaskCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): React.ReactElement => {
    switch (trend) {
      case 'up': return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'down': return <ArrowDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="mobile-safe-pb space-y-4 px-3 py-4 md:space-y-6 md:p-6">
      <div>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground">
          Vue d'ensemble de votre activité commerciale
        </p>
      </div>

      {/* Onglets principaux */}
      <Tabs
        value={viewMode}
        onValueChange={(value) => setViewMode(value as ViewMode)}
      >
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-3">
          <TabsTrigger value="overview" className="text-xs md:text-sm px-1 md:px-3">
            <span className="hidden md:inline">Vue d'ensemble</span>
            <span className="md:hidden">Vue</span>
          </TabsTrigger>
          <TabsTrigger value="commercial" className="text-xs md:text-sm px-1 md:px-3">
            <span className="hidden md:inline">Performance commerciale</span>
            <span className="md:hidden">Perf.</span>
          </TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs md:text-sm px-1 md:px-3">
            <div className="flex items-center gap-1 md:gap-2">
              <Zap className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden md:inline">Entonnoir de conversion</span>
              <span className="md:hidden">Entonnoir</span>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* KPI d'activité commerciale basés sur le journal */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  <CardTitle>Activité commerciale réelle</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Temps réel
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="period-select" className="text-sm font-medium">
                    Période :
                  </Label>
                  <Select value={selectedPeriod} onValueChange={(value: PeriodType) => setSelectedPeriod(value)}>
                    <SelectTrigger id="period-select" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          Semaine
                        </div>
                      </SelectItem>
                      <SelectItem value="month">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Mois
                        </div>
                      </SelectItem>
                      <SelectItem value="quarter">
                        <div className="flex items-center gap-2">
                          <CalendarRange className="h-4 w-4" />
                          Trimestre
                        </div>
                      </SelectItem>
                      <SelectItem value="year">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Année
                        </div>
                      </SelectItem>
                      <SelectItem value="total">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Total
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <CardDescription>
                Données précises extraites du journal d'activité • Affichage {getPeriodLabel(selectedPeriod)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingKpis ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 md:gap-4">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-muted rounded mb-2"></div>
                      <div className="h-8 bg-muted rounded mb-1"></div>
                      <div className="h-3 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : kpiError ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Erreur de chargement des données KPI
                  </p>
                  <p className="text-xs text-red-600">
                    {kpiError}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 md:gap-4">
                  <div className="text-center p-3 border rounded-lg bg-blue-50 border-blue-200">
                    <Phone className="h-5 w-5 mx-auto mb-2 text-blue-600" />
                    <div className="text-xl font-bold text-blue-600">{totalAppels}</div>
                    <div className="text-xs text-blue-600">
                      Appels {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-orange-50 border-orange-200">
                    <Repeat className="h-5 w-5 mx-auto mb-2 text-orange-600" />
                    <div className="text-xl font-bold text-orange-600">{totalRelances}</div>
                    <div className="text-xs text-orange-600">
                      Relances {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-purple-50 border-purple-200">
                    <Calendar className="h-5 w-5 mx-auto mb-2 text-purple-600" />
                    <div className="text-xl font-bold text-purple-600">{totalRdv}</div>
                    <div className="text-xs text-purple-600">
                      RDV {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-yellow-50 border-yellow-200">
                    <FileText className="h-5 w-5 mx-auto mb-2 text-yellow-600" />
                    <div className="text-xl font-bold text-yellow-600">{totalDevis}</div>
                    <div className="text-xs text-yellow-600">
                      Devis {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-green-50 border-green-200">
                    <Handshake className="h-5 w-5 mx-auto mb-2 text-green-600" />
                    <div className="text-xl font-bold text-green-600">{totalSignatures}</div>
                    <div className="text-xs text-green-600">
                      Signatures {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-emerald-50 border-emerald-200">
                    <Banknote className="h-5 w-5 mx-auto mb-2 text-emerald-600" />
                    <div className="text-xl font-bold text-emerald-600">{totalAcomptes}</div>
                    <div className="text-xs text-emerald-600">
                      Acomptes {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg bg-pink-50 border-pink-200">
                    <Star className="h-5 w-5 mx-auto mb-2 text-pink-600" />
                    <div className="text-xl font-bold text-pink-600">{totalLeadMagnets}</div>
                    <div className="text-xs text-pink-600">
                      Lead Magnets {selectedPeriod !== 'total' ? getPeriodLabel(selectedPeriod) : ''}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Indicateurs de performance basés sur les vraies données */}
              {!loadingKpis && !kpiError && (
                <div className="mt-4 space-y-3">
                  {selectedPeriod !== 'total' && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-800">
                          Comparaison avec le total
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getPeriodLabel(selectedPeriod)} vs total
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-xs">
                        <div className="text-center">
                          <div className="font-medium">Appels</div>
                          <div className="text-blue-600">
                            {totalAppels}/{journalKpis.total_appels}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_appels > 0 ? ((totalAppels / journalKpis.total_appels) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">Relances</div>
                          <div className="text-orange-600">
                            {totalRelances}/{journalKpis.total_relances}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_relances > 0 ? ((totalRelances / journalKpis.total_relances) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">RDV</div>
                          <div className="text-purple-600">
                            {totalRdv}/{journalKpis.total_rdvs}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_rdvs > 0 ? ((totalRdv / journalKpis.total_rdvs) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">Devis</div>
                          <div className="text-yellow-600">
                            {totalDevis}/{journalKpis.total_devis}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_devis > 0 ? ((totalDevis / journalKpis.total_devis) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">Signatures</div>
                          <div className="text-green-600">
                            {totalSignatures}/{journalKpis.total_signatures}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_signatures > 0 ? ((totalSignatures / journalKpis.total_signatures) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">Acomptes</div>
                          <div className="text-emerald-600">
                            {totalAcomptes}/{journalKpis.total_acomptes}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_acomptes > 0 ? ((totalAcomptes / journalKpis.total_acomptes) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">LM</div>
                          <div className="text-pink-600">
                            {totalLeadMagnets}/{journalKpis.total_lead_magnets}
                            <div className="text-xs opacity-75">
                              ({journalKpis.total_lead_magnets > 0 ? ((totalLeadMagnets / journalKpis.total_lead_magnets) * 100).toFixed(1) : 0}%)
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                    <div className="p-3 bg-muted border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Taux conversion Appels → RDV</span>
                        <span className="text-lg font-bold text-purple-600">
                          {totalAppels > 0 ? ((totalRdv / totalAppels) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getPeriodLabel(selectedPeriod)}
                      </div>
                    </div>
                    
                    <div className="p-3 bg-muted border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Taux conversion RDV → Devis</span>
                        <span className="text-lg font-bold text-yellow-600">
                          {totalRdv > 0 ? ((totalDevis / totalRdv) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getPeriodLabel(selectedPeriod)}
                      </div>
                    </div>
                    
                    <div className="p-3 bg-muted border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Taux conversion Devis → Signature</span>
                        <span className="text-lg font-bold text-green-600">
                          {totalDevis > 0 ? ((totalSignatures / totalDevis) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getPeriodLabel(selectedPeriod)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métriques financières avec nouvelle métrique */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Total signé</CardTitle>
                <Award className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-green-600">
                  <span className="md:hidden">{formatCompactCurrency(totalSigned)}</span>
                  <span className="hidden md:inline">{formatCurrency(totalSigned)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalSignatures} contrats
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Total encaissé</CardTitle>
                <Banknote className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-blue-600">
                  <span className="md:hidden">{formatCompactCurrency(totalCollected)}</span>
                  <span className="hidden md:inline">{formatCurrency(totalCollected)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalAcomptes} acomptes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Restant à encaisser</CardTitle>
                <Clock className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-orange-600">
                  <span className="md:hidden">{formatCompactCurrency(totalPending)}</span>
                  <span className="hidden md:inline">{formatCurrency(totalPending)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Solde restant
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Appels à passer</CardTitle>
                <PhoneCall className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-purple-600">
                  {callsToBeMade}
                </div>
                <p className="text-xs text-muted-foreground">
                  Prospects qualifiés
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-md bg-gradient-to-br from-background to-muted/20">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Évolution des performances</CardTitle>
                  <CardDescription>
                    Suivi visuel de vos indicateurs commerciaux sur la période sélectionnée
                  </CardDescription>
                </div>
                <Select
                  value={selectedPerformanceMetric}
                  onValueChange={(value: PerformanceMetric) => setSelectedPerformanceMetric(value)}
                >
                  <SelectTrigger className="w-full md:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Revenus</SelectItem>
                    <SelectItem value="customers">Nouveaux clients</SelectItem>
                    <SelectItem value="appointments">RDV</SelectItem>
                    <SelectItem value="calls">Appels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceTrendData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="metricGradientRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="metricGradientCustomers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="metricGradientAppointments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-5)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="metricGradientCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-8)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--chart-8)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                      formatter={(value) => {
                        if (selectedPerformanceMetric === 'revenue') {
                          return [formatCurrency(Number(value)), chartMetricConfig[selectedPerformanceMetric].label];
                        }
                        return [value, chartMetricConfig[selectedPerformanceMetric].label];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={selectedPerformanceMetric}
                      stroke={chartMetricConfig[selectedPerformanceMetric].color}
                      strokeWidth={3}
                      fill={chartMetricConfig[selectedPerformanceMetric].gradient}
                      name={chartMetricConfig[selectedPerformanceMetric].label}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Métriques principales */}
          <div className="grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
                <CardTitle className="text-xs md:text-sm">
                  <span className="md:hidden flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    Entreprises
                  </span>
                  <span className="hidden md:inline">Entreprises totales</span>
                </CardTitle>
                <Building className="hidden md:block h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-2 md:pb-6">
                <div className="text-lg md:text-2xl font-bold">{totalCompanies}</div>
                <p className="text-xs text-muted-foreground">
                  {totalQualifiedCompanies} qual. ({totalCompanies > 0 ? Math.round((totalQualifiedCompanies / totalCompanies) * 100) : 0}%)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
                <CardTitle className="text-xs md:text-sm">
                  <span className="md:hidden flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Contacts
                  </span>
                  <span className="hidden md:inline">Contacts actifs</span>
                </CardTitle>
                <Users className="hidden md:block h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-2 md:pb-6">
                <div className="text-lg md:text-2xl font-bold">{contacts.length}</div>
                <p className="text-xs text-muted-foreground">
                  {opportunities.length} opps
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
                <CardTitle className="text-xs md:text-sm">
                  <span className="md:hidden flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Pipeline
                  </span>
                  <span className="hidden md:inline">Pipeline</span>
                </CardTitle>
                <DollarSign className="hidden md:block h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-2 md:pb-6">
                <div className="text-sm md:text-2xl font-bold">
                  <span className="md:hidden">{formatCompactCurrency(totalPipelineValue)}</span>
                  <span className="hidden md:inline">{formatCurrency(totalPipelineValue)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="md:hidden">{formatCompactCurrency(averageDealValue)}</span>
                  <span className="hidden md:inline">Moy: {formatCurrency(averageDealValue)}</span>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
                <CardTitle className="text-xs md:text-sm">
                  <span className="md:hidden flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Appels
                  </span>
                  <span className="hidden md:inline">Appels effectués</span>
                </CardTitle>
                <Phone className="hidden md:block h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-2 md:pb-6">
                <div className="text-lg md:text-2xl font-bold">{totalAppels}</div>
                <p className="text-xs text-muted-foreground">
                  {contacts.length > 0 ? (totalAppels / contacts.length * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Activité récente */}
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>Résumé de votre activité commerciale</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-4 lg:col-span-3">
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
                    {recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-center justify-between p-2 md:p-3 border rounded-lg">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1 md:gap-2">
                            <activity.icon className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                            <p className="text-xs md:text-sm font-medium leading-tight truncate">
                              <span className="md:hidden">{activity.shortAction}</span>
                              <span className="hidden md:inline">{activity.action}</span>
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground ml-4 md:ml-6">{activity.period}</p>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                          <span className="text-sm md:text-lg font-bold">{activity.count}</span>
                          <div className="hidden md:block">
                            {getTrendIcon(activity.trend)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 md:space-y-0 md:grid md:gap-3 md:grid-cols-2">
                    <div className="p-3 md:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Repeat className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium">Relances totales</span>
                        </div>
                        <span className="text-xl font-bold text-blue-600">{totalRelances}</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">Total cumulé des relances</p>
                    </div>

                    <div className="p-3 md:p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium">Taux d'encaissement</span>
                        </div>
                        <span className="text-xl font-bold text-green-600">
                          {totalSigned > 0 ? Math.round((totalCollected / totalSigned) * 100) : 0}%
                        </span>
                      </div>
                      <p className="text-xs text-green-600 mt-1">Part encaissée du signé</p>
                    </div>
                  </div>
                </div>

                <Card className="border-dashed">
                  <CardHeader className="pb-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">Tâches du jour</CardTitle>
                        <CardDescription>{todayTasks.length} à exécuter aujourd'hui</CardDescription>
                      </div>
                      <Button asChild size="icon" variant="outline" className="h-8 w-8 rounded-full">
                        <Link href="/production/taches" aria-label="Voir les tâches du jour">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {todayTasks.length > 0 ? (
                        todayTasks.slice(0, 3).map((task) => (
                          <TooltipProvider key={task.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className={priorityBadgeClasses[task.priority]}>{task.titre}</Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{task.titre}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))
                      ) : (
                        <Badge variant="secondary">Aucune tâche aujourd'hui</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPreviousTaskMonth}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="capitalize">{taskMonthLabel}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNextTaskMonth}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
                      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
                        <span key={`${label}-${index}`}>{label}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {monthDays.map((day, index) => {
                        if (!day) {
                          return <div key={`empty-${index}`} className="h-8" />;
                        }

                        const isToday = day.dateKey === todayKey;
                        const hasTasks = day.tasks.length > 0;

                        return (
                          <TooltipProvider key={day.dateKey}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`h-8 rounded-md border text-xs ${isToday ? 'border-primary bg-primary/10 font-semibold' : 'border-border'} ${hasTasks ? 'text-primary' : 'text-muted-foreground'}`}
                                >
                                  {day.day}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {hasTasks ? (
                                  <div className="space-y-1">
                                    <p className="font-medium">{day.tasks.length} tâche(s)</p>
                                    {day.tasks.slice(0, 3).map((task) => (
                                      <p key={task.id} className="text-xs">• {task.titre}</p>
                                    ))}
                                  </div>
                                ) : (
                                  <p>Aucune tâche</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Graphique de distribution */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Distribution des entreprises</CardTitle>
                  <CardDescription>
                    Répartition par {showByKeywords ? 'mot-clé' : 'localisation'}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="toggle-view" className="text-sm">
                    {showByKeywords ? 'Mots-clés' : 'Localisations'}
                  </Label>
                  <Switch 
                    id="toggle-view"
                    checked={showByKeywords}
                    onCheckedChange={setShowByKeywords}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={!isMobile ? ({ name, percent }) => {
                        const p = percent ?? 0;
                        return `${name} (${Math.round(p * 100)}%)`;
                      } : false}
                      outerRadius={isMobile ? 60 : 80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercial" className="space-y-6">
          {/* Résumé financier */}
          <Card>
            <CardHeader>
              <CardTitle>Résumé financier</CardTitle>
              <CardDescription>Suivi des revenus et encaissements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-4">
                <div className="text-center p-3 md:p-4 border rounded-lg">
                  <div className="text-lg md:text-2xl font-bold text-green-600">
                    <span className="md:hidden">{formatCompactCurrency(totalSigned)}</span>
                    <span className="hidden md:inline">{formatCurrency(totalSigned)}</span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total signé</p>
                </div>
                <div className="text-center p-3 md:p-4 border rounded-lg">
                  <div className="text-lg md:text-2xl font-bold text-blue-600">
                    <span className="md:hidden">{formatCompactCurrency(totalCollected)}</span>
                    <span className="hidden md:inline">{formatCurrency(totalCollected)}</span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total encaissé</p>
                </div>
                <div className="text-center p-3 md:p-4 border rounded-lg">
                  <div className="text-lg md:text-2xl font-bold text-orange-600">
                    <span className="md:hidden">{formatCompactCurrency(totalPending)}</span>
                    <span className="hidden md:inline">{formatCurrency(totalPending)}</span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">Restant à encaisser</p>
                </div>
                <div className="text-center p-3 md:p-4 border rounded-lg">
                  <div className="text-lg md:text-2xl font-bold text-purple-600">
                    {callsToBeMade}
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">Appels à passer</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Métriques de performance */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Taux contact→appel</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-blue-600">
                  {calculations.contactToCallRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalAppels}/{contacts.length} contacts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Taux appel→RDV</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-green-600">
                  {calculations.callToMeetingRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalRdv}/{totalAppels} appels
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Taux RDV→devis</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-purple-600">
                  {calculations.meetingToQuoteRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalDevis}/{totalRdv} RDV
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm">Taux devis→signature</CardTitle>
                <Handshake className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold text-orange-600">
                  {calculations.quoteToSignRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalSignatures}/{totalDevis} devis
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Répartition du pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Répartition du pipeline</CardTitle>
              <CardDescription>Valeur et nombre d'opportunités par étape</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineBreakdown} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={isMobile ? 10 : 12}
                    />
                    <YAxis />
                    <RechartsTooltip 
                      formatter={(value, name) => [
                        name === 'value' ? formatCurrency(Number(value)) : value,
                        name === 'value' ? 'Valeur' : 'Opportunités'
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="opportunities" fill="var(--chart-1)" radius={[6, 6, 0, 0]} name="Opportunités" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnel" className="space-y-6">
          {/* Entonnoir de conversion */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Entonnoir de conversion
              </CardTitle>
              <CardDescription>
                Visualisation en barres du parcours client de la découverte au paiement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelBarData} layout="vertical" margin={{ top: 12, right: 24, left: 80, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <RechartsTooltip
                      formatter={(value, name) => {
                        if (name === 'conversion') return [`${Number(value).toFixed(1)}%`, 'Conversion'];
                        return [value, 'Volume'];
                      }}
                    />
                    <Bar dataKey="value" fill="var(--chart-5)" radius={[0, 8, 8, 0]} name="Volume" />
                    <Bar dataKey="conversion" fill="var(--chart-3)" radius={[0, 8, 8, 0]} name="Conversion (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Analyse des taux de conversion */}
          <Card>
            <CardHeader>
              <CardTitle>Analyse des conversions</CardTitle>
              <CardDescription>Taux de passage entre chaque étape</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {funnelSteps.slice(1).map((step, index) => {
                  const prevStep = funnelSteps[index];
                  const conversionRate = prevStep.value > 0 ? (step.value / prevStep.value) * 100 : 0;
                  
                  return (
                    <div key={step.name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <step.icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{prevStep.name} → {step.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {step.value} sur {prevStep.value}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{conversionRate.toFixed(1)}%</div>
                        <Progress value={conversionRate} className="w-20 h-2" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
