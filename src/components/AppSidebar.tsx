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
  Building2,
  ChevronDown,
  CheckSquare,
  FolderKanban,
  Search,
  Settings,
  LogOut,
  type LucideIcon,
  BarChart3,
  CheckCircle,
  Share2,
  Ban,
  Copy,
  GitBranch,
  Users,
  Building,
  Target,
  Layout,
  ClipboardList,
  MessageSquare,
  Zap,
  BookOpen,
  Images,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useWorkspaceView } from "@/components/layout/useWorkspaceView";
import { TOP_CATEGORIES, CRM_ITEMS, PRODUCTION_ITEMS } from "@/components/layout/navigation";
import { ColdCallPlaybookModal } from "@/components/ColdCallPlaybookModal";

type SidebarNavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  activeHref?: string;
};

function UserAvatar({ name }: { name?: string }) {
  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
      {initials}
    </div>
  );
}

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
    { title: "Réseaux", icon: Share2, href: "/networks" },
    { title: "Blacklist", icon: Ban, href: "/blacklist" },
    { title: "Duplicats", icon: Copy, href: "/duplicates" },
  ];

  const prospectionItems: SidebarNavItem[] = [
    { title: "Dashboard Sales", icon: BarChart3, href: "/prospection/dashboard" },
    { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
    { title: "Opportunités", icon: Target, href: "/opportunities" },
    { title: "Qualifiés", icon: CheckCircle, href: "/qualified?mode=cold_call", activeHref: "/qualified" },
    { title: "Contacts", icon: Users, href: "/contacts" },
    { title: "Messagerie", icon: MessageSquare, href: "/messagerie" },
  ];

  const actionItems: SidebarNavItem[] = [
    { title: "Sprint CRM", icon: CheckSquare, href: "/actions/sprint" },
    { title: "Qualification", icon: CheckSquare, href: "/qualification" },
    { title: "Nouvelle Recherche", icon: Search, href: "/search/new" },
    { title: "Audits", icon: ClipboardList, href: "/opportunities" },
    { title: "Formulaires", icon: ClipboardList, href: "/forms" },
    { title: "Site Builder", icon: Layout, href: "/site-builder" },
    { title: "Thèmes", icon: Layout, href: "/themes" },
    { title: "Créateur de sections", icon: BookOpen, href: "/sections-library" },
    { title: "Bibliothèque images", icon: Images, href: "/media-library" },
    { title: "Contenu services", icon: BookOpen, href: "/services-content" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const focusItems =
    view === "prospection" ? prospectionItems : view === "qualification" ? qualificationItems : null;
  const topQuickAccessItems = TOP_CATEGORIES.filter(
    (item) => item.key === "dashboard" || item.key === "messagerie" || item.key === "calendar",
  ).sort((a, b) => {
    const order = ["dashboard", "messagerie", "calendar"];
    return order.indexOf(a.key) - order.indexOf(b.key);
  });

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      {/* Logo */}
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">Sama CRM</p>
          </div>
        </div>
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
            {/* Top categories */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {topQuickAccessItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {/* Automations — top-level shortcut */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/automations")}>
                      <Link href="/automations">
                        <Zap className="h-4 w-4" />
                        <span>Automatisations</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Automatisation */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/workflows")}>
                      <Link href="/workflows">
                        <Zap className="h-4 w-4" />
                        <span>Automatisation</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* CRM section */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setCrmOpen((p) => !p)}>
                      <Building className="h-4 w-4" />
                      <span>CRM</span>
                      <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${crmOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {crmOpen && (
                      <SidebarMenuSub>
                        {CRM_ITEMS.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-4 w-4" />
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

            {/* Production section */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setProductionOpen((p) => !p)}>
                      <FolderKanban className="h-4 w-4" />
                      <span>Production</span>
                      <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${productionOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {productionOpen && (
                      <SidebarMenuSub>
                        {PRODUCTION_ITEMS.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-4 w-4" />
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

            {/* Actions section */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setActionsOpen((p) => !p)}>
                      <CheckSquare className="h-4 w-4" />
                      <span>Actions</span>
                      <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${actionsOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                    {actionsOpen && (
                      <SidebarMenuSub>
                        {actionItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.activeHref ?? item.href)}>
                              <Link href={item.href}>
                                <item.icon className="h-4 w-4" />
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

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user?.name && (
          <div className="flex items-center gap-2 px-1 py-2 mb-1">
            <UserAvatar name={user.name} />
            <span className="truncate text-sm font-medium">{user.name}</span>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <ColdCallPlaybookModal />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Paramètres</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
