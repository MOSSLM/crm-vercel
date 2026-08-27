"use client";

/**
 * Le démarchage, côté agent. L'écran lui-même vit dans
 * `@/components/agent-portal/demarchage/EcranDemarchage` — il est monté à
 * l'identique par `/terrain`, la porte de l'admin. Voir son en-tête.
 */

import { EcranDemarchage } from "@/components/agent-portal/demarchage/EcranDemarchage";

export default function AgentDemarchagePage() {
  return <EcranDemarchage />;
}
