import { JournalKpiPeriodTotals } from '../../utils/journalApi';
import { Opportunity } from '../../types';

export interface RecentActivity {
  action: string;
  count: number;
  period: string;
  trend: 'up' | 'down' | 'stable';
  icon: React.ComponentType<{ className?: string }>;
  shortAction: string;
}

export interface FunnelStepData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export interface PipelineBreakdownData {
  name: string;
  opportunities: number;
  value: number;
  color: string;
}

export type PeriodType = 'week' | 'month' | 'quarter' | 'year' | 'total';

export interface DashboardCalculations {
  currentData: JournalKpiPeriodTotals;
  totalRelances: number;
  totalAppels: number;
  totalRdv: number;
  totalDevis: number;
  totalSignatures: number;
  totalAcomptes: number;
  totalLeadMagnets: number;
  qualifiedOpportunities: Opportunity[];
  totalPipelineValue: number;
  averageDealValue: number;
  callsToBeMade: number;
  signedOpportunities: Opportunity[];
  depositOpportunities: Opportunity[];
  totalSigned: number;
  totalCollected: number;
  totalPending: number;
  contactToCallRate: number;
  callToMeetingRate: number;
  meetingToQuoteRate: number;
  quoteToSignRate: number;
  funnelSteps: FunnelStepData[];
  pipelineBreakdown: PipelineBreakdownData[];
  recentActivity: RecentActivity[];
  // Cold call playbook metrics (monthly basis)
  appelsParJour: number;
  tauxInteretReel: number;
  tauxClosingReel: number;
  avgPaidPrice: number;
}