import { MarketingWebPipeline } from "@/components/MarketingWebPipeline";

/**
 * Marketing pipeline côté agent : ses entreprises attribuées uniquement, et
 * 4 étapes — l'attribution ayant déjà eu lieu, sa colonne disparaît.
 * L'accès est gardé côté serveur par la capacité `marketing_pipeline`.
 */
export default function EspaceAgentMarketingPipelinePage() {
  return <MarketingWebPipeline variant="agent" />;
}
