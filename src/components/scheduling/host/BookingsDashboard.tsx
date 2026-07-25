"use client";

/**
 * Dashboard hôte des réservations : à venir / en attente / passées / annulées.
 * Actions : confirmer, refuser, annuler (avec motif), reprogrammer, copier le
 * lien de gestion, ouvrir la fiche contact CRM.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  Video,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmé", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800" },
  cancelled: { label: "Annulé", className: "bg-red-100 text-red-700" },
  declined: { label: "Refusé", className: "bg-red-100 text-red-700" },
};

const SOURCE_LABELS: Record<string, string> = {
  public: "Lien public",
  embed: "Site web",
  agent: "Agent",
  api: "API",
};

const fmtRange = (startIso: string, endIso: string): string => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const date = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(start);
  const t = (d: Date) =>
    new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} · ${t(start)} – ${t(end)}`;
};

const VALID_FILTERS: BookingFilter[] = ["upcoming", "pending", "past", "cancelled"];

export default function BookingsDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  // L'URL est la source de vérité (liens de la sidebar Cal.SAMA, vue Équipe).
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

  // Dialogues d'action
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
      setPendingCount(
        filter === "pending" ? main.bookings.length : pending?.bookings.length ?? 0,
      );
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

  const grouped = useMemo(() => bookings, [bookings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-sm">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                "relative rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                (filter === f.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground")
              }
            >
              {f.label}
              {f.id === "pending" && pendingCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hostId ? (
            <Badge variant="outline" className="gap-1 py-1.5">
              <User className="h-3.5 w-3.5" />
              {bookings[0]?.host?.full_name ?? bookings[0]?.host?.email ?? "Hôte sélectionné"}
              <button
                type="button"
                onClick={() => setQuery({ host: null })}
                aria-label="Retirer le filtre hôte"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}
          {isAdmin && !hostId ? (
            <Button
              variant={teamWide ? "default" : "outline"}
              size="sm"
              onClick={() => setTeamWide(!teamWide)}
            >
              <User className="mr-1 h-4 w-4" />
              {teamWide ? "Toute l'équipe" : "Mes RDV"}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border bg-card py-16 text-center shadow-sm">
          <CalendarCheck className="mx-auto h-10 w-10 text-muted-foreground/50" />
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
          {grouped.map((b) => {
            const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE.confirmed;
            const isExpanded = expanded === b.id;
            const isActive = b.status === "pending" || b.status === "confirmed";
            return (
              <div key={b.id} className="rounded-2xl border bg-card shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : b.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.invitee_name}</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                      {b.source !== "public" ? (
                        <Badge variant="outline">{SOURCE_LABELS[b.source] ?? b.source}</Badge>
                      ) : null}
                      {(teamWide || hostId) && b.host ? (
                        <Badge variant="outline">{b.host.full_name ?? b.host.email}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {b.event_title} · {fmtRange(b.start_at, b.end_at)}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {isExpanded ? (
                  <div className="border-t px-4 pb-4 pt-3">
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-muted-foreground">
                          Email :{" "}
                          <a className="text-foreground underline" href={`mailto:${b.invitee_email}`}>
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
                            Invités : <span className="text-foreground">{b.additional_guests.join(", ")}</span>
                          </p>
                        ) : null}
                        {b.meeting_url ? (
                          <p className="flex items-center gap-1.5">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            <a
                              href={b.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
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
                            Motif : <span className="text-foreground">{b.cancellation_reason}</span>
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
                          <Button
                            size="sm"
                            disabled={working}
                            onClick={() => void act(b, "confirm")}
                          >
                            <Check className="mr-1 h-4 w-4" /> Confirmer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={working}
                            onClick={() => void act(b, "decline")}
                          >
                            <X className="mr-1 h-4 w-4" /> Refuser
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
                            <RefreshCw className="mr-1 h-4 w-4" /> Reprogrammer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            disabled={working}
                            onClick={() => setCancelTarget(b)}
                          >
                            <X className="mr-1 h-4 w-4" /> Annuler
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyManageLink(b)}>
                            <Link2 className="mr-1 h-4 w-4" /> Lien de gestion
                          </Button>
                        </>
                      ) : null}
                      {b.contact_id ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/contacts?focus=${b.contact_id}`}>
                            <ExternalLink className="mr-1 h-4 w-4" /> Fiche contact
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
              {working ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
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
                const iso = new Date(rescheduleAt).toISOString();
                void act(rescheduleTarget, "reschedule", { start: iso });
              }}
            >
              {working ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Reprogrammer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
