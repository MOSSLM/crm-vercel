"use client";

import React, { useState, useEffect } from 'react';
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
  LineChart,
  Line
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
  CalendarRange
} from 'lucide-react';

// Local imports
import { COLORS } from './dashboard/constants';
import { formatCurrency, formatCompactCurrency, getPeriodLabel } from './dashboard/helpers';
import { PeriodType } from './dashboard/types';
import { calculateDashboardMetrics } from './dashboard/calculations';
import { FunnelStep } from './dashboard/FunnelStep';

type ViewMode = 'overview' | 'commercial' | 'funnel';

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

  // Charger les KPI du journal
  useEffect(() => {
    const loadJournalKpis = async () => {
      try {
        setLoadingKpis(true);
        setKpiError(null);
        
        const kpis = await journalApi.getJournalKpiTotals();
        setJournalKpis(kpis);
      } catch (error) {
        console.error('Erreur lors du chargement des KPI du journal:', error);
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

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): React.ReactElement => {
    switch (trend) {
      case 'up': return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'down': return <ArrowDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
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
              
              {/* Métriques spéciales - Full width sur mobile */}
              <div className="mt-3 md:mt-4 space-y-3 md:space-y-0 md:grid md:gap-3 md:grid-cols-2">
                <div className="p-3 md:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium">Relances totales</span>
                    </div>
                    <span className="text-xl font-bold text-blue-600">{totalRelances}</span>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    Total cumulé des relances
                  </p>
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
                  <p className="text-xs text-green-600 mt-1">
                    Part encaissée du signé
                  </p>
                </div>
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
                      label={({ name, percent }) => {
                        const p = percent ?? 0;
                        return `${name} (${Math.round(p * 100)}%)`;
                      }}
                      outerRadius={isMobile ? 60 : 80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
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
                  <BarChart data={pipelineBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
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
                    <Bar dataKey="opportunities" fill="#3b82f6" name="Opportunités" />
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
                Visualisation du parcours client de la découverte au paiement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center space-y-2 md:space-y-4 py-4">
                {funnelSteps.map((step, index) => (
                  <FunnelStep 
                    key={step.name}
                    step={step} 
                    index={index} 
                    isLast={index === funnelSteps.length - 1}
                    totalCompanies={totalCompanies}
                    funnelSteps={funnelSteps}
                  />
                ))}
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
