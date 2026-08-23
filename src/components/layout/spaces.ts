import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  MessagesSquare,
  ListTodo,
  Fingerprint,
  Flame,
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
  Swords,
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
  Layers,
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
  CalendarClock,
  Activity,
  MapPin,
  Network,
  Settings,
  SlidersHorizontal,
  Bot,
  Send,
  ShieldCheck,
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
  | "prospection"
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
  /**
   * Prospection — l'espace de la refonte lemlist.
   *
   * UN SEUL ESPACE, décidé avec Matteo : le démarchage était éclaté sur quatre
   * surfaces (Démarchage, Séquences, Pipeline commercial, Marketing pipeline)
   * et personne ne voyait le stock. Les outils ci-dessous existent tous — on
   * n'inscrit ici aucune route à venir : la règle du fichier est « pas de lien
   * mort », et un menu qui promet un écran absent est pire qu'un menu court.
   */
  {
    id: "prospection",
    label: "Prospection",
    icon: Send,
    href: "/prospection/campagnes",
    tools: [
      { title: "Campagnes", href: "/prospection/campagnes", icon: Send },
      { title: "Conversations", href: "/prospection/conversations", icon: MessagesSquare },
      { title: "Séquences", href: "/automations/sequences", icon: Workflow },
      // JUSTE APRÈS LES SÉQUENCES, PARCE QUE C'EST LA QUESTION QU'ON SE POSE
      // EN SORTANT DE L'ÉDITEUR. « Séquences » dit ce que la séquence FERA ;
      // « Où on en est » dit qui est dedans, arrêté sur quel bloc, et qui n'y
      // avance plus. Les statistiques, elles, ne parlent que du passé.
      { title: "Où on en est", href: "/prospection/etat-sequences", icon: GitBranch },
      { title: "Semaine", href: "/automations/semaine", icon: CalendarDays },
      { title: "Tâches", href: "/prospection/taches", icon: ListTodo },
      { title: "Signaux", href: "/prospection/signaux", icon: Bell },
      // LES LEADS DE LA REFONTE, ET ILS EXISTENT DÉJÀ. L'explorateur porte les
      // 25 familles de filtres, les segments enregistrés et le figeage en lot —
      // il est plus riche que le « Leads » de lemlist. Il ne lui manquait que
      // d'être atteignable depuis l'espace où on démarche : y arriver
      // demandait de passer par Acquisition, donc de quitter la prospection.
      // On ne le DÉPLACE pas — il reste dans Acquisition, où il sert aussi.
      { title: "Leads", href: "/entreprises/explorateur", icon: Building2 },
      { title: "Rapports", href: "/prospection/rapports", icon: BarChart3 },
      // Les LOTS : le pipeline des populations, au-dessus de celui des fiches.
      // Il se range juste avant le lissage parce que c'est lui qui dit combien
      // il reste à lisser, et sur quel lot.
      { title: "Lots", href: "/prospection/lots", icon: Layers },
      { title: "Lissage", href: "/prospection/lissage", icon: Sparkles },
      { title: "Choix du SIRET", href: "/prospection/identite", icon: Fingerprint },
      { title: "Modèles", href: "/automations/modeles", icon: LayoutTemplate },
      { title: "Délivrabilité", href: "/prospection/delivrabilite", icon: ShieldCheck },
      { title: "Réchauffeur", href: "/prospection/rechauffeur", icon: Flame },
      { title: "Régulateur", href: "/automations/regulateur", icon: SlidersHorizontal },
      { title: "Journal", href: "/automations/journal", icon: Activity },
      // Les désabonnés de lemlist : suppressions, plaintes, rebonds durs.
      { title: "Désabonnés", href: "/blacklist", icon: Ban },
    ],
  },
  {
    id: "acquisition",
    label: "Acquisition",
    icon: Target,
    href: "/qualification",
    tools: [
      { title: "Démarchage", href: "/qualification", icon: Target },
      { title: "Explorateur", href: "/entreprises/explorateur", icon: SlidersHorizontal },
      { title: "Carte du territoire", href: "/carte", icon: MapPin },
      { title: "Qualifiés", href: "/qualified", icon: CheckCircle },
      { title: "Nouvelle recherche", href: "/search/new", icon: Search },
      { title: "Réseaux", href: "/networks", icon: Share2 },
      { title: "Séquences", href: "/automations/sequences", icon: Workflow },
      { title: "Blacklist", href: "/blacklist", icon: Ban },
      { title: "Concurrents", href: "/concurrents", icon: Swords },
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
      { title: "Pipeline commercial", href: "/pipeline-commercial", icon: Target },
      { title: "Opportunités", href: "/opportunities", icon: Target },
      { title: "Offres", href: "/offres", icon: Tag },
      { title: "Messagerie", href: "/messagerie", icon: MessageSquare },
      { title: "Rendez-vous", href: "/rendez-vous", icon: CalendarClock },
      { title: "Mes RDV", href: "/mes-rdv", icon: ClipboardList },
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
      { title: "Vue d'ensemble", href: "/telephonie", icon: LayoutDashboard },
      { title: "Calendrier équipe", href: "/telephonie/calendrier", icon: CalendarDays },
      { title: "Supervision live", href: "/telephonie/supervision", icon: Activity },
      { title: "Journal d'appels", href: "/telephonie/journal", icon: PhoneCall },
      { title: "Numéros & agents", href: "/telephonie/numeros", icon: Users },
      { title: "Portabilité", href: "/telephonie/portabilite", icon: Share2 },
      { title: "SVI / Standard", href: "/telephonie/svi", icon: Workflow },
      { title: "Softphone & widget", href: "/telephonie/softphone", icon: Settings },
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
      { title: "Architecture", href: "/docs/architecture", icon: Network },
      { title: "Les bots", href: "/docs/bots", icon: Bot },
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
  ["/docs", "pilotage"],
  ["/settings", "pilotage"],

  ["/telephonie", "telephonie"],

  ["/qualification", "acquisition"],
  ["/entreprises", "acquisition"],
  ["/carte", "acquisition"],
  ["/qualified", "acquisition"],
  ["/search", "acquisition"],
  ["/networks", "acquisition"],
  ["/automations", "acquisition"],
  ["/blacklist", "acquisition"],
  ["/concurrents", "acquisition"],
  ["/duplicates", "acquisition"],

  ["/contacts", "relation"],
  ["/companies", "relation"],
  ["/clients", "relation"],
  ["/agents", "relation"],
  ["/pipeline-commercial", "relation"],
  ["/pipeline", "relation"],
  ["/opportunities", "relation"],
  ["/offres", "relation"],
  ["/messagerie", "relation"],
  ["/rendez-vous", "relation"],
  ["/mes-rdv", "relation"],

  ["/production", "production"],
  ["/planches", "production"],

  ["/marketing-pipeline", "web"],
  ["/site-builder", "web"],
  ["/site-templates", "web"],
  ["/themes", "web"],
  ["/sections-library", "web"],
  ["/forms", "web"],
  ["/media-library", "web"],

  ["/prospection", "prospection"],

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
