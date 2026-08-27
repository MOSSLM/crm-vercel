"use client";

import React, { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CallProvider } from "@/components/telephony/CallProvider";
import { AgentRail } from "./studio/AgentRail";
import { AgentSubNav } from "./studio/AgentSubNav";
import { AgentTopbar } from "./studio/AgentTopbar";
import { AgentStatusBar } from "./studio/AgentStatusBar";
import { AgentMobileNav } from "./studio/AgentMobileNav";
import { AgentCommandMenu } from "./AgentCommandMenu";

type Props = { children: ReactNode };

/**
 * The agent shell: rail (level 1) + sub-nav (level 2) + topbar + content.
 * Same two-level Studio architecture as the admin, scoped to the agent's own
 * sections and routes.
 */
export default function AgentPortalLayout({ children }: Props) {
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CallProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          <AgentRail />
          <AgentSubNav />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AgentTopbar onOpenSearch={() => setCmdkOpen(true)} />
            {/*
              LE DÉGAGEMENT SOUS LA BARRE D'ONGLETS EST POSÉ ICI, ET NULLE PART
              AILLEURS. La barre est en `fixed` : sans marge basse, elle recouvre
              la dernière ligne de chaque écran. `pb-24` ne suffisait pas sur un
              iPhone à indicateur d'accueil — la barre porte elle-même
              `env(safe-area-inset-bottom)` et dépasse donc les 6 rem prévus.

              Le calcul reprend le même `env()`, si bien que les deux grandissent
              ensemble. Le poser par écran (l'ancien `.mobile-safe-pb`) obligeait
              à s'en souvenir à chaque nouvelle page, et à le corriger partout le
              jour où la hauteur de la barre change.
            */}
            <main className="flex flex-1 flex-col overflow-auto pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0">
              {children}
            </main>
            <AgentStatusBar />
          </div>
        </div>
        <AgentMobileNav />
        <AgentCommandMenu open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </TooltipProvider>
    </CallProvider>
  );
}
