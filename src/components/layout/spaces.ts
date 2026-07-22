import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Target,
  Users,
  FolderKanban,
  Globe,
  TrendingUp,
  CheckCircle,
  Search,
  Share2,
  Ban,
  Copy,
  Workflow,
  User,
  Building2,
  UserCheck,
  GitBranch,
  Tag,
  MessageSquare,
  FolderOpen,
  ListChecks,
  LayoutTemplate,
  AppWindow,
  Magnet,
  PenLine,
  Sparkles,
  Palette,
  BookOpen,
  ClipboardList,
  Images,
  LayoutDashboard,
  StickyNote,
  Phone,
  PhoneCall,
  CalendarDays,
  Settings,
} from "lucide-react";

/**
 * Studio navigation model — the new two-level information architecture.
 *
 * Level 1 (the dark app rail) is a small set of *business spaces*. Level 2
 * (the sub-nav) lists the *tools* of the active space. Every href below is a
 * real, existing route in this app — no dead links. A tool may legitimately
 * appear in more than one space (e.g. Site builder lives in Web).
 */

export type SpaceId =
  | "hub"
  | "acquisition"
  | "relation"
  | "production"
  | "web"
  | "telephonie"
  | "pilotage";

export type SpaceTool = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** When the active route differs from the link target (e.g. query params). */
  activeHref?: string;
};

export type Space = {
  id: SpaceId;
  label: string;
  icon: LucideIcon;
  /** Where the rail button navigates to (the space's landing tool). */
  href: string;
  tools: SpaceTool[];
};

