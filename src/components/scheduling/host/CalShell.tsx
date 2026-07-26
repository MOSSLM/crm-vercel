"use client";

/**
 * Coquille du module Rendez-vous — portage du `rv-cal-rail` de la maquette
 * Claude Design : rail sombre (encre) avec grille en filigrane, sections
 * Rendez-vous / Pilotage / Réglages, badge de demandes en attente,
 * sous-filtres à compteurs et carte « votre lien public » en pied.
 *
 * Tout est enveloppé dans `.rv-scope` : la CSS de la maquette (rdv-skin.css)
 * y est confinée et n'écrase jamais le design system du CRM.
 */

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { fetchBookings, fetchSchedulingPage } from "@/lib/scheduling/client";
import { Icon } from "../rdv/Icon";
import "../rdv-skin.css";
import "../rdv-embed.css";

type SubItem = { id: string; lb: string };
type NavItem = {
  id: string;
  lb: string;
  ic: string;
  href: string;
  admin?: boolean;
  badge?: number;
  subs?: SubItem[];
};

export const BOOKING_FILTERS: SubItem[] = [
  { id: "upcoming", lb: "À venir" },
  { id: "pending", lb: "En attente" },
  { id: "past", lb: "Passées" },
  { id: "cancelled", lb: "Annulées" },
];

const buildNav = (base: string, pending: number): { s: string; items: NavItem[] }[] => [
  {
    s: "Rendez-vous",
    items: [
      { id: "overview", lb: "Aperçu", ic: "grid", href: base },
      {
        id: "bookings",
        lb: "Réservations",
        ic: "calCheck",
        href: `${base}/reservations`,
        badge: pending,
        subs: BOOKING_FILTERS,
      },
      { id: "types", lb: "Types d'évènements", ic: "calCog", href: `${base}/types` },
      { id: "avail", lb: "Disponibilités", ic: "clock", href: `${base}/disponibilites` },
    ],
  },
  {
    s: "Pilotage",
    items: [
      { id: "team", lb: "Équipe", ic: "users", href: `${base}/equipe`, admin: true },
      { id: "stats", lb: "Statistiques", ic: "bar", href: `${base}/statistiques` },
    ],
  },
  {
    s: "Réglages",
    items: [
      { id: "integrations", lb: "Intégrations", ic: "plug", href: `${base}/integrations` },
      { id: "settings", lb: "Ma page", ic: "settings", href: `${base}/parametres` },
    ],
  },
];

function CalRail({ basePath }: { basePath: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [pending, setPending] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pendingRes, page] = await Promise.all([
        fetchBookings("pending").catch(() => null),
        fetchSchedulingPage().catch(() => null),
      ]);
      if (cancelled) return;
      if (pendingRes) {
        setPending(pendingRes.bookings.length);
        setCounts((c) => ({ ...c, pending: pendingRes.bookings.length }));
      }
      if (page) setPublicUrl(page.public_url);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Compteurs des sous-filtres : chargés seulement quand la section est ouverte.
  const onBookings = pathname.startsWith(`${basePath}/reservations`);
  useEffect(() => {
    if (!onBookings) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        (["upcoming", "past", "cancelled"] as const).map(async (f) => {
          const r = await fetchBookings(f).catch(() => null);
          return [f, r?.bookings.length ?? 0] as const;
        }),
      );
      if (!cancelled) setCounts((c) => ({ ...c, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [onBookings]);

  const nav = buildNav(basePath, pending);
  const activeFilter = searchParams?.get("filter") ?? "upcoming";

  const isOn = (item: NavItem) =>
    item.href === basePath
      ? pathname === basePath
      : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <nav className="rv-cal-rail">
      <div className="rv-cr-hd">
        <span className="ic">
          <Icon name="calCheck" className="ico-lg" />
        </span>
        <div>
          <div className="t">Cal.SAMA</div>
          <div className="s">Rendez-vous en ligne</div>
        </div>
      </div>

      <div className="rv-cr-nav">
        {nav.map((sec) => {
          const items = sec.items.filter((i) => !i.admin || isAdmin);
          if (!items.length) return null;
          return (
            <div key={sec.s}>
              <div className="rv-cr-lb">{sec.s}</div>
              {items.map((i) => {
                const on = isOn(i);
                return (
                  <div key={i.id}>
                    <Link href={i.href} className={`rv-ci ${on ? "on" : ""}`.trim()}>
                      <Icon name={i.ic} className="ico-sm" />
                      <span className="lb">{i.lb}</span>
                      {i.badge ? <span className="bd">{i.badge}</span> : null}
                    </Link>
                    {i.subs && on ? (
                      <div className="rv-csub">
                        {i.subs.map((sub) => (
                          <Link
                            key={sub.id}
                            href={`${i.href}?filter=${sub.id}`}
                            className={activeFilter === sub.id ? "on" : ""}
                          >
                            {sub.lb}
                            <span className="n">{counts[sub.id] ?? ""}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {publicUrl ? (
        <div className="rv-cr-ft">
          <div className="rv-link-card">
            <div className="k">Votre lien public</div>
            <div className="u">{publicUrl.replace(/^https?:\/\//, "")}</div>
            <div className="bs">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien public copié");
                }}
              >
                <Icon name="copy" className="ico-xs" />
                Copier
              </button>
              <a className="w" href={publicUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir">
                <Icon name="ext" className="ico-xs" />
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * En-tête de page de la maquette : titre serif, sous-titre et actions.
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rv-ph">
      <div>
        <h1>{title}</h1>
        <div className="sub">{subtitle}</div>
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

/**
 * Layout de la section : rail Cal.SAMA + corps défilant.
 * Le `<main>` du shell parent gère déjà le défilement de la page, donc le
 * rail est simplement `sticky` (cf. rdv-skin.css → .rv-scope .rv-cal-rail).
 */
export default function CalShell({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  return (
    <div className="rv-scope rv-embed">
      <Suspense fallback={null}>
        <CalRail basePath={basePath} />
      </Suspense>
      <div className="rv-content">
        <div className="rv-body">{children}</div>
      </div>
    </div>
  );
}
