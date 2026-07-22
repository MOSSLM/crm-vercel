"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAgentSpaceById, getAgentSpaceFromPath } from "@/components/agent-portal/agentSpaces";

/**
 * Level 2 of the agent shell: the tools of the active section. Hidden on
 * mobile (the bottom nav takes over). Mirrors the admin SpaceSubNav.
 */
export function AgentSubNav() {
  const pathname = usePathname() ?? "";
  const space = getAgentSpaceById(getAgentSpaceFromPath(pathname));

  const isActive = (href: string, activeHref?: string) => {
    const target = activeHref ?? href;
    return pathname === target || pathname.startsWith(target + "/");
  };

  return (
    <nav
      aria-label={space.label}
      className="hidden md:flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-[var(--surface-2)] px-2.5 py-3"
    >
      <div className="flex items-center gap-2 px-2 pb-2">
        <space.icon className="h-4 w-4 text-primary" strokeWidth={2} />
        <span className="text-sm font-semibold tracking-tight">{space.label}</span>
      </div>

      {space.tools.map((tool) => {
        const active = isActive(tool.href, tool.activeHref);
        const Icon = tool.icon;
        return (
          <Link
            key={tool.href + tool.title}
            href={tool.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--accent-tint)] font-medium text-primary"
                : "text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span className="truncate">{tool.title}</span>
            {tool.soon && (
              <span className="ml-auto shrink-0 rounded-full bg-[var(--bg-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                Bientôt
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default AgentSubNav;
