export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
};

export const formatCompactCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M€`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K€`;
  } else {
    return `${value.toFixed(0)}€`;
  }
};

export const getPeriodLabel = (period: 'week' | 'month' | 'quarter' | 'year' | 'total'): string => {
  const labels = {
    week: 'cette semaine',
    month: 'ce mois',
    quarter: 'ce trimestre', 
    year: 'cette année',
    total: 'au total'
  };
  return labels[period] || 'cette période';
};