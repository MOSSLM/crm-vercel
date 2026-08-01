import { SalesPipeline } from "@/components/sales-pipeline/SalesPipeline";

/**
 * Pipeline commercial côté agent : ses prospects uniquement. Mêmes colonnes que
 * la vue admin — l'attribution ayant déjà eu lieu, le filtre par agent et la
 * barre de réglages du régulateur disparaissent.
 */
export default function EspaceAgentPipelineCommercialPage() {
  return <SalesPipeline variant="agent" />;
}
