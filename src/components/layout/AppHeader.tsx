"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppData } from "@/components/AppDataContext";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Phone, Target } from "lucide-react";
import { useWorkspaceView } from "./useWorkspaceView";

/**
 * Déduit un titre lisible depuis le pathname.
 * Essaie d'abord d’utiliser les données (ex: nom d’entreprise), sinon fallback.
 */
function usePageTitle() {
  const pathname = usePathname() || "/";
  const { companies } = useAppData();

  // Entreprise: /companies/[id]
  const mCompany = pathname.match(/^\/companies\/([^/]+)$/);
  if (mCompany) {
    const id = decodeURIComponent(mCompany[1]);
    const company = companies.find((c) => String(c.id) === String(id));
    const companyName = company?.name;
    return companyName ? `Entreprise · ${companyName}` : `Entreprise #${id}`;
  }

  // Contact: /contacts/[id]
  const mContact = pathname.match(/^\/contacts\/([^/]+)$/);
  if (mContact) {
    const id = decodeURIComponent(mContact[1]);
    return `Contact #${id}`;
  }

  // Routes statiques
  const map: Record<string, string> = {
    "/": "Accueil",
    "/dashboard": "Dashboard",
    "/prospection/dashboard": "Dashboard prospection",
    "/qualification/dashboard": "Dashboard qualification",
    "/results": "Results",
    "/companies": "Toutes les entreprises",
    "/contacts": "Contacts",
    "/qualification": "Qualification",
    "/qualified-companies": "Qualifiés",
    "/opportunities": "Opportunités",
    "/pipeline": "Pipeline",
    // ton dossier est `app/objectifs`, pas `/objectives`
    "/objectifs": "Objectifs & Progression",
    "/production/enrichissement": "Enrichissement",
    "/production/copywriting": "Copywriting",
    "/production/lead-magnet": "Lead magnet",
    "/search": "Recherche",
    "/search/new": "Nouvelle recherche",
    "/settings": "Paramètres",
    "/login": "Connexion",
  };

  // Essaye match exact
  if (map[pathname]) return map[pathname];

  // Essaye préfixes (ex: /search/xxxx)
  if (pathname.startsWith("/search/")) return map["/search"];

  return "Sama CRM";
}

export function AppHeader() {
  const title = usePageTitle();
  const { view, setView } = useWorkspaceView();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 bg-muted/30 border-b border-border/50">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="ml-auto flex items-center gap-2 px-4">
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
              <Link href="/prospection/dashboard" onClick={() => setView("prospection")} aria-label="Ouvrir le dashboard prospection">
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
              <Link href="/qualification/dashboard" onClick={() => setView("qualification")} aria-label="Ouvrir le dashboard qualification">
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
    </header>
  );
}

export default AppHeader;
