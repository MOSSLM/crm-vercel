"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppData } from "@/components/AppDataContext";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Phone, Target } from "lucide-react";
import { useWorkspaceView } from "./useWorkspaceView";
import { TopSubNav } from "./TopSubNav";

function usePageTitle() {
  const pathname = usePathname() || "/";
  const { companies } = useAppData();

  const mCompany = pathname.match(/^\/companies\/([^/]+)$/);
  if (mCompany) {
    const id = decodeURIComponent(mCompany[1]);
    const company = companies.find((c) => String(c.id) === String(id));
    return company?.name ? `Entreprise · ${company.name}` : `Entreprise #${id}`;
  }

  const mContact = pathname.match(/^\/contacts\/([^/]+)$/);
  if (mContact) {
    const id = decodeURIComponent(mContact[1]);
    return `Contact #${id}`;
  }

  const map: Record<string, string> = {
    "/": "Accueil",
    "/dashboard": "Dashboard",
    "/prospection/dashboard": "Dashboard prospection",
    "/qualification/dashboard": "Dashboard qualification",
    "/results": "Results",
    "/companies": "Toutes les entreprises",
    "/qualified": "Qualifiés",
    "/services-entreprises": "Services entreprises",
    "/duplicates": "Duplicats",
    "/networks": "Réseaux",
    "/blacklist": "Blacklist",
    "/contacts": "Contacts",
    "/qualification": "Qualification",
    "/qualified-companies": "Qualifiés",
    "/opportunities": "Opportunités",
    "/pipeline": "Pipeline",
    "/offres": "Offres",
    "/objectifs": "Objectifs & Progression",
    "/production/enrichissement": "Enrichissement",
    "/production/copywriting": "Copywriting",
    "/production/lead-magnet": "Lead magnet",
    "/production/projets-clients": "Projets clients",
    "/production/projets-internes": "Projets internes",
    "/production/lead-magnets": "Lead magnets",
    "/production/templates": "Templates",
    "/production/apps": "Apps",
    "/search": "Recherche",
    "/search/new": "Nouvelle recherche",
    "/settings": "Paramètres",
    "/login": "Connexion",
  };

  if (map[pathname]) return map[pathname];
  if (pathname.startsWith("/search/")) return map["/search"];
  return "Sama CRM";
}

export function AppHeader() {
  const title = usePageTitle();
  const { view, setView } = useWorkspaceView();

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3 md:h-16 md:px-4">
        <div className="hidden md:flex md:items-center md:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[180px] truncate text-sm font-medium md:max-w-none md:text-base">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {view === "base" && (
            <>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/qualified?mode=cold_call" onClick={() => setView("prospection")} aria-label="Basculer en vue prospection">
                  <Phone className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/qualification" onClick={() => setView("qualification")} aria-label="Basculer en vue qualification">
                  <Target className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
          {view === "prospection" && (
            <>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/dashboard" onClick={() => setView("base")} aria-label="Revenir au dashboard principal">
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/qualification" onClick={() => setView("qualification")} aria-label="Basculer en vue qualification">
                  <Target className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
          {view === "qualification" && (
            <>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/dashboard" onClick={() => setView("base")} aria-label="Revenir au dashboard principal">
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/qualified?mode=cold_call" onClick={() => setView("prospection")} aria-label="Basculer en vue prospection">
                  <Phone className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
      <TopSubNav />
    </header>
  );
}

export default AppHeader;
