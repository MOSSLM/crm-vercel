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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarDays,
  Target,
  Inbox,
  Workflow,
  Users,
  Building2,
  Package,
  Euro,
  Flag,
  Headset,
  Phone,
  MessageSquare,
  Voicemail,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
};
type NavSection = { label: string; items: NavItem[] };

// Sections from the Sama Agent mockup. "Offres" replaces the mockup's
// "Mandants CVC": the CVC companies are prospects (Pipeline / Entreprises),
// and this section surfaces the SAMA offers the agent sells.
const NAV: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { title: "Dashboard", href: "/espace-agent/dashboard", icon: LayoutDashboard },
      { title: "Pipeline", href: "/espace-agent/pipeline", icon: KanbanSquare },
      { title: "Calendrier", href: "/espace-agent/calendrier", icon: CalendarDays },
    ],
  },
  {
    label: "Démarchage",
    items: [
      { title: "Démarchage", href: "/espace-agent/demarchage", icon: Target },
      { title: "Messagerie", href: "/espace-agent/messagerie", icon: Inbox, soon: true },
      { title: "Séquences", href: "/espace-agent/sequences", icon: Workflow },
    ],
  },
  {
    label: "Relation",
    items: [
      { title: "Contacts", href: "/espace-agent/contacts", icon: Users },
      { title: "Entreprises", href: "/espace-agent/entreprises", icon: Building2 },
    ],
  },
  {
    label: "Téléphonie",
    items: [
      { title: "Cockpit d'appel", href: "/espace-agent/telephonie/cockpit", icon: Headset },
      { title: "Mes appels", href: "/espace-agent/telephonie/appels", icon: Phone },
      { title: "Messages SMS", href: "/espace-agent/telephonie/sms", icon: MessageSquare },
      { title: "Messagerie vocale", href: "/espace-agent/telephonie/messagerie", icon: Voicemail },
      { title: "Mon softphone", href: "/espace-agent/telephonie/reglages", icon: Settings },
    ],
  },
  {
    label: "SAMA",
    items: [
      { title: "Offres", href: "/espace-agent/offres", icon: Package },
      { title: "Commissions", href: "/espace-agent/commissions", icon: Euro, soon: true },
      { title: "Objectifs", href: "/espace-agent/objectifs", icon: Flag, soon: true },
    ],
  },
];

function UserAvatar({ name }: { name?: string }) {
  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
      {initials}
    </div>
  );
}

export const AgentSidebar: React.FC = () => {
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary font-serif text-base text-primary-foreground">
            S
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold leading-tight">SAMA</div>
            <div className="text-xs text-muted-foreground leading-tight">Espace agent</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.soon && <SidebarMenuBadge>Bientôt</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user?.name && (
          <div className="flex items-center gap-2 px-1 py-2 mb-1 group-data-[collapsible=icon]:px-0">
            <UserAvatar name={user.name} />
            <span className="truncate text-sm font-medium group-data-[collapsible=icon]:hidden">
              {user.name}
            </span>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              tooltip="Déconnexion"
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AgentSidebar;
