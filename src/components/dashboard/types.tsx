import { JournalKpiPeriodTotals } from '../../utils/journalApi';

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
  qualifiedOpportunities: any[];
  totalPipelineValue: number;
  averageDealValue: number;
  callsToBeMade: number;
  signedOpportunities: any[];
  depositOpportunities: any[];
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
}