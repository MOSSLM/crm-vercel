"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Settings, LogOut, Radar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/AuthContext";
import { AGENT_SPACES, getAgentSpaceFromPath } from "@/components/agent-portal/agentSpaces";

function initialsOf(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Level 1 of the agent shell: the slim dark rail. One click = one section.
 * The logo always returns to the agent dashboard. Mirrors the admin AppRail.
 */
export function AgentRail() {
  const pathname = usePathname() ?? "";
  const activeSpace = getAgentSpaceFromPath(pathname);
  const isRadarActive = pathname === "/espace-agent/stats" || pathname.startsWith("/espace-agent/stats/");
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-[#122844] py-2.5">
      {/* Brand → agent dashboard */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/espace-agent/dashboard"
            aria-label="SAMA — espace agent"
            className="mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary font-mono text-[13px] font-semibold tracking-tight text-primary-foreground transition-opacity hover:opacity-90"
          >
            S
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">SAMA · espace agent</TooltipContent>
      </Tooltip>

      {AGENT_SPACES.filter((s) => !s.utility).map((space) => {
        // Stats vit hors du modèle « section » (cf. plus bas) : sans route
        // dédiée dans PATH_TO_SPACE, getAgentSpaceFromPath retombe sur son
        // défaut ("pilotage"), ce qui allumerait Pilotage en même temps que
        // Stats si on ne l'excluait pas explicitement ici.
        const isActive = activeSpace === space.id && !isRadarActive;
        const Icon = space.icon;
        return (
          <Tooltip key={space.id}>
            <TooltipTrigger asChild>
              <Link
                href={space.href}
                aria-label={space.label}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors",
                  isActive
                    ? "bg-white/[0.08] text-white before:absolute before:-left-[10px] before:top-1/2 before:h-[22px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[3px] before:bg-primary before:content-['']"
                    : "text-white/45 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{space.label}</TooltipContent>
          </Tooltip>
        );
      })}

      <div className="my-1.5 h-px w-[22px] bg-white/[0.08]" />

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/espace-agent/parametres"
            aria-label="Aide"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Aide</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/espace-agent/parametres"
            aria-label="Réglages"
            aria-current={activeSpace === "reglages" ? "page" : undefined}
            className={[
              "flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors",
              activeSpace === "reglages"
                ? "bg-white/[0.08] text-white"
                : "text-white/45 hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Réglages</TooltipContent>
      </Tooltip>

      {/*
        Même stats que côté admin, sans filtre par prospect : un agent voit le
        trafic de TOUS les sites démo, pas seulement les siens. Icône dédiée,
        tout en bas — hors du modèle « section » comme sur le rail admin.
      */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/espace-agent/stats"
            aria-label="Stats"
            aria-current={isRadarActive ? "page" : undefined}
            className={[
              "flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors",
              isRadarActive
                ? "bg-white/[0.08] text-white"
                : "text-white/45 hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            <Radar className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Stats</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={logout}
            aria-label="Déconnexion"
            className="mt-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tracking-tight text-primary-foreground transition-opacity hover:opacity-90"
          >
            {initialsOf(user?.name)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-1.5">
          <LogOut className="h-3 w-3" />
          {user?.name ? `${user.name} · déconnexion` : "Déconnexion"}
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}

export default AgentRail;
