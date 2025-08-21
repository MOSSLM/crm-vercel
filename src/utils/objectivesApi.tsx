import { projectId, publicAnonKey } from './supabase/info';
import { KPIObjective, KPIActual, PeriodType } from '../components/objectives/types';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-5c06d9e7`;

export const objectivesApi = {
  // Sauvegarder les objectifs
  async saveObjectives(objectives: KPIObjective[]): Promise<void> {
    const response = await fetch(`${API_BASE}/objectives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ objectives })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur lors de la sauvegarde des objectifs: ${error}`);
    }
  },

  // Récupérer les objectifs
  async getObjectives(): Promise<KPIObjective[]> {
    const response = await fetch(`${API_BASE}/objectives`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur lors de la récupération des objectifs: ${error}`);
    }

    return response.json();
  },

  // Récupérer les données KPI de plusieurs périodes récentes (pour le tableau)
  async getKPIDataByPeriod(periodType: PeriodType): Promise<KPIActual[]> {
    const response = await fetch(`${API_BASE}/kpi/recent-periods?type=${periodType}&count=6`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur lors de la récupération des données KPI: ${error}`);
    }

    return response.json();
  },

  // Récupérer les données historiques pour le graphique
  async getHistoricalKPIData(periodType: PeriodType, limit: number = 24): Promise<KPIActual[]> {
    const response = await fetch(`${API_BASE}/kpi/historical?type=${periodType}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur lors de la récupération des données historiques: ${error}`);
    }

    return response.json();
  }
};