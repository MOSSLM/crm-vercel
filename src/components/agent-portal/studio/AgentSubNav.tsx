"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getAgentSpaceById, getAgentSpaceFromPath } from "@/components/agent-portal/agentSpaces";
import { useAgentCapabilities } from "@/components/agent-portal/useAgentCapabilities";

/** Le pli du sous-menu suit l'agent d'une page à l'autre, et d'une session à l'autre. */
const STORAGE_KEY = "agent:subnav-collapsed";

/**
 * Level 2 of the agent shell: the tools of the active section. Hidden on
 * mobile (the bottom nav takes over). Mirrors the admin SpaceSubNav.
 *
 * REPLIABLE — les écrans de travail de l'agent (Démarchage en tête) sont des
 * grilles à trois colonnes qui réclament toute la largeur disponible. 224 px
 * de sous-menu permanent, c'est la colonne de droite qui saute sur un 13
 * pouces. Le pli n'enlève RIEN : les mêmes outils restent là, en icônes, avec
 * leur libellé en infobulle.
 */
export function AgentSubNav() {
  const pathname = usePathname() ?? "";
  const { canQualify, canUseMarketingPipeline, loading } = useAgentCapabilities();

  // Déplié au premier rendu, puis on applique le choix mémorisé : lire
  // `localStorage` pendant le rendu ferait diverger serveur et client.
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // navigation privée, stockage refusé : on reste déplié
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // sans stockage, le pli ne vaut que pour cette page — tant pis
      }
      return next;
    });
  };

  // Stats (cf. AgentRail) vit hors du modèle « section » — pas de sous-nav à
  // lui associer, plutôt qu'afficher les outils de "pilotage" (le défaut de
  // getAgentSpaceFromPath) sans qu'aucun n'y soit réellement actif.
  const isStatsPage = pathname === "/espace-agent/stats" || pathname.startsWith("/espace-agent/stats/");
  const space = getAgentSpaceById(getAgentSpaceFromPath(pathname));

  if (isStatsPage) return null;

  const isActive = (href: string, activeHref?: string) => {
    const target = activeHref ?? href;
    return pathname === target || pathname.startsWith(target + "/");
  };

  // Les outils sous capacité restent masqués tant qu'elle n'est pas confirmée,
  // pour ne pas les faire clignoter au chargement.
  const tools = space.tools.filter((tool) => {
    if (!tool.capability) return true;
    if (loading) return false;
    return tool.capability === "qualify" ? canQualify : canUseMarketingPipeline;
  });

  const Chevron = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      aria-label={space.label}
      data-collapsed={collapsed ? "1" : undefined}
      className={[
        "hidden md:flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-[var(--surface-2)] py-3 transition-[width] duration-150",
        collapsed ? "w-[52px] items-center px-1.5" : "w-56 px-2.5",
      ].join(" ")}
    >
      <div className={collapsed ? "flex flex-col items-center gap-1 pb-2" : "flex items-center gap-2 px-2 pb-2"}>
        {!collapsed && (
          <>
            <space.icon className="h-4 w-4 text-primary" strokeWidth={2} />
            <span className="truncate text-sm font-semibold tracking-tight">{space.label}</span>
          </>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Déplier le sous-menu" : "Replier le sous-menu"}
          title={collapsed ? "Déplier le sous-menu" : "Replier le sous-menu"}
          className={[
            "flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-3)] transition-colors hover:bg-[var(--bg-3)] hover:text-foreground",
            collapsed ? "" : "ml-auto",
          ].join(" ")}
        >
          <Chevron className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {tools.map((tool) => {
        const active = isActive(tool.href, tool.activeHref);
        const Icon = tool.icon;
        return (
          <Link
            key={tool.href + tool.title}
            href={tool.href}
            aria-current={active ? "page" : undefined}
            // Replié, le libellé passe en infobulle : l'outil reste
            // identifiable sans occuper la largeur.
            title={collapsed ? tool.title + (tool.soon ? " — bientôt" : "") : undefined}
            className={[
              "flex items-center rounded-lg text-sm transition-colors",
              collapsed ? "h-9 w-9 shrink-0 justify-center" : "gap-2.5 px-2.5 py-2",
              active
                ? "bg-[var(--accent-tint)] font-medium text-primary"
                : "text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            {!collapsed && (
              <>
                <span className="truncate">{tool.title}</span>
                {tool.soon && (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--bg-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                    Bientôt
                  </span>
                )}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default AgentSubNav;
