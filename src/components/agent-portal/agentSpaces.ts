import type { LucideIcon } from "lucide-react";
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
  User,
} from "lucide-react";

/**
 * Agent portal navigation model — mirrors the admin Studio's two-level
 * information architecture (see `@/components/layout/spaces`).
 *
 * Level 1 (the dark app rail) is a small set of *sections*. Level 2 (the
 * sub-nav) lists the *tools* of the active section. Every href below is a real,
 * existing route under `/espace-agent`. The sections and tools are the same
 * ones the previous single-sidebar carried — only the shell changed.
 */

export type AgentSpaceId =
  | "pilotage"
  | "demarchage"
  | "relation"
  | "telephonie"
  | "sama"
  | "reglages";

export type AgentTool = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** When the active route differs from the link target. */
  activeHref?: string;
  /** Feature not shipped yet — rendered with a "Bientôt" badge. */
  soon?: boolean;
};

export type AgentSpace = {
  id: AgentSpaceId;
  label: string;
  icon: LucideIcon;
  /** Where the rail button navigates to (the section's landing tool). */
  href: string;
  /** Sections shown as the bottom utility button rather than in the main rail. */
  utility?: boolean;
  tools: AgentTool[];
};

export const AGENT_SPACES: AgentSpace[] = [
  {
    id: "pilotage",
    label: "Pilotage",
    icon: LayoutDashboard,
    href: "/espace-agent/dashboard",
    tools: [
      { title: "Dashboard", href: "/espace-agent/dashboard", icon: LayoutDashboard },
      { title: "Pipeline", href: "/espace-agent/pipeline", icon: KanbanSquare },
      { title: "Calendrier", href: "/espace-agent/calendrier", icon: CalendarDays },
    ],
  },
  {
    id: "demarchage",
    label: "Démarchage",
    icon: Target,
    href: "/espace-agent/demarchage",
    tools: [
      { title: "Démarchage", href: "/espace-agent/demarchage", icon: Target },
      { title: "Messagerie", href: "/espace-agent/messagerie", icon: Inbox, soon: true },
      { title: "Séquences", href: "/espace-agent/sequences", icon: Workflow },
    ],
  },
  {
    id: "relation",
    label: "Relation",
    icon: Users,
    href: "/espace-agent/contacts",
    tools: [
      { title: "Contacts", href: "/espace-agent/contacts", icon: User },
      { title: "Entreprises", href: "/espace-agent/entreprises", icon: Building2 },
    ],
  },
  {
    id: "telephonie",
    label: "Téléphonie",
    icon: Headset,
    href: "/espace-agent/telephonie/cockpit",
    tools: [
      { title: "Cockpit d'appel", href: "/espace-agent/telephonie/cockpit", icon: Headset },
      { title: "Mes appels", href: "/espace-agent/telephonie/appels", icon: Phone },
      { title: "Messages SMS", href: "/espace-agent/telephonie/sms", icon: MessageSquare },
      { title: "Messagerie vocale", href: "/espace-agent/telephonie/messagerie", icon: Voicemail },
      { title: "Mon softphone", href: "/espace-agent/telephonie/reglages", icon: Settings },
    ],
  },
  {
    id: "sama",
    label: "SAMA",
    icon: Package,
    href: "/espace-agent/offres",
    tools: [
      { title: "Offres", href: "/espace-agent/offres", icon: Package },
      { title: "Commissions", href: "/espace-agent/commissions", icon: Euro, soon: true },
      { title: "Objectifs", href: "/espace-agent/objectifs", icon: Flag, soon: true },
    ],
  },
  {
    id: "reglages",
    label: "Réglages",
    icon: Settings,
    href: "/espace-agent/parametres",
    utility: true,
    tools: [{ title: "Paramètres", href: "/espace-agent/parametres", icon: Settings }],
  },
];

const SPACE_BY_ID: Record<AgentSpaceId, AgentSpace> = AGENT_SPACES.reduce(
  (acc, space) => {
    acc[space.id] = space;
    return acc;
  },
  {} as Record<AgentSpaceId, AgentSpace>,
);

export function getAgentSpaceById(id: AgentSpaceId): AgentSpace {
  return SPACE_BY_ID[id];
}

/**
 * Ordered prefix → space map. First match wins, so more specific prefixes are
 * listed before broader ones.
 */
const PATH_TO_SPACE: Array<[string, AgentSpaceId]> = [
  ["/espace-agent/dashboard", "pilotage"],
  ["/espace-agent/pipeline", "pilotage"],
  ["/espace-agent/calendrier", "pilotage"],

  ["/espace-agent/demarchage", "demarchage"],
  ["/espace-agent/messagerie", "demarchage"],
  ["/espace-agent/sequences", "demarchage"],

  ["/espace-agent/contacts", "relation"],
  ["/espace-agent/entreprises", "relation"],

  ["/espace-agent/telephonie", "telephonie"],

  ["/espace-agent/offres", "sama"],
  ["/espace-agent/commissions", "sama"],
  ["/espace-agent/objectifs", "sama"],

  ["/espace-agent/parametres", "reglages"],
];

export function getAgentSpaceFromPath(pathname: string): AgentSpaceId {
  for (const [prefix, id] of PATH_TO_SPACE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return id;
    }
  }
  return "pilotage";
}

/** Flat list of every tool across all sections — used by the ⌘K palette. */
export function getAllAgentTools(): Array<AgentTool & { space: AgentSpaceId; spaceLabel: string }> {
  return AGENT_SPACES.flatMap((space) =>
    space.tools.map((tool) => ({ ...tool, space: space.id, spaceLabel: space.label })),
  );
}
