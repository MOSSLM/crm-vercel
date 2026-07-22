"use client";

import React, { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { StudioCommandMenu } from "@/components/StudioCommandMenu";
import { AppRail } from "./AppRail";
import { SpaceSubNav } from "./SpaceSubNav";
import { StudioTopbar } from "./StudioTopbar";
import { StudioStatusBar } from "./StudioStatusBar";
import { CallProvider } from "@/components/telephony/CallProvider";

/** Fire this to open the Cmd+K palette from anywhere (e.g. the Hub hero). */
export const STUDIO_OPEN_COMMAND_EVENT = "studio:open-command";

export function openStudioCommand() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STUDIO_OPEN_COMMAND_EVENT));
  }
}

/**
 * The Studio shell: rail (level 1) + sub-nav (level 2) + topbar + content.
 * Rendered inside AppLayout, so every admin page gets it automatically.
 */
export function StudioShell({ children }: { children: ReactNode }) {
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((prev) => !prev);
      }
    };
    const onOpen = () => setCmdkOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(STUDIO_OPEN_COMMAND_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(STUDIO_OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  return (
    <CallProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          <AppRail />
          <SpaceSubNav />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <StudioTopbar onOpenSearch={() => setCmdkOpen(true)} />
            <main className="flex flex-1 flex-col overflow-auto pb-24 md:pb-0">{children}</main>
            <StudioStatusBar />
          </div>
        </div>
        <MobileBottomNav />
        <StudioCommandMenu open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </TooltipProvider>
    </CallProvider>
  );
}

export default StudioShell;
