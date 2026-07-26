"use client";

/**
 * Coquille de la section Cal.SAMA : une seconde barre de navigation, à droite
 * de la sous-nav du Studio (ou de celle du portail agent), listant toutes les
 * sous-catégories du module.
 *
 * Elle reprend exactement les conventions de `SpaceSubNav` (largeur, fond
 * surface-2, item actif en teinte accent) pour que les deux colonnes se
 * lisent comme un seul système. Aucun token du design system n'est redéfini :
 * clair et sombre restent corrects.
 */

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarCog,
  Clock3,
  Copy,
  ExternalLink,
  LayoutDashboard,
  Plug,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { fetchBookings, fetchSchedulingPage } from "@/lib/scheduling/client";
import "../cal-skin.css";

type CalNavChild = { label: string; href: string; matchQuery?: [string, string] };
type CalNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: number;
  children?: CalNavChild[];
};

const buildNav = (base: string, pendingCount: number): CalNavItem[] => [
  { label: "Aperçu", href: base, icon: LayoutDashboard },
  {
    label: "Réservations",
    href: `${base}/reservations`,
    icon: CalendarCheck,
    badge: pendingCount,
    children: [
      { label: "À venir", href: `${base}/reservations?filter=upcoming`, matchQuery: ["filter", "upcoming"] },
      { label: "En attente", href: `${base}/reservations?filter=pending`, matchQuery: ["filter", "pending"] },
      { label: "Passées", href: `${base}/reservations?filter=past`, matchQuery: ["filter", "past"] },
      { label: "Annulées", href: `${base}/reservations?filter=cancelled`, matchQuery: ["filter", "cancelled"] },
    ],
  },
  { label: "Types d'évènements", href: `${base}/types`, icon: CalendarCog },
  { label: "Disponibilités", href: `${base}/disponibilites`, icon: Clock3 },
  { label: "Équipe", href: `${base}/equipe`, icon: Users, adminOnly: true },
  { label: "Statistiques", href: `${base}/statistiques`, icon: BarChart3 },
  { label: "Intégrations", href: `${base}/integrations`, icon: Plug },
  { label: "Ma page", href: `${base}/parametres`, icon: Settings2 },
];

const itemBase =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors";
const itemActive = "bg-[var(--accent-tint)] font-medium text-primary";
const itemIdle = "text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-foreground";

function CalNav({ basePath }: { basePath: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [pendingCount, setPendingCount] = useState(0);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pending, page] = await Promise.all([
        fetchBookings("pending").catch(() => null),
        fetchSchedulingPage().catch(() => null),
      ]);
      if (cancelled) return;
      if (pending) setPendingCount(pending.bookings.length);
      if (page) setPublicUrl(page.public_url);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const items = buildNav(basePath, pendingCount).filter((i) => !i.adminOnly || isAdmin);

  const isItemActive = (item: CalNavItem) =>
    item.href === basePath
      ? pathname === basePath
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const isChildActive = (item: CalNavItem, child: CalNavChild) => {
    if (!isItemActive(item) || !child.matchQuery) return false;
    const [key, value] = child.matchQuery;
    return (searchParams?.get(key) ?? "upcoming") === value;
  };

  const copyPublicUrl = () => {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl);
    toast.success("Lien public copié");
  };

  return (
    <>
      {/* Colonne de navigation — sticky pendant que le contenu défile */}
      <nav
        aria-label="Navigation Rendez-vous"
        className="hidden w-56 shrink-0 flex-col border-r border-border/60 bg-[var(--surface-2)] px-2.5 py-3 lg:sticky lg:top-0 lg:flex lg:max-h-screen lg:self-start lg:overflow-y-auto"
      >
        <div className="flex items-center gap-2 px-2 pb-3">
          <CalendarClock className="h-4 w-4 text-primary" strokeWidth={2} />
          <div className="leading-tight">
            <div className="cal-display text-[15px]">Cal.SAMA</div>
            <div className="cal-tag text-muted-foreground">Rendez-vous</div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isItemActive(item);
            const Icon = item.icon;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`${itemBase} ${active ? itemActive : itemIdle}`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="cal-mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--warn)] px-1 text-[10px] font-semibold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>

                {item.children && active ? (
                  <div className="mb-1 ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                    {item.children.map((child) => {
                      const childActive = isChildActive(item, child);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={childActive ? "page" : undefined}
                          className={`rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                            childActive
                              ? "font-medium text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {publicUrl ? (
          <div className="mt-auto border-t border-border/60 px-2 pt-3">
            <div className="cal-tag text-muted-foreground">Votre lien public</div>
            <div className="cal-mono mt-1 truncate text-[11px] text-[var(--text-2)]">
              {publicUrl.replace(/^https?:\/\//, "")}
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={copyPublicUrl}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--hover)]"
              >
                <Copy className="h-3 w-3" /> Copier
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Ouvrir la page publique"
                className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2 py-1.5 transition-colors hover:bg-[var(--hover)]"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ) : null}
      </nav>

      {/* Barre horizontale défilante (mobile / tablette) */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-[var(--surface-2)] px-2 py-2 lg:hidden">
        {items.map((item) => {
          const active = isItemActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${itemBase} shrink-0 ${active ? itemActive : itemIdle}`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              {item.label}
              {item.badge ? (
                <span className="cal-mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--warn)] px-1 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** En-tête de page : titre serif + sous-titre, comme les maquettes. */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="cal-display text-[26px] text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

/**
 * Layout de la section. Le `<main>` du shell parent est déjà le conteneur de
 * défilement : on ne crée donc pas de scroll imbriqué, la colonne de nav est
 * simplement `sticky`.
 */
export default function CalShell({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row lg:items-start">
      <Suspense fallback={null}>
        <CalNav basePath={basePath} />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
