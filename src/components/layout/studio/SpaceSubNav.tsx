"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSpaceById, getSpaceFromPath } from "@/components/layout/spaces";

/**
 * Level 2 of the Studio shell: the tools of the active space. Hidden on the
 * Hub (which uses the full width) and on mobile (the bottom nav takes over).
 */
export function SpaceSubNav() {
  const pathname = usePathname() ?? "";
  const activeSpaceId = getSpaceFromPath(pathname);

  if (activeSpaceId === "hub") return null;

  const space = getSpaceById(activeSpaceId);
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
          </Link>
        );
      })}
    </nav>
  );
}

export default SpaceSubNav;
