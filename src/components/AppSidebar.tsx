"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  FileText,
  Search,
  Plus,
  Settings,
  LogOut,
  Building2,
  Building,
  CheckSquare,
  Users,
  Target,
  Package,
  GitBranch,
  Award,
  CheckCircle,
  Copy,
  Share2,
  Ban,
  Sparkles,
  PenLine,
  Magnet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useWorkspaceView } from "@/components/layout/useWorkspaceView";

type SidebarNavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  activeHref?: string;
};

export const AppSidebar = () => {
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const { view } = useWorkspaceView();

  const navigationItems: SidebarNavItem[] = [
    { title: "Dashboard", icon: BarChart3, href: "/dashboard" },
    { title: "Results", icon: FileText, href: "/results" },
    { title: "Toutes les entreprises", icon: Building, href: "/companies" },
  ];

  const crmItems: SidebarNavItem[] = [
    { title: "Qualification", icon: CheckSquare, href: "/qualification" },
    { title: "Qualifiés", icon: CheckCircle, href: "/qualified" },
    { title: "Duplicats", icon: Copy, href: "/duplicates" },
    { title: "Réseaux", icon: Share2, href: "/networks" },
    { title: "Blacklist", icon: Ban, href: "/blacklist" },
    { title: "Contacts", icon: Users, href: "/contacts" },
    { title: "Opportunités", icon: Target, href: "/opportunities" },
    { title: "Offres", icon: Package, href: "/offres" },
    { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
    { title: "Objectifs & Progression", icon: Award, href: "/objectifs" },
  ];

  const qualificationItems: SidebarNavItem[] = [
    { title: "Dashboard qualification", icon: BarChart3, href: "/qualification/dashboard" },
    { title: "Qualification", icon: CheckSquare, href: "/qualification" },
    { title: "Qualifiés", icon: CheckCircle, href: "/qualified" },
    { title: "Réseaux", icon: Share2, href: "/networks" },
    { title: "Blacklist", icon: Ban, href: "/blacklist" },
    { title: "Duplicats", icon: Copy, href: "/duplicates" },
  ];

  const prospectionItems: SidebarNavItem[] = [
    { title: "Dashboard prospection", icon: BarChart3, href: "/prospection/dashboard" },
    { title: "Qualifiés (appel)", icon: CheckCircle, href: "/qualified?mode=cold_call", activeHref: "/qualified" },
    { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
    { title: "Opportunités", icon: Target, href: "/opportunities" },
    { title: "Offres", icon: Package, href: "/offres" },
    { title: "Contacts", icon: Users, href: "/contacts" },
  ];

  const actionItems: SidebarNavItem[] = [
    { title: "Nouvelle Recherche", icon: Search, href: "/search/new" },
    { title: "Créer", icon: Plus, href: "/create" },
  ];

  const productionItems: SidebarNavItem[] = [
    { title: "Enrichissement", icon: Sparkles, href: "/production/enrichissement" },
    { title: "Copywriting", icon: PenLine, href: "/production/copywriting" },
    { title: "Lead magnet", icon: Magnet, href: "/production/lead-magnet" },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const focusItems =
    view === "prospection"
      ? prospectionItems
      : view === "qualification"
        ? qualificationItems
        : null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          <h2 className="truncate">Sama CRM</h2>
        </div>
        <div className="text-sm text-muted-foreground truncate">{user?.name}</div>
      </SidebarHeader>

      <SidebarContent>
        {focusItems ? (
          <SidebarGroup>
            <SidebarGroupLabel>{view === "prospection" ? "Prospection" : "Qualification"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {focusItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.activeHref ?? item.href)}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>CRM</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {crmItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Production</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {productionItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Actions</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {actionItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Paramètres</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
