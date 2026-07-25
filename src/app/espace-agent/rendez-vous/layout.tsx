import type { ReactNode } from "react";
import CalShell from "@/components/scheduling/host/CalShell";

/**
 * Section Cal.SAMA (agent) : même sidebar que côté admin (sans Équipe),
 * le guard de rôle est déjà assuré par le layout parent espace-agent.
 */
export default function AgentRendezVousLayout({ children }: { children: ReactNode }) {
  return <CalShell basePath="/espace-agent/rendez-vous">{children}</CalShell>;
}
