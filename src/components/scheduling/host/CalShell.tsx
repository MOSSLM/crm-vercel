"use client";

/**
 * Coquille de la section Cal.SAMA — le « Calendly maison » du CRM.
 *
 * Ajoute une deuxième sidebar verticale à droite de la navigation du shell
 * (rail + sous-nav du Studio, ou nav du portail agent), façon Cal.com, avec
 * toutes les sous-catégories du module : Aperçu, Réservations (avec
 * sous-filtres + badge en attente), Types d'évènements, Disponibilités,
 * Équipe (admin), Statistiques, Intégrations, Ma page.
 *
 * Responsive : sur mobile la sidebar devient une barre horizontale scrollable.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthContext";
import { fetchBookings, fetchSchedulingPage } from "@/lib/scheduling/client";

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

function CalSidebarInner({ basePath }: { basePath: string }) {
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
      {/* Sidebar verticale (≥ lg) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/50 lg:flex">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Cal.SAMA</p>
            <p className="text-[11px] text-muted-foreground">Rendez-vous en ligne</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((item) => {
            const active = isItemActive(item);
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
                {item.children && active ? (
                  <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-[13px] transition",
                          isChildActive(item, child)
                            ? "font-medium text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {publicUrl ? (
          <div className="border-t p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Votre lien public</p>
            <p className="mt-0.5 truncate text-xs">{publicUrl.replace(/^https?:\/\//, "")}</p>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={copyPublicUrl}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Copy className="h-3 w-3" /> Copier
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md border px-2 py-1.5 hover:bg-muted"
                aria-label="Ouvrir la page publique"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Barre horizontale (mobile / tablette) */}
      <div className="border-b bg-card/50 px-2 py-2 lg:hidden">
        <div className="flex items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const active = isItemActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.badge ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** En-tête standard des pages de la section. */
export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </header>
  );
}

/** Layout de section : sidebar Cal.SAMA + zone de contenu scrollable. */
export default function CalShell({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  // Le <main> des deux shells (Studio et portail agent) est une colonne flex
  // scrollable : on prend toute la hauteur, la sidebar reste fixe et seule la
  // zone de contenu scrolle.
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <Suspense fallback={null}>
        <CalSidebarInner basePath={basePath} />
      </Suspense>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
