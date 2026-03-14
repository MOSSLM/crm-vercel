"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Search,
  Settings,
  LogOut,
  Building2,
  Building,
  CheckSquare,
  Users,
  Target,
  Package,
  GitBranch,
  CheckCircle,
  Copy,
  Share2,
  Ban,
  ChevronDown,
  FolderKanban,
  LayoutTemplate,
  AppWindow,
  PenLine,
  Magnet,
  CalendarDays,
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

  const [crmOpen, setCrmOpen] = React.useState(true);
  const [productionOpen, setProductionOpen] = React.useState(true);
  const [actionsOpen, setActionsOpen] = React.useState(true);

  const navigationItems: SidebarNavItem[] = [
    { title: "Dashboard", icon: BarChart3, href: "/dashboard" },
    { title: "Calendrier", icon: CalendarDays, href: "/calendar" },
  ];

  const crmItems: SidebarNavItem[] = [
    { title: "Entreprises", icon: Building, href: "/companies" },
    { title: "Contacts", icon: Users, href: "/contacts" },
    { title: "Opportunités", icon: Target, href: "/opportunities" },
    { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
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
    { title: "Qualification", icon: CheckSquare, href: "/qualification" },
    { title: "Nouvelle Recherche", icon: Search, href: "/search/new" },
    { title: "Results", icon: Package, href: "/results" },
    { title: "Copywriting", icon: PenLine, href: "/production/copywriting" },
    { title: "Lead magnet", icon: Magnet, href: "/production/lead-magnet" },
  ];

  const productionItems: SidebarNavItem[] = [
    { title: "Projets", icon: FolderKanban, href: "/production/projets" },
    { title: "Lead Magnets", icon: Magnet, href: "/production/lead-magnets" },
    { title: "Templates", icon: LayoutTemplate, href: "/production/templates" },
    { title: "Apps", icon: AppWindow, href: "/production/apps" },
    { title: "Offres", icon: Package, href: "/offres" },
    { title: "Objectifs", icon: Target, href: "/objectifs" },
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
          <Building2 className="h-7 w-7" />
          <h2 className="truncate">Sama CRM</h2>
        </div>
        <div className="text-sm text-muted-foreground truncate">{user?.name}</div>
      </SidebarHeader>

      <SidebarContent>
        {focusItems ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {focusItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.activeHref ?? item.href)}>
                      <Link href={item.href}>
                        <item.icon className="h-5 w-5" />
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
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setCrmOpen((prev) => !prev)}>
                      <Building2 className="h-5 w-5" />
                      <span>CRM</span>
                      <ChevronDown className={`ml-auto h-5 w-5 transition-transform ${crmOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {crmOpen && (
                      <SidebarMenuSub>
                        {crmItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-5 w-5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setProductionOpen((prev) => !prev)}>
                      <FolderKanban className="h-5 w-5" />
                      <span>Production</span>
                      <ChevronDown className={`ml-auto h-5 w-5 transition-transform ${productionOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {productionOpen && (
                      <SidebarMenuSub>
                        {productionItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-5 w-5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setActionsOpen((prev) => !prev)}>
                      <CheckSquare className="h-5 w-5" />
                      <span>Actions</span>
                      <ChevronDown className={`ml-auto h-5 w-5 transition-transform ${actionsOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {actionsOpen && (
                      <SidebarMenuSub>
                        {actionItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-5 w-5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
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
                <Settings className="h-5 w-5" />
                <span>Paramètres</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut className="h-5 w-5" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