export const SPACES: Space[] = [
  {
    id: "hub",
    label: "Studio",
    icon: LayoutGrid,
    href: "/dashboard",
    tools: [{ title: "Accueil Studio", href: "/dashboard", icon: LayoutGrid }],
  },
  {
    id: "acquisition",
    label: "Acquisition",
    icon: Target,
    href: "/qualification",
    tools: [
      { title: "Démarchage", href: "/qualification", icon: Target },
      { title: "Qualifiés", href: "/qualified", icon: CheckCircle },
      { title: "Nouvelle recherche", href: "/search/new", icon: Search },
      { title: "Réseaux", href: "/networks", icon: Share2 },
      { title: "Séquences", href: "/automations/sequences", icon: Workflow },
      { title: "Blacklist", href: "/blacklist", icon: Ban },
      { title: "Duplicats", href: "/duplicates", icon: Copy },
    ],
  },
  {
    id: "relation",
    label: "Relation",
    icon: Users,
    href: "/contacts",
    tools: [
      { title: "Contacts", href: "/contacts", icon: User },
      { title: "Entreprises", href: "/companies", icon: Building2 },
      { title: "Clients", href: "/clients", icon: UserCheck },
      { title: "Agents", href: "/agents", icon: Users },
      { title: "Pipeline", href: "/pipeline", icon: GitBranch },
      { title: "Opportunités", href: "/opportunities", icon: Target },
      { title: "Offres", href: "/offres", icon: Tag },
      { title: "Messagerie", href: "/messagerie", icon: MessageSquare },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: FolderKanban,
    href: "/production/projets",
    tools: [
      { title: "Projets", href: "/production/projets", icon: FolderOpen },
      { title: "Tâches", href: "/production/taches", icon: ListChecks },
      { title: "Templates", href: "/production/templates", icon: LayoutTemplate },
      { title: "Apps", href: "/production/apps", icon: AppWindow },
      { title: "Planches", href: "/planches", icon: StickyNote },
      { title: "Lead magnets", href: "/production/lead-magnets", icon: Magnet },
      { title: "Copywriting", href: "/production/copywriting", icon: PenLine },
      { title: "Enrichissement", href: "/production/enrichissement", icon: Sparkles },
    ],
  },
  {
    id: "web",
    label: "Marketing & Web",
    icon: Globe,
    href: "/site-builder",
    tools: [
      { title: "Pipeline", href: "/marketing-pipeline", icon: GitBranch },
      { title: "Site builder", href: "/site-builder", icon: Globe },
      { title: "Thèmes", href: "/themes", icon: Palette },
      { title: "Section builder", href: "/sections-library", icon: BookOpen },
      { title: "Form builder", href: "/forms", icon: ClipboardList },
      { title: "Médias", href: "/media-library", icon: Images },
    ],
  },
  {
    id: "telephonie",
    label: "Téléphonie",
    icon: PhoneCall,
    href: "/telephonie",
    tools: [
      { title: "Journal d'appels", href: "/telephonie", icon: PhoneCall },
      { title: "Statistiques", href: "/telephonie/stats", icon: TrendingUp },
      { title: "Numéros & agents", href: "/telephonie/numeros", icon: Users },
    ],
  },
  {
    id: "pilotage",
    label: "Pilotage",
    icon: TrendingUp,
    href: "/dashboard-2",
    tools: [
      { title: "Dashboard", href: "/dashboard-2", icon: LayoutDashboard },
      { title: "Sales", href: "/prospection/dashboard", icon: Phone },
      { title: "Qualification", href: "/qualification/dashboard", icon: CheckCircle },
      { title: "Objectifs", href: "/objectifs", icon: Target },
      { title: "Calendrier", href: "/calendar", icon: CalendarDays },
      { title: "Paramètres", href: "/settings", icon: Settings },
    ],
  },
];

const SPACE_BY_ID: Record<SpaceId, Space> = SPACES.reduce(
  (acc, space) => {
    acc[space.id] = space;
    return acc;
  },
  {} as Record<SpaceId, Space>,
);

export function getSpaceById(id: SpaceId): Space {
  return SPACE_BY_ID[id];
}

/**
 * Ordered prefix → space map. First match wins, so more specific prefixes
 * (e.g. /qualification/dashboard belongs to Pilotage) are listed before the
 * broader ones (/qualification → Acquisition).
 */
const PATH_TO_SPACE: Array<[string, SpaceId]> = [
  ["/dashboard-2", "pilotage"],
  ["/prospection/dashboard", "pilotage"],
  ["/qualification/dashboard", "pilotage"],
  ["/objectifs", "pilotage"],
  ["/calendar", "pilotage"],
  ["/settings", "pilotage"],

  ["/telephonie", "telephonie"],

  ["/qualification", "acquisition"],
  ["/qualified", "acquisition"],
  ["/search", "acquisition"],
  ["/networks", "acquisition"],
  ["/automations", "acquisition"],
  ["/blacklist", "acquisition"],
  ["/duplicates", "acquisition"],

  ["/contacts", "relation"],
  ["/companies", "relation"],
  ["/clients", "relation"],
  ["/agents", "relation"],
  ["/pipeline", "relation"],
  ["/opportunities", "relation"],
  ["/offres", "relation"],
  ["/messagerie", "relation"],

  ["/production", "production"],
  ["/planches", "production"],

  ["/marketing-pipeline", "web"],
  ["/site-builder", "web"],
  ["/site-templates", "web"],
  ["/themes", "web"],
  ["/sections-library", "web"],
  ["/forms", "web"],
  ["/media-library", "web"],

  ["/dashboard", "hub"],
];

export function getSpaceFromPath(pathname: string): SpaceId {
  for (const [prefix, id] of PATH_TO_SPACE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return id;
    }
  }
  return "hub";
}

export function getToolsForSpace(id: SpaceId): SpaceTool[] {
  return SPACE_BY_ID[id]?.tools ?? [];
}

/** Flat list of every tool across all spaces — used by the Cmd+K palette. */
export function getAllTools(): Array<SpaceTool & { space: SpaceId; spaceLabel: string }> {
  return SPACES.flatMap((space) =>
    space.tools.map((tool) => ({ ...tool, space: space.id, spaceLabel: space.label })),
  );
}
