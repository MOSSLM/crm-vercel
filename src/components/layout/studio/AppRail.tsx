"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Settings, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/AuthContext";
import { SPACES, getSpaceFromPath } from "@/components/layout/spaces";

function initialsOf(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Level 1 of the Studio shell: the slim dark rail. One click = one business
 * space. The logo always returns to the Studio Hub.
 */
export function AppRail() {
  const pathname = usePathname() ?? "";
  const activeSpace = getSpaceFromPath(pathname);
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-[#14120E] py-2.5">
      {/* Brand → Studio Hub */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/dashboard"
            aria-label="Studio — accueil"
            className="mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary font-mono text-[13px] font-semibold tracking-tight text-primary-foreground transition-opacity hover:opacity-90"
          >
            S
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Studio · accueil</TooltipContent>
      </Tooltip>

      {SPACES.filter((s) => s.id !== "hub").map((space) => {
        const isActive = activeSpace === space.id;
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
            href="/docs/themes"
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
            href="/settings"
            aria-label="Réglages"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Réglages</TooltipContent>
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

export default AppRail;
