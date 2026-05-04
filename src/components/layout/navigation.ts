import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Building2,
  FolderKanban,
  CheckSquare,
  Building,
  Users,
  Target,
  GitBranch,
  FolderOpen,
  ListChecks,
  LayoutTemplate,
  AppWindow,
  Magnet,
  Search,
  Package,
  CheckCircle,
  Share2,
  Ban,
  Copy,
  Layout,
  MessageSquare,
  Zap,
} from "lucide-react";

export type TopCategoryKey =
  | "dashboard"
  | "calendar"
  | "crm"
  | "production"
  | "actions"
  | "messagerie"
  | "automations";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  activeHref?: string;
};

export const TOP_CATEGORIES: Array<NavItem & { key: TopCategoryKey }> = [
  { key: "dashboard", title: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { key: "calendar", title: "Calendrier", href: "/calendar", icon: CalendarDays },
  { key: "crm", title: "CRM", href: "/companies", icon: Building2 },
  { key: "production", title: "Production", href: "/production/projets", icon: FolderKanban },
  { key: "actions", title: "Actions", href: "/qualification", icon: CheckSquare },
  { key: "messagerie", title: "Messagerie", href: "/messagerie", icon: MessageSquare },
  { key: "automations", title: "Automatisations", href: "/automations", icon: Zap },
];

export const CRM_ITEMS: NavItem[] = [
  { title: "Entreprises", icon: Building, href: "/companies" },
  { title: "Contacts", icon: Users, href: "/contacts" },
  { title: "Opportunités", icon: Target, href: "/opportunities" },
  { title: "Pipeline", icon: GitBranch, href: "/pipeline" },
  { title: "Offres", icon: Package, href: "/offres" },
];

export const PRODUCTION_ITEMS: NavItem[] = [
  { title: "Projets", icon: FolderOpen, href: "/production/projets" },
  { title: "Tâches", icon: ListChecks, href: "/production/taches" },
  { title: "Lead Magnets", icon: Magnet, href: "/production/lead-magnets" },
  { title: "Templates", icon: LayoutTemplate, href: "/production/templates" },
  { title: "Apps", icon: AppWindow, href: "/production/apps" },
  { title: "Objectifs", icon: Target, href: "/objectifs" },
];

export const ACTION_ITEMS: NavItem[] = [
  { title: "Sprint CRM", icon: CheckSquare, href: "/actions/sprint" },
  { title: "Qualification", icon: CheckSquare, href: "/qualification" },
  { title: "Qualifiés", icon: CheckCircle, href: "/qualified" },
  { title: "Services", icon: Package, href: "/services-entreprises" },
  { title: "Nouvelle recherche", icon: Search, href: "/search/new" },
  { title: "Résultats", icon: BarChart3, href: "/results" },
  { title: "Réseaux", icon: Share2, href: "/networks" },
  { title: "Blacklist", icon: Ban, href: "/blacklist" },
  { title: "Duplicats", icon: Copy, href: "/duplicates" },
  { title: "Site Builder", icon: Layout, href: "/site-builder" },
];

export const AUTOMATIONS_ITEMS: NavItem[] = [
  { title: "Workflows", icon: Zap, href: "/automations" },
];

export const DASHBOARD_ITEMS: NavItem[] = [
  { title: "Dashboard", icon: BarChart3, href: "/dashboard" },
  { title: "Sales", icon: Phone, href: "/prospection/dashboard" },
  { title: "Qualification", icon: CheckCircle, href: "/qualification/dashboard" },
];

export const CALENDAR_ITEMS: NavItem[] = [{ title: "Calendrier", icon: CalendarDays, href: "/calendar" }];

export const MESSAGERIE_ITEMS: NavItem[] = [];

import { Phone } from "lucide-react";

export function getCategoryFromPath(pathname: string): TopCategoryKey {
  if (pathname.startsWith("/automations")) return "automations";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/production") || pathname.startsWith("/objectifs")) return "production";
  if (
    pathname.startsWith("/companies") ||
    pathname.startsWith("/contacts") ||
    pathname.startsWith("/opportunities") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/offres")
  ) {
    return "crm";
  }
  if (
    pathname.startsWith("/actions/sprint") ||
    pathname.startsWith("/qualification") ||
    pathname.startsWith("/qualified") ||
    pathname.startsWith("/services-entreprises") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/results") ||
    pathname.startsWith("/networks") ||
    pathname.startsWith("/blacklist") ||
    pathname.startsWith("/duplicates") ||
    pathname.startsWith("/site-builder")
  ) {
    return "actions";
  }
  if (pathname.startsWith("/messagerie")) return "messagerie";
  return "dashboard";
}

export function getTopTabsForCategory(category: TopCategoryKey): NavItem[] {
  switch (category) {
    case "crm":
      return CRM_ITEMS;
    case "production":
      return PRODUCTION_ITEMS;
    case "actions":
      return ACTION_ITEMS;
    case "automations":
      return AUTOMATIONS_ITEMS;
    case "calendar":
      return CALENDAR_ITEMS;
    case "messagerie":
      return MESSAGERIE_ITEMS;
    default:
      return DASHBOARD_ITEMS;
  }
}
