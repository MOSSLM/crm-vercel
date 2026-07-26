"use client";

/**
 * Aperçu Cal.SAMA : tuiles de synthèse, carte « prochain rendez-vous » en
 * inversion (signature des maquettes), demandes à valider avec actions
 * rapides, prochains RDV et raccourcis.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  CalendarCog,
  Check,
  Clock,
  Clock3,
  Copy,
  Hourglass,
  Loader2,
  Mail,
  Phone,
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
const fmtLong = (iso: string) => `${fmtDay(iso)} · ${fmtTime(iso)}`;

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-[var(--ok)]"
      : tone === "warn"
        ? "text-[var(--warn)]"
        : tone === "danger"
          ? "text-[var(--danger)]"
          : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="cal-tag text-muted-foreground">{label}</div>
      <div className={`cal-display mt-1.5 text-[30px] ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
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
      <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  const next = upcoming.find((b) => b.status === "confirmed") ?? upcoming[0] ?? null;
  const rest = next ? upcoming.filter((b) => b.id !== next.id).slice(0, 5) : upcoming.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="RDV à venir" value={stats?.totals.upcoming ?? 0} />
        <StatTile
          label="En attente"
          value={stats?.totals.pending ?? 0}
          tone={stats?.totals.pending ? "warn" : undefined}
        />
        <StatTile label="Tenus · 30 j" value={stats?.totals.held_past ?? 0} tone="ok" />
        <StatTile
          label="Taux d'annulation · 30 j"
          value={`${stats?.totals.cancellation_rate ?? 0} %`}
          hint={`${stats?.totals.cancelled_past ?? 0} annulé(s)`}
          tone={(stats?.totals.cancellation_rate ?? 0) >= 30 ? "danger" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {/* Prochain RDV — carte inversée (signature maquette) */}
          {next ? (
            <div className="rounded-xl bg-foreground p-4 text-background">
              <div className="cal-tag opacity-50">
                Prochain rendez-vous ·{" "}
                {new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(
                  new Date(next.start_at),
                )}
              </div>
              <div className="cal-display mt-2 text-[24px]">{next.invitee_name}</div>
              <div className="text-[15px] opacity-60">{next.event_title}</div>

              <div className="cal-mono mt-3 space-y-1.5 text-xs opacity-75">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {fmtLong(next.start_at)}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{next.invitee_email}</span>
                </div>
                {next.invitee_phone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {next.invitee_phone}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2">
                {next.meeting_url ? (
                  <a
                    href={next.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Video className="h-3.5 w-3.5" /> Rejoindre la visio
                  </a>
                ) : (
                  <Link
                    href={`${basePath}/reservations`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Voir le détail
                  </Link>
                )}
                <a
                  href={`mailto:${next.invitee_email}`}
                  aria-label="Écrire à l'invité"
                  className="inline-flex items-center justify-center rounded-lg bg-background/10 px-3 py-2 ring-1 ring-inset ring-background/20 transition-colors hover:bg-background/20"
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Rien de prévu. Partagez votre lien pour recevoir des réservations.
              </p>
            </div>
          )}

          {/* Raccourcis */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="cal-tag text-muted-foreground">Raccourcis</div>
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <Link href={`${basePath}/types`}>
                  <CalendarCog className="mr-2 h-4 w-4" /> Gérer mes types d&apos;évènements
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <Link href={`${basePath}/disponibilites`}>
                  <Clock3 className="mr-2 h-4 w-4" /> Ajuster mes disponibilités
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => {
                  if (!publicUrl) return;
                  void navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien public copié");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copier mon lien public
              </Button>
            </div>
          </div>
        </div>

        {/* Demandes à valider */}
        <div className="rounded-xl border bg-card p-4 shadow-sm lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="cal-tag flex items-center gap-1.5 text-muted-foreground">
              <Hourglass className="h-3.5 w-3.5 text-[var(--warn)]" /> À valider
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href={`${basePath}/reservations?filter=pending`}>
                Tout voir <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>

          {pending.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucune demande en attente. 👌</p>
          ) : (
            <div className="mt-3 space-y-2">
              {pending.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--warn)]/25 bg-[var(--warn-tint)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{b.invitee_name}</div>
                    <div className="cal-mono truncate text-[11px] text-muted-foreground">
                      {b.event_title} · {fmtDay(b.start_at)} {fmtTime(b.start_at)}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "confirm")}
                    aria-label="Confirmer"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 shrink-0"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "decline")}
                    aria-label="Refuser"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prochains RDV */}
        <div className="rounded-xl border bg-card p-4 shadow-sm lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="cal-tag text-muted-foreground">Ensuite</div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href={`${basePath}/reservations`}>
                Tout voir <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>

          {rest.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Rien d&apos;autre de prévu.</p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {rest.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="cal-mono w-14 shrink-0 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fmtDay(b.start_at)}
                    </div>
                    <div className="text-sm font-semibold">{fmtTime(b.start_at)}</div>
                  </div>
                  <div className="min-w-0 flex-1 border-l border-border pl-3">
                    <div className="truncate text-sm font-medium">{b.invitee_name}</div>
                    <div className="cal-mono truncate text-[11px] text-muted-foreground">
                      {b.event_title}
                    </div>
                  </div>
                  {b.status === "pending" ? (
                    <span className="shrink-0 rounded-full bg-[var(--warn-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
                      attente
                    </span>
                  ) : null}
                  {b.meeting_url ? (
                    <a
                      href={b.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Lien visio"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
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

      {user?.role === "admin" ? (
        <p className="text-xs text-muted-foreground">
          Astuce : la page{" "}
          <Link className="underline underline-offset-2" href={`${basePath}/equipe`}>
            Équipe
          </Link>{" "}
          liste les liens de réservation de tous les agents.
        </p>
      ) : null}
    </div>
  );
}
