"use client";

/**
 * Dashboard hôte des réservations : filtres à venir / en attente / passées /
 * annulées (synchronisés avec l'URL), rangées avec barre de statut et détail
 * dépliable, actions confirmer / refuser / annuler / reprogrammer, vue équipe
 * et filtre par hôte pour l'admin.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  Video,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/AuthContext";
import {
  bookingAction,
  fetchBookings,
  type BookingFilter,
  type BookingWithHost,
} from "@/lib/scheduling/client";
import { getAppUrlClient } from "./shared";

const FILTERS: { id: BookingFilter; label: string }[] = [
  { id: "upcoming", label: "À venir" },
  { id: "pending", label: "En attente" },
  { id: "past", label: "Passées" },
  { id: "cancelled", label: "Annulées" },
];

const STATUS_META: Record<
  string,
  { label: string; bar: string; chip: string }
> = {
  confirmed: {
    label: "Confirmé",
    bar: "bg-[var(--ok)]",
    chip: "bg-[var(--ok-tint)] text-[var(--ok)]",
  },
  pending: {
    label: "En attente",
    bar: "bg-[var(--warn)]",
    chip: "bg-[var(--warn-tint)] text-[var(--warn)]",
  },
  cancelled: {
    label: "Annulé",
    bar: "bg-[var(--danger)]",
    chip: "bg-[var(--danger-tint)] text-[var(--danger)]",
  },
  declined: {
    label: "Refusé",
    bar: "bg-[var(--danger)]",
    chip: "bg-[var(--danger-tint)] text-[var(--danger)]",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  public: "Lien public",
  embed: "Site web",
  agent: "Agent",
  api: "API",
};

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtRange = (startIso: string, endIso: string) =>
  `${fmtDay(startIso)} · ${fmtTime(startIso)} – ${fmtTime(endIso)}`;

const VALID_FILTERS: BookingFilter[] = ["upcoming", "pending", "past", "cancelled"];

export default function BookingsDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  // L'URL est la source de vérité (liens de la nav Cal.SAMA, vue Équipe).
  const urlFilter = searchParams?.get("filter") as BookingFilter | null;
  const filter: BookingFilter =
    urlFilter && VALID_FILTERS.includes(urlFilter) ? urlFilter : "upcoming";
  const hostId = isAdmin ? searchParams?.get("host") ?? null : null;
  const teamWide = isAdmin && !hostId && searchParams?.get("all") === "1";

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setFilter = (f: BookingFilter) => setQuery({ filter: f === "upcoming" ? null : f });
  const setTeamWide = (v: boolean) => setQuery({ all: v ? "1" : null, host: null });

  const [bookings, setBookings] = useState<BookingWithHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const [cancelTarget, setCancelTarget] = useState<BookingWithHost | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<BookingWithHost | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [main, pending] = await Promise.all([
        fetchBookings(filter, teamWide, hostId),
        filter === "pending"
          ? Promise.resolve(null)
          : fetchBookings("pending", teamWide, hostId).catch(() => null),
      ]);
      setBookings(main.bookings);
      setPendingCount(filter === "pending" ? main.bookings.length : pending?.bookings.length ?? 0);
    } catch (err) {
      toast.error("Impossible de charger les réservations", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [filter, teamWide, hostId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    booking: BookingWithHost,
    action: "confirm" | "decline" | "cancel" | "reschedule",
    extra: { reason?: string | null; start?: string } = {},
  ) => {
    setWorking(true);
    try {
      await bookingAction(booking.id, action, extra);
      toast.success(
        action === "confirm"
          ? "Rendez-vous confirmé — emails envoyés"
          : action === "decline"
            ? "Demande refusée"
            : action === "cancel"
              ? "Rendez-vous annulé — invité prévenu"
              : "Rendez-vous reprogrammé — emails envoyés",
      );
      setCancelTarget(null);
      setCancelReason("");
      setRescheduleTarget(null);
      setRescheduleAt("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "slot_unavailable" || msg === "slot_taken"
          ? "Ce créneau n'est pas disponible (règles de dispo ou conflit)."
          : "L'action a échoué",
        { description: msg && !msg.startsWith("slot") ? msg : undefined },
      );
    } finally {
      setWorking(false);
    }
  };

  const copyManageLink = (b: BookingWithHost) => {
    void navigator.clipboard.writeText(`${getAppUrlClient()}/rdv/gerer/${b.manage_token}`);
    toast.success("Lien de gestion copié (reprogrammer / annuler)");
  };

  return (
    <div className="space-y-4">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {f.id === "pending" && pendingCount > 0 ? (
                <span className="cal-mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--warn)] px-1 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hostId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              <User className="h-3 w-3" />
              {bookings[0]?.host?.full_name ?? bookings[0]?.host?.email ?? "Hôte sélectionné"}
              <button
                type="button"
                onClick={() => setQuery({ host: null })}
                aria-label="Retirer le filtre hôte"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          {isAdmin && !hostId ? (
            <Button
              variant={teamWide ? "default" : "outline"}
              size="sm"
              onClick={() => setTeamWide(!teamWide)}
            >
              <User className="mr-1.5 h-4 w-4" />
              {teamWide ? "Toute l'équipe" : "Mes RDV"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "upcoming"
              ? "Aucun rendez-vous à venir. Partagez votre lien de réservation !"
              : filter === "pending"
                ? "Aucune demande en attente de validation."
                : filter === "past"
                  ? "Aucun rendez-vous passé."
                  : "Aucun rendez-vous annulé."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.confirmed;
            const isExpanded = expanded === b.id;
            const isActive = b.status === "pending" || b.status === "confirmed";
            return (
              <div key={b.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : b.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--hover)]"
                >
                  <span className={`h-9 w-[3px] shrink-0 rounded-full ${meta.bar}`} />
                  <span className="cal-mono w-14 shrink-0 text-center">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fmtDay(b.start_at)}
                    </span>
                    <span className="block text-sm font-semibold">{fmtTime(b.start_at)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{b.invitee_name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                      {b.source !== "public" ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {SOURCE_LABELS[b.source] ?? b.source}
                        </span>
                      ) : null}
                      {(teamWide || hostId) && b.host ? (
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {b.host.full_name ?? b.host.email}
                        </span>
                      ) : null}
                    </span>
                    <span className="cal-mono mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {b.event_title} · {fmtRange(b.start_at, b.end_at)}
                    </span>
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {isExpanded ? (
                  <div className="border-t bg-muted/30 px-4 py-3">
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-muted-foreground">
                          Email :{" "}
                          <a
                            className="text-foreground underline underline-offset-2"
                            href={`mailto:${b.invitee_email}`}
                          >
                            {b.invitee_email}
                          </a>
                        </p>
                        {b.invitee_phone ? (
                          <p className="text-muted-foreground">
                            Téléphone : <span className="text-foreground">{b.invitee_phone}</span>
                          </p>
                        ) : null}
                        <p className="text-muted-foreground">
                          Fuseau invité :{" "}
                          <span className="text-foreground">{b.invitee_timezone}</span>
                        </p>
                        {b.additional_guests?.length ? (
                          <p className="text-muted-foreground">
                            Invités :{" "}
                            <span className="text-foreground">
                              {b.additional_guests.join(", ")}
                            </span>
                          </p>
                        ) : null}
                        {b.meeting_url ? (
                          <p className="flex items-center gap-1.5">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            <a
                              href={b.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              Lien visio
                            </a>
                          </p>
                        ) : null}
                        {b.location_text ? (
                          <p className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="h-4 w-4" /> {b.location_text}
                          </p>
                        ) : null}
                        {b.cancellation_reason ? (
                          <p className="text-muted-foreground">
                            Motif :{" "}
                            <span className="text-foreground">{b.cancellation_reason}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        {(b.answers ?? []).map((a) => (
                          <p key={a.id} className="text-muted-foreground">
                            {a.label} : <span className="text-foreground">{a.value}</span>
                          </p>
                        ))}
                        {b.invitee_notes ? (
                          <p className="text-muted-foreground">
                            Notes : <span className="text-foreground">{b.invitee_notes}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {b.status === "pending" ? (
                        <>
                          <Button size="sm" disabled={working} onClick={() => void act(b, "confirm")}>
                            <Check className="mr-1.5 h-4 w-4" /> Confirmer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={working}
                            onClick={() => void act(b, "decline")}
                          >
                            <X className="mr-1.5 h-4 w-4" /> Refuser
                          </Button>
                        </>
                      ) : null}
                      {isActive ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={working}
                            onClick={() => {
                              setRescheduleTarget(b);
                              setRescheduleAt("");
                            }}
                          >
                            <RefreshCw className="mr-1.5 h-4 w-4" /> Reprogrammer
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--danger)] hover:text-[var(--danger)]"
                            disabled={working}
                            onClick={() => setCancelTarget(b)}
                          >
                            <X className="mr-1.5 h-4 w-4" /> Annuler
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyManageLink(b)}>
                            <Link2 className="mr-1.5 h-4 w-4" /> Lien de gestion
                          </Button>
                        </>
                      ) : null}
                      {b.contact_id ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/contacts?focus=${b.contact_id}`}>
                            <ExternalLink className="mr-1.5 h-4 w-4" /> Fiche contact
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Annulation avec motif */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler le rendez-vous</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `${cancelTarget.invitee_name} — ${fmtRange(cancelTarget.start_at, cancelTarget.end_at)}. L'invité sera prévenu par email.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motif (transmis à l&apos;invité, optionnel)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Ex. imprévu de mon côté, je vous propose un autre créneau…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              disabled={working}
              onClick={() =>
                cancelTarget && void act(cancelTarget, "cancel", { reason: cancelReason || null })
              }
            >
              {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Annuler le RDV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprogrammation */}
      <Dialog open={!!rescheduleTarget} onOpenChange={(o) => !o && setRescheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprogrammer le rendez-vous</DialogTitle>
            <DialogDescription>
              Le nouveau créneau doit respecter vos disponibilités — il est vérifié comme une
              réservation normale, et l&apos;invité reçoit la mise à jour par email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reschedule-at">Nouveau créneau (votre heure locale)</Label>
            <Input
              id="reschedule-at"
              type="datetime-local"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
              step={300}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>
              Retour
            </Button>
            <Button
              disabled={working || !rescheduleAt}
              onClick={() => {
                if (!rescheduleTarget || !rescheduleAt) return;
                void act(rescheduleTarget, "reschedule", {
                  start: new Date(rescheduleAt).toISOString(),
                });
              }}
            >
              {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Reprogrammer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
