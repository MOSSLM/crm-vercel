"use client";

import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Settings, Target, TrendingUp, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ObjectivesModal } from './objectives/ObjectivesModal';
import { ObjectivesTable } from './objectives/ObjectivesTable';
import { ObjectivesChart } from './objectives/ObjectivesChart';
import { objectivesApi } from '../utils/objectivesApi';
import { 
  PeriodType, 
  KPIObjective, 
  KPIActual, 
  PeriodComparison,
} from './objectives/types';
import { calculateCompletionRate } from './objectives/utils';

import logger from '../utils/logger';
export const ObjectivesProgressPage: React.FC = () => {
  const [selectedPeriodType, setSelectedPeriodType] = useState<PeriodType>('month');
  const [isObjectivesModalOpen, setIsObjectivesModalOpen] = useState(false);
  const [objectives, setObjectives] = useState<KPIObjective[]>([]);
  const [kpiData, setKpiData] = useState<KPIActual[]>([]);
  const [historicalData, setHistoricalData] = useState<KPIActual[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les données initiales
  useEffect(() => {
    loadData();
  }, [selectedPeriodType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [objectivesData, kpiCurrentData, historicalKpiData] = await Promise.all([
        objectivesApi.getObjectives(),
        objectivesApi.getKPIDataByPeriod(selectedPeriodType),
        objectivesApi.getHistoricalKPIData(selectedPeriodType, 24)
      ]);

      setObjectives(objectivesData);
      setKpiData(kpiCurrentData);
      setHistoricalData(historicalKpiData);
    } catch (error) {
      logger.error('Erreur lors du chargement des données:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveObjectives = async (newObjectives: KPIObjective[]) => {
    try {
      await objectivesApi.saveObjectives(newObjectives);
      await loadData(); // Recharger les données
      toast.success('Objectifs sauvegardés avec succès');
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde des objectifs');
    }
  };

  // Combiner les données KPI avec les objectifs
  const combineDataWithObjectives = (): PeriodComparison[] => {
    return kpiData.map(kpiItem => {
      // Chercher l'objectif correspondant à cette période
      const objectiveForPeriod = objectives.find(obj => 
        obj.period_unit === selectedPeriodType &&
        obj.period_start === kpiItem.period_start &&
        obj.period_end === kpiItem.period_end
      );

      const completion_rates = {
        leads_trouves: calculateCompletionRate(kpiItem.leads_trouves, objectiveForPeriod?.leads_trouves || 0),
        leads_qualifies: calculateCompletionRate(kpiItem.leads_qualifies, objectiveForPeriod?.leads_qualifies || 0),
        appels: calculateCompletionRate(kpiItem.appels, objectiveForPeriod?.appels || 0),
        rdv: calculateCompletionRate(kpiItem.rdv, objectiveForPeriod?.rdv || 0),
        devis: calculateCompletionRate(kpiItem.devis, objectiveForPeriod?.devis || 0),
        relances: calculateCompletionRate(kpiItem.relances, objectiveForPeriod?.relances || 0),
        signatures: calculateCompletionRate(kpiItem.signatures, objectiveForPeriod?.signatures || 0),
        acomptes: calculateCompletionRate(kpiItem.acomptes, objectiveForPeriod?.acomptes || 0),
        leadmagnets: calculateCompletionRate(kpiItem.leadmagnets, objectiveForPeriod?.leadmagnets || 0),
        relances_total: calculateCompletionRate(kpiItem.relances_total, objectiveForPeriod?.relances_total || 0),
        ca: calculateCompletionRate(kpiItem.ca, objectiveForPeriod?.ca || 0),
        mrr: calculateCompletionRate(kpiItem.mrr, objectiveForPeriod?.mrr || 0)
      };

      return {
        ...kpiItem,
        objectives: objectiveForPeriod || null,
        completion_rates
      };
    });
  };

  const combinedData = combineDataWithObjectives();
  const periodsWithObjectives = combinedData.filter(item => item.objectives !== null).length;
  const averageCompletion = combinedData
    .filter(item => item.objectives !== null)
    .reduce((acc, item) => {
      const rates = Object.values(item.completion_rates);
      const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
      return acc + avgRate;
    }, 0) / Math.max(periodsWithObjectives, 1);

  const getPeriodTypeLabel = (type: PeriodType): string => {
    switch (type) {
      case 'week': return 'Semaines';
      case 'month': return 'Mois';
      case 'quarter': return 'Trimestres';
      case 'year': return 'Années';
      default: return 'Périodes';
    }
  };


  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-64 mb-4"></div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Objectifs & Progression</h1>
          <p className="text-muted-foreground">
            Définissez vos objectifs et suivez vos performances à partir de kpi_daily_facts, pipeline_events et kpi_targets
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select 
            value={selectedPeriodType} 
            onValueChange={(value: PeriodType) => setSelectedPeriodType(value)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semaines</SelectItem>
              <SelectItem value="month">Mois</SelectItem>
              <SelectItem value="quarter">Trimestres</SelectItem>
              <SelectItem value="year">Années</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setIsObjectivesModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Définir objectifs
          </Button>
        </div>
      </div>

      {/* Métriques de résumé */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Périodes avec objectifs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{periodsWithObjectives}</div>
            <p className="text-xs text-muted-foreground">
              sur {combinedData.length} {getPeriodTypeLabel(selectedPeriodType).toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Réalisation moyenne</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {periodsWithObjectives > 0 ? `${averageCompletion.toFixed(0)}%` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {periodsWithObjectives > 0 ? 'Tous KPI confondus' : 'Aucun objectif défini'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Données historiques</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{historicalData.length}</div>
            <p className="text-xs text-muted-foreground">
              {getPeriodTypeLabel(selectedPeriodType).toLowerCase()} disponibles
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contenu principal avec onglets */}
      <Tabs defaultValue="table" className="space-y-4">
        <TabsList>
          <TabsTrigger value="table">Tableau de suivi</TabsTrigger>
          <TabsTrigger value="chart">Graphique temporel</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="space-y-4">
          <ObjectivesTable 
            data={combinedData.sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime())} 
            periodType={getPeriodTypeLabel(selectedPeriodType)}
          />
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <ObjectivesChart 
            data={historicalData}
            title={`Évolution des KPI par ${getPeriodTypeLabel(selectedPeriodType).toLowerCase()}`}
          />
        </TabsContent>
      </Tabs>

      {/* Modal de définition des objectifs */}
      <ObjectivesModal
        open={isObjectivesModalOpen}
        onClose={() => setIsObjectivesModalOpen(false)}
        onSave={handleSaveObjectives}
        existingObjectives={objectives}
        initialPeriodType={selectedPeriodType}
      />
    </div>
  );
};