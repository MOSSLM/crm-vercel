import { JournalKpiTotals, JournalKpiPeriodTotals } from '../../utils/journalApi';
import { DashboardCalculations, FunnelStepData, PipelineBreakdownData, RecentActivity, PeriodType } from './types';
import { Contact, Opportunity, PipelineStage } from '@/types';
import {
  Building,
  Users,
  Phone,
  Calendar,
  CheckCircle,
  FileText,
  Handshake,
  Banknote,
  Repeat,
  Star
} from 'lucide-react';

export const getCurrentPeriodData = (journalKpis: JournalKpiTotals, selectedPeriod: PeriodType): JournalKpiPeriodTotals => {
  if (selectedPeriod === 'total') {
    return {
      total_appels: journalKpis.total_appels,
      total_relances: journalKpis.total_relances,
      total_rdvs: journalKpis.total_rdvs,
      total_devis: journalKpis.total_devis,
      total_signatures: journalKpis.total_signatures,
      total_acomptes: journalKpis.total_acomptes,
      total_lead_magnets: journalKpis.total_lead_magnets
    };
  }
  return journalKpis[selectedPeriod];
};

export const calculateDashboardMetrics = (
  journalKpis: JournalKpiTotals,
  selectedPeriod: PeriodType,
  opportunities: Opportunity[],
  pipelineStages: PipelineStage[],
  getOpportunitiesByStage: (stageId: string) => Opportunity[],
  contacts: Contact[],
  totalCompanies: number,
  totalQualifiedCompanies: number
): DashboardCalculations => {
  const findStageByName = (name: string) => 
    pipelineStages.find(stage => stage.nom.toLowerCase().includes(name.toLowerCase()));

  const currentData = getCurrentPeriodData(journalKpis, selectedPeriod);
  const totalRelances = currentData.total_relances;
  const totalAppels = currentData.total_appels;
  const totalRdv = currentData.total_rdvs;
  const totalDevis = currentData.total_devis;
  const totalSignatures = currentData.total_signatures;
  const totalAcomptes = currentData.total_acomptes;
  const totalLeadMagnets = currentData.total_lead_magnets;

  // Calculs des métriques CRM
  const qualifiedOpportunities = opportunities.filter(opp => {
    const asideStage = findStageByName('côté');
    return opp.stage_id !== asideStage?.id;
  });
  
  const totalPipelineValue = qualifiedOpportunities.reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0);
  const averageDealValue = qualifiedOpportunities.length > 0 ? totalPipelineValue / qualifiedOpportunities.length : 0;

  // Calcul des appels à passer
  const qualifiedStage = findStageByName('qualifié');
  const callsToBeMade = qualifiedStage ? getOpportunitiesByStage(qualifiedStage.id.toString()).length : 0;

  // Métriques financières
  const signedOpportunities = opportunities.filter(opp => {
    const signatureStage = findStageByName('signature');
    if (!signatureStage) return false;
    const currentStage = pipelineStages.find(s => s.id === opp.stage_id);
    return currentStage && currentStage.ordre >= signatureStage.ordre;
  });

  const depositOpportunities = opportunities.filter(opp => {
    const currentStage = pipelineStages.find(s => s.id === opp.stage_id);
    return currentStage && currentStage.nom.toLowerCase().includes('acompte');
  });

  const totalSigned = signedOpportunities.reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0);
  const totalCollected = depositOpportunities.reduce((sum, opp) => sum + ((opp.value || opp.montant || 0) * 0.5), 0);
  
  const signedNotDepositOpportunities = signedOpportunities.filter(opp => 
    !depositOpportunities.some(depOpp => depOpp.id === opp.id)
  );
  const totalPendingFromSigned = signedNotDepositOpportunities.reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0);
  const totalPendingFromDeposit = depositOpportunities.reduce((sum, opp) => sum + ((opp.value || opp.montant || 0) * 0.5), 0);
  const totalPending = totalPendingFromSigned + totalPendingFromDeposit;

  // Cold call playbook metrics (always on monthly basis for the projection card)
  const PLAYBOOK_WORKING_DAYS = 22;
  const monthAppels = journalKpis.month.total_appels;
  const monthRdvs   = journalKpis.month.total_rdvs;
  const monthSigs   = journalKpis.month.total_signatures;
  const appelsParJour   = monthAppels / PLAYBOOK_WORKING_DAYS;
  const tauxInteretReel = monthAppels > 0 ? (monthRdvs / monthAppels) * 100 : 0;
  const tauxClosingReel = monthRdvs   > 0 ? (monthSigs / monthRdvs)   * 100 : 0;
  const avgPaidPrice    = depositOpportunities.length > 0
    ? depositOpportunities.reduce((s, o) => s + (o.value || o.montant || 0), 0) / depositOpportunities.length
    : 0;

  // Taux de conversion
  const contactToCallRate = contacts.length > 0 ? (totalAppels / contacts.length) * 100 : 0;
  const callToMeetingRate = totalAppels > 0 ? (totalRdv / totalAppels) * 100 : 0;
  const meetingToQuoteRate = totalRdv > 0 ? (totalDevis / totalRdv) * 100 : 0;
  const quoteToSignRate = totalDevis > 0 ? (totalSignatures / totalDevis) * 100 : 0;

  // Données pour l'entonnoir
  const funnelSteps: FunnelStepData[] = [
    { 
      name: 'Entreprises trouvées', 
      value: totalCompanies, 
      percentage: 100, 
      color: 'bg-slate-600',
      icon: Building,
      description: 'Base de données découverte'
    },
    { 
      name: 'Qualifiées', 
      value: totalQualifiedCompanies, 
      percentage: totalCompanies > 0 ? (totalQualifiedCompanies / totalCompanies) * 100 : 0,
      color: 'bg-gray-600',
      icon: CheckCircle,
      description: 'Prospects validés'
    },
    { 
      name: 'Contactées', 
      value: contacts.length, 
      percentage: totalCompanies > 0 ? (contacts.length / totalCompanies) * 100 : 0,
      color: 'bg-zinc-600',
      icon: Users,
      description: 'Premiers contacts établis'
    },
    { 
      name: 'Appelées', 
      value: totalAppels, 
      percentage: totalCompanies > 0 ? (totalAppels / totalCompanies) * 100 : 0,
      color: 'bg-neutral-600',
      icon: Phone,
      description: 'Appels commerciaux réalisés'
    },
    { 
      name: 'RDV obtenus', 
      value: totalRdv, 
      percentage: totalCompanies > 0 ? (totalRdv / totalCompanies) * 100 : 0,
      color: 'bg-stone-600',
      icon: Calendar,
      description: 'Rendez-vous programmés'
    },
    { 
      name: 'Devis envoyés', 
      value: totalDevis, 
      percentage: totalCompanies > 0 ? (totalDevis / totalCompanies) * 100 : 0,
      color: 'bg-gray-700',
      icon: FileText,
      description: 'Propositions commerciales'
    },
    { 
      name: 'Signatures', 
      value: totalSignatures, 
      percentage: totalCompanies > 0 ? (totalSignatures / totalCompanies) * 100 : 0,
      color: 'bg-slate-700',
      icon: Handshake,
      description: 'Contrats signés'
    },
    { 
      name: 'Acomptes', 
      value: totalAcomptes, 
      percentage: totalCompanies > 0 ? (totalAcomptes / totalCompanies) * 100 : 0,
      color: 'bg-zinc-700',
      icon: Banknote,
      description: 'Paiements reçus'
    }
  ];

  const pipelineBreakdown: PipelineBreakdownData[] = pipelineStages
    .filter(stage => !stage.nom.toLowerCase().includes('côté'))
    .map(stage => {
      const stageOpps = getOpportunitiesByStage(String(stage.id));
      const stageValue = stageOpps.reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0);
      return {
        name: stage.nom,
        opportunities: stageOpps.length,
        value: stageValue,
        color: '#3b82f6'
      };
    })
    .filter(stage => stage.opportunities > 0);

  const recentActivity: RecentActivity[] = [
    { action: 'Entreprises trouvées', count: totalCompanies, period: 'base prospection', trend: 'up', icon: Building, shortAction: 'Trouvées' },
    { action: 'Entreprises qualifiées', count: totalQualifiedCompanies, period: 'validation', trend: 'up', icon: CheckCircle, shortAction: 'Qualifiées' },
    { action: 'Appels effectués', count: totalAppels, period: 'activité réelle', trend: 'stable', icon: Phone, shortAction: 'Appels' },
    { action: 'Relances totales', count: totalRelances, period: 'suivi actif', trend: 'up', icon: Repeat, shortAction: 'Relances' },
    { action: 'RDV obtenus', count: totalRdv, period: 'meetings', trend: 'up', icon: Calendar, shortAction: 'RDV' },
    { action: 'Devis envoyés', count: totalDevis, period: 'propositions', trend: 'up', icon: FileText, shortAction: 'Devis' },
    { action: 'Signatures obtenues', count: totalSignatures, period: 'contrats', trend: 'up', icon: Handshake, shortAction: 'Signatures' },
    { action: 'Acomptes reçus', count: totalAcomptes, period: 'paiements', trend: 'up', icon: Banknote, shortAction: 'Acomptes' },
    { action: 'Lead magnets prêts', count: totalLeadMagnets, period: 'production', trend: 'up', icon: Star, shortAction: 'Lead Magnets' }
  ];

  return {
    currentData,
    totalRelances,
    totalAppels,
    totalRdv,
    totalDevis,
    totalSignatures,
    totalAcomptes,
    totalLeadMagnets,
    qualifiedOpportunities,
    totalPipelineValue,
    averageDealValue,
    callsToBeMade,
    signedOpportunities,
    depositOpportunities,
    totalSigned,
    totalCollected,
    totalPending,
    contactToCallRate,
    callToMeetingRate,
    meetingToQuoteRate,
    quoteToSignRate,
    funnelSteps,
    pipelineBreakdown,
    recentActivity,
    appelsParJour,
    tauxInteretReel,
    tauxClosingReel,
    avgPaidPrice
  };
};