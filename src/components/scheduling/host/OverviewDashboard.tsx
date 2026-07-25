"use client";

/**
 * Aperçu Cal.SAMA : tuiles de stats, demandes à valider (actions rapides),
 * prochains rendez-vous et raccourcis de configuration.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarCog,
  Check,
  Clock3,
  Copy,
  Hourglass,
  Loader2,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthContext";
import {
  bookingAction,
  fetchBookings,
  fetchSchedulingPage,
  fetchStats,
  type BookingWithHost,
  type SchedulingStats,
} from "@/lib/scheduling/client";

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "ok" | "danger";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-600"
      : tone === "ok"
        ? "text-emerald-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function OverviewDashboard({ basePath }: { basePath: string }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<SchedulingStats | null>(null);
  const [upcoming, setUpcoming] = useState<BookingWithHost[]>([]);
  const [pending, setPending] = useState<BookingWithHost[]>([]);
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, upcomingData, pendingData, pageData] = await Promise.all([
        fetchStats(30),
        fetchBookings("upcoming"),
        fetchBookings("pending"),
        fetchSchedulingPage(),
      ]);
      setStats(statsData);
      setUpcoming(upcomingData.bookings.slice(0, 6));
      setPending(pendingData.bookings.slice(0, 4));
      setPublicUrl(pageData.public_url);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quickAction = async (booking: BookingWithHost, action: "confirm" | "decline") => {
    setWorking(booking.id);
    try {
      await bookingAction(booking.id, action);
      toast.success(action === "confirm" ? "Rendez-vous confirmé" : "Demande refusée");
      await load();
    } catch {
      toast.error("Action impossible");
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tuiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="RDV à venir" value={stats?.totals.upcoming ?? 0} />
        <StatTile
          label="En attente de validation"
          value={stats?.totals.pending ?? 0}
          tone={stats?.totals.pending ? "warn" : "default"}
        />
        <StatTile
          label="Tenus (30 derniers jours)"
          value={stats?.totals.held_past ?? 0}
          tone="ok"
        />
        <StatTile
          label="Taux d'annulation (30 j)"
          value={`${stats?.totals.cancellation_rate ?? 0} %`}
          hint={`${stats?.totals.cancelled_past ?? 0} annulé(s)`}
          tone={(stats?.totals.cancellation_rate ?? 0) >= 30 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Demandes à valider */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Hourglass className="h-4 w-4 text-amber-500" /> À valider
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${basePath}/reservations?filter=pending`}>
                Tout voir <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {pending.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucune demande en attente. 👌</p>
          ) : (
            <div className="mt-3 space-y-2">
              {pending.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.invitee_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.event_title} · {fmtDay(b.start_at)} {fmtTime(b.start_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "confirm")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "decline")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prochains RDV */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarCheck className="h-4 w-4 text-emerald-600" /> Prochains rendez-vous
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${basePath}/reservations`}>
                Tout voir <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Rien de prévu. Partagez votre lien pour recevoir des réservations !
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {fmtDay(b.start_at)}
                    </p>
                    <p className="font-semibold tabular-nums">{fmtTime(b.start_at)}</p>
                  </div>
                  <div className="min-w-0 flex-1 border-l pl-3">
                    <p className="truncate font-medium">{b.invitee_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.event_title}</p>
                  </div>
                  {b.meeting_url ? (
                    <a
                      href={b.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="Lien visio"
                    >
                      <Video className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Raccourcis */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`${basePath}/types`}
          className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"
        >
          <CalendarCog className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">Gérer mes types d&apos;évènements</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={`${basePath}/disponibilites`}
          className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"
        >
          <Clock3 className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">Ajuster mes disponibilités</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
        <button
          type="button"
          onClick={() => {
            if (!publicUrl) return;
            void navigator.clipboard.writeText(publicUrl);
            toast.success("Lien public copié");
          }}
          className="group flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <CalendarClock className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">
            Copier mon lien public
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {publicUrl.replace(/^https?:\/\//, "") || "…"}
            </span>
          </span>
          <Copy className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {user?.role === "admin" ? (
        <p className="text-xs text-muted-foreground">
          Astuce : la page <Link className="underline" href={`${basePath}/equipe`}>Équipe</Link>{" "}
          liste les liens de réservation de tous les agents.
        </p>
      ) : null}
    </div>
  );
}
