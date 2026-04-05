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
import { Building2, ChevronDown, CheckSquare, FolderKanban, Search, Settings, LogOut, type LucideIcon, Package, BarChart3, CheckCircle, Share2, Ban, Copy, PenLine, Magnet, GitBranch, Users, Building, Target } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useWorkspaceView } from "@/components/layout/useWorkspaceView";
import { TOP_CATEGORIES, CRM_ITEMS, PRODUCTION_ITEMS } from "@/components/layout/navigation";

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

  const qualificationItems: SidebarNavItem[] = [
    { title: "Dashboard qualification", icon: BarChart3, href: "/qualification/dashboard" },
    { title: "Sprint CRM", icon: CheckSquare, href: "/opportunities" },
    { title: "Qualifiés", icon: CheckCircle, href: "/qualified" },
    { title: "Services entreprises", icon: Package, href: "/services-entreprises" },
    { title: "Réseaux", icon: Share2, href: "/networks" },
    { title: "Blacklist", icon: Ban, href: "/blacklist" },
    { title: "Duplicats", icon: Copy, href: "/duplicates" },
  ];

  const prospectionItems: SidebarNavItem[] = [
    { title: "Dashboard prospection", icon: BarChart3, href: "/prospection/dashboard" },
    { title: "Sprint CRM", icon: CheckSquare, href: "/opportunities" },
    { title: "Qualifiés (appel)", icon: CheckCircle, href: "/qualified?mode=cold_call", activeHref: "/qualified" },
    { title: "Services entreprises", icon: Package, href: "/services-entreprises" },
    { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
    { title: "Opportunités", icon: Target, href: "/opportunities" },
    { title: "Offres", icon: Package, href: "/offres" },
    { title: "Contacts", icon: Users, href: "/contacts" },
  ];

  const actionItems: SidebarNavItem[] = [
    { title: "Sprint CRM", icon: CheckSquare, href: "/actions/sprint" },
    { title: "Qualification", icon: CheckSquare, href: "/qualification" },
    { title: "Services entreprises", icon: Package, href: "/services-entreprises" },
    { title: "Nouvelle Recherche", icon: Search, href: "/search/new" },
    { title: "Results", icon: Package, href: "/results" },
    { title: "Copywriting", icon: PenLine, href: "/production/copywriting" },
    { title: "Lead magnet", icon: Magnet, href: "/production/lead-magnet" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const focusItems =
    view === "prospection" ? prospectionItems : view === "qualification" ? qualificationItems : null;

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-7 w-7" />
          <h2 className="truncate">Sama CRM</h2>
        </div>
        <div className="truncate text-sm text-muted-foreground">{user?.name}</div>
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
                  {TOP_CATEGORIES.slice(0, 2).map((item) => (
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
                      <Building className="h-5 w-5" />
                      <span>CRM</span>
                      <ChevronDown className={`ml-auto h-5 w-5 transition-transform ${crmOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {crmOpen && (
                      <SidebarMenuSub>
                        {CRM_ITEMS.map((item) => (
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
                        {PRODUCTION_ITEMS.map((item) => (
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

      <SidebarFooter className="space-y-2 p-4">
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

export default AppSidebar;
