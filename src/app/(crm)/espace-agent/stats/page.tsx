import { AnalyticsRadarApp } from "@/components/studio/analytics-radar/AnalyticsRadarApp";

/**
 * Mêmes stats que /radar-analytics (admin), sans filtrage par
 * agent : l'API /api/analytics-radar n'est jamais scopée par propriétaire —
 * tout utilisateur authentifié voit le trafic de tous les sites démo.
 * L'auth + le rail agent sont déjà posés par (crm)/espace-agent/layout.tsx.
 */
export default function AgentStatsRoute() {
  return <AnalyticsRadarApp />;
}
