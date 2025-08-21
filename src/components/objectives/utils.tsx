"use client";

import { Period, PeriodType } from './types';

export const generatePeriods = (type: PeriodType, count: number = 12): Period[] => {
  const periods: Period[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  
  switch (type) {
    case 'week':
      // Générer les 12 prochaines semaines
      for (let i = 0; i < count; i++) {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1 + (i * 7)); // Lundi
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Dimanche
        
        const weekNumber = getWeekNumber(startOfWeek);
        
        periods.push({
          id: `week-${currentYear}-${weekNumber + i}`,
          type: 'week',
          label: `Semaine ${weekNumber + i}`,
          startDate: startOfWeek,
          endDate: endOfWeek,
          number: weekNumber + i
        });
      }
      break;
      
    case 'month':
      // Générer les 12 prochains mois
      for (let i = 0; i < count; i++) {
        const date = new Date(currentYear, now.getMonth() + i, 1);
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        periods.push({
          id: `month-${date.getFullYear()}-${date.getMonth() + 1}`,
          type: 'month',
          label: `${getMonthName(date.getMonth())} ${date.getFullYear()}`,
          startDate: startOfMonth,
          endDate: endOfMonth
        });
      }
      break;
      
    case 'quarter':
      // Générer les 8 prochains trimestres
      for (let i = 0; i < Math.min(count, 8); i++) {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const quarterIndex = (currentQuarter + i) % 4;
        const yearOffset = Math.floor((currentQuarter + i) / 4);
        const year = currentYear + yearOffset;
        
        const startMonth = quarterIndex * 3;
        const startOfQuarter = new Date(year, startMonth, 1);
        const endOfQuarter = new Date(year, startMonth + 3, 0);
        
        periods.push({
          id: `quarter-${year}-${quarterIndex + 1}`,
          type: 'quarter',
          label: `Q${quarterIndex + 1} ${year}`,
          startDate: startOfQuarter,
          endDate: endOfQuarter,
          number: quarterIndex + 1
        });
      }
      break;
      
    case 'year':
      // Générer les 5 prochaines années
      for (let i = 0; i < Math.min(count, 5); i++) {
        const year = currentYear + i;
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        periods.push({
          id: `year-${year}`,
          type: 'year',
          label: `${year}`,
          startDate: startOfYear,
          endDate: endOfYear
        });
      }
      break;
  }
  
  return periods;
};

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const getMonthName = (month: number): string => {
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return months[month];
};

export const calculateCompletionRate = (actual: number, objective: number): number => {
  if (objective === 0) return 0;
  return Math.min((actual / objective) * 100, 100);
};

export const getCompletionColor = (rate: number): string => {
  if (rate >= 100) return 'text-green-600';
  if (rate >= 75) return 'text-blue-600';
  if (rate >= 50) return 'text-yellow-600';
  return 'text-red-600';
};

export const getProgressBarColor = (rate: number): string => {
  if (rate >= 100) return 'bg-green-500';
  if (rate >= 75) return 'bg-blue-500';
  if (rate >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
};