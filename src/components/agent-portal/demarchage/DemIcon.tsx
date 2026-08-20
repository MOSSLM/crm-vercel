"use client";

/**
 * Les icônes de l'écran Démarchage.
 *
 * La maquette appelle ses icônes par un nom (`<Icon name="whatsapp" />`). Aucun
 * des deux jeux maison ne couvre la liste complète — celui des automatisations
 * n'a ni `calendar` ni `copy`, celui des rendez-vous n'a ni `whatsapp` ni
 * `linkedin`. Plutôt que de piocher dans les deux (et d'obtenir deux styles de
 * trait sur le même écran), on mappe une bonne fois les noms de la maquette sur
 * `lucide-react`, déjà utilisé ailleurs dans le portail agent.
 *
 * La taille vient des classes `.ico-*` de la feuille de style : les attributs
 * `width`/`height` de lucide sont des attributs de présentation, donc le CSS
 * l'emporte.
 */

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  Flame,
  Globe,
  Hash,
  Info,
  Layers,
  Link as LinkIcon,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Minus,
  Paperclip,
  Pause,
  Phone,
  PhoneOff,
  Plus,
  Send,
  SkipForward,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  User,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  arrowRight: ArrowRight,
  attach: Paperclip,
  banknote: Banknote,
  briefcase: Briefcase,
  building: Building2,
  cal: Calendar,
  calCheck: CalendarCheck,
  calPlus: CalendarPlus,
  calendar: Calendar,
  check: Check,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  clipboard: ClipboardList,
  clock: Clock,
  copy: Copy,
  doc: FileText,
  ext: ExternalLink,
  eye: Eye,
  flag: Flag,
  flame: Flame,
  flow: Layers,
  globe: Globe,
  hash: Hash,
  info: Info,
  layers: Layers,
  link: LinkIcon,
  linkedin: Linkedin,
  mail: Mail,
  mappin: MapPin,
  message: MessageSquare,
  minus: Minus,
  note: StickyNote,
  pause: Pause,
  phone: Phone,
  phoneOff: PhoneOff,
  plus: Plus,
  send: Send,
  skipFwd: SkipForward,
  sparkles: Sparkles,
  tag: Bookmark,
  target: Target,
  tools: Wrench,
  trending: TrendingUp,
  user: User,
  users: Users,
  warning: AlertTriangle,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  x: X,
  zap: Zap,
};

export function Icon({
  name,
  className = "ico",
  ...rest
}: { name: string; className?: string } & React.SVGProps<SVGSVGElement>) {
  const Cmp = MAP[name];
  // Un nom inconnu ne doit pas casser la page ni afficher un glyphe au hasard
  // qui ferait croire à autre chose : on ne rend rien.
  if (!Cmp) return null;
  return <Cmp className={className} aria-hidden="true" {...rest} />;
}

/** La pastille de la maquette — `kind` pioche dans les couleurs de la feuille. */
export function Pill({
  kind = "",
  children,
  style,
}: {
  kind?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`pill ${kind}`.trim()} style={style}>
      {children}
    </span>
  );
}
