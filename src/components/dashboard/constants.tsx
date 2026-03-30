export const COLORS = [
  'var(--chart-1, #3b82f6)',
  'var(--chart-2, #ef4444)',
  'var(--chart-3, #10b981)',
  'var(--chart-4, #f59e0b)',
  'var(--chart-5, #8b5cf6)',
  'var(--chart-6, #06b6d4)',
  'var(--chart-7, #84cc16)',
  'var(--chart-8, #f97316)'
];

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
