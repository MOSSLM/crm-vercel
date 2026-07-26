"use client";

/**
 * Coquille de la section Cal.SAMA — habillage « cal-skin » fidèle aux
 * maquettes Claude Design (même famille que la centrale d'appels) : sidebar
 * dédiée à droite de la nav du shell, titres Instrument Serif, labels mono,
 * cartes .blk. Responsive : barre horizontale sur mobile.
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
      <aside className="cs-side hidden lg:flex">
        <div className="cs-side-hd">
          <span className="brand-mark">
            <CalendarClock size={14} strokeWidth={2.2} />
          </span>
          <div>
            <div className="t">Cal.SAMA</div>
            <div className="s">Rendez-vous en ligne</div>
          </div>
        </div>

        <nav className="cs-nav">
          {items.map((item) => {
            const active = isItemActive(item);
            return (
              <div key={item.href}>
                <Link href={item.href} className="cs-item" aria-current={active || undefined}>
                  <item.icon size={15} strokeWidth={2} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.label}
                  </span>
                  {item.badge ? <span className="nb">{item.badge}</span> : null}
                </Link>
                {item.children && active ? (
                  <div className="cs-children">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="cs-child"
                        aria-current={isChildActive(item, child) || undefined}
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
          <div className="cs-side-ft">
            <span className="cs-tag">Votre lien public</span>
            <div className="url">{publicUrl.replace(/^https?:\/\//, "")}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button type="button" className="btn outline xs grow" onClick={copyPublicUrl}>
                <Copy size={12} /> Copier
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="btn outline icon xs"
                aria-label="Ouvrir la page publique"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Barre horizontale (mobile / tablette) */}
      <div className="cs-hbar lg:hidden">
        {items.map((item) => {
          const active = isItemActive(item);
          return (
            <Link key={item.href} href={item.href} className="cs-item" aria-current={active || undefined}>
              <item.icon size={14} strokeWidth={2} />
              {item.label}
              {item.badge ? <span className="nb">{item.badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** En-tête standard des pages de la section : titre serif + sous-titre. */
export function SectionHeader({
  title,
  subtitle,
  tag,
}: {
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <header>
      {tag ? <div className="cs-tag" style={{ marginBottom: 4 }}>{tag}</div> : null}
      <h1 className="cs-title">{title}</h1>
      <p className="cs-sub">{subtitle}</p>
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
    <div className="cal-skin flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <Suspense fallback={null}>
        <CalSidebarInner basePath={basePath} />
      </Suspense>
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
        {children}
      </div>
    </div>
  );
}
