export const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

export const PERIOD_OPTIONS = [
  { value: 'week', label: 'Semaine', icon: 'CalendarDays' },
  { value: 'month', label: 'Mois', icon: 'Calendar' },
  { value: 'quarter', label: 'Trimestre', icon: 'CalendarRange' },
  { value: 'year', label: 'Année', icon: 'Calendar' },
  { value: 'total', label: 'Total', icon: 'TrendingUp' }
] as const;

export const PERIOD_LABELS = {
  week: 'cette semaine',
  month: 'ce mois', 
  quarter: 'ce trimestre',
  year: 'cette année',
  total: 'au total'
} as const;