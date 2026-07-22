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
            <main className="flex flex-1 flex-col overflow-auto pb-24 md:pb-0">{children}</main>
            <AgentStatusBar />
          </div>
        </div>
        <AgentMobileNav />
        <AgentCommandMenu open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </TooltipProvider>
    </CallProvider>
  );
}
