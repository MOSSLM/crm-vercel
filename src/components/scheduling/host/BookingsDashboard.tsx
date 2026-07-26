"use client";

/**
 * Dashboard hôte des réservations (habillage maquettes cal-skin) :
 * segmented control à venir / en attente / passées / annulées, rangées à
 * barre de statut, détail dépliable, actions confirmer / refuser / annuler /
 * reprogrammer, vue équipe + filtre par hôte pour l'admin.
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

const STATUS_META: Record<string, { label: string; pill: string; bar: string }> = {
  confirmed: { label: "Confirmé", pill: "ok", bar: "var(--ok)" },
  pending: { label: "En attente", pill: "warn", bar: "var(--warn)" },
  cancelled: { label: "Annulé", pill: "danger", bar: "var(--danger)" },
  declined: { label: "Refusé", pill: "danger", bar: "var(--danger)" },
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
const fmtRange = (startIso: string, endIso: string): string =>
  `${fmtDay(startIso)} · ${fmtTime(startIso)} – ${fmtTime(endIso)}`;

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

  return (
    <div className="space-y-4">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className="seg-btn"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === "pending" && pendingCount > 0 ? (
                <span className="nb">{pendingCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hostId ? (
            <span className="pill outline" style={{ height: 26 }}>
              <User size={12} />
              {bookings[0]?.host?.full_name ?? bookings[0]?.host?.email ?? "Hôte sélectionné"}
              <button
                type="button"
                onClick={() => setQuery({ host: null })}
                aria-label="Retirer le filtre hôte"
                style={{ display: "inline-flex" }}
              >
                <X size={12} />
              </button>
            </span>
          ) : null}
          {isAdmin && !hostId ? (
            <button
              type="button"
              className={"btn sm " + (teamWide ? "primary" : "outline")}
              onClick={() => setTeamWide(!teamWide)}
            >
              <User size={13} />
              {teamWide ? "Toute l'équipe" : "Mes RDV"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn outline icon sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Rafraîchir"
          >
            <RefreshCw size={13} className={loading ? "spin" : undefined} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="blk empty">
          <Loader2 size={18} className="spin" style={{ margin: "0 auto 8px" }} />
          Chargement…
        </div>
      ) : bookings.length === 0 ? (
        <div className="blk empty">
          <CalendarCheck size={22} />
          {filter === "upcoming"
            ? "Aucun rendez-vous à venir. Partagez votre lien de réservation !"
            : filter === "pending"
              ? "Aucune demande en attente de validation."
              : filter === "past"
                ? "Aucun rendez-vous passé."
                : "Aucun rendez-vous annulé."}
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.confirmed;
            const isExpanded = expanded === b.id;
            const isActive = b.status === "pending" || b.status === "confirmed";
            return (
              <div key={b.id} className="rowcard">
                <button
                  type="button"
                  className="rowhead"
                  onClick={() => setExpanded(isExpanded ? null : b.id)}
                >
                  <span className="colorbar" style={{ background: meta.bar }} />
                  <span className="when">
                    <span className="d" style={{ display: "block" }}>
                      {fmtDay(b.start_at)}
                    </span>
                    <span className="t" style={{ display: "block" }}>
                      {fmtTime(b.start_at)}
                    </span>
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="nm">{b.invitee_name}</span>
                      <span className={`pill ${meta.pill}`}>{meta.label}</span>
                      {b.source !== "public" ? (
                        <span className="pill muted">{SOURCE_LABELS[b.source] ?? b.source}</span>
                      ) : null}
                      {(teamWide || hostId) && b.host ? (
                        <span className="pill outline">{b.host.full_name ?? b.host.email}</span>
                      ) : null}
                    </span>
                    <span className="meta">
                      {b.event_title} · {fmtRange(b.start_at, b.end_at)}
                    </span>
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  ) : (
                    <ChevronDown size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  )}
                </button>

                {isExpanded ? (
                  <div className="rowbody">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <p className="kv" style={{ margin: 0 }}>
                          Email :{" "}
                          <a className="link" href={`mailto:${b.invitee_email}`}>
                            {b.invitee_email}
                          </a>
                        </p>
                        {b.invitee_phone ? (
                          <p className="kv" style={{ margin: 0 }}>
                            Téléphone : <b>{b.invitee_phone}</b>
                          </p>
                        ) : null}
                        <p className="kv" style={{ margin: 0 }}>
                          Fuseau invité : <b>{b.invitee_timezone}</b>
                        </p>
                        {b.additional_guests?.length ? (
                          <p className="kv" style={{ margin: 0 }}>
                            Invités : <b>{b.additional_guests.join(", ")}</b>
                          </p>
                        ) : null}
                        {b.meeting_url ? (
                          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                            <Video size={13} style={{ color: "var(--text-3)" }} />
                            <a href={b.meeting_url} target="_blank" rel="noreferrer" className="link">
                              Lien visio
                            </a>
                          </p>
                        ) : null}
                        {b.location_text ? (
                          <p className="kv" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                            <MapPin size={13} /> {b.location_text}
                          </p>
                        ) : null}
                        {b.cancellation_reason ? (
                          <p className="kv" style={{ margin: 0 }}>
                            Motif : <b>{b.cancellation_reason}</b>
                          </p>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {(b.answers ?? []).map((a) => (
                          <p key={a.id} className="kv" style={{ margin: 0 }}>
                            {a.label} : <b>{a.value}</b>
                          </p>
                        ))}
                        {b.invitee_notes ? (
                          <p className="kv" style={{ margin: 0 }}>
                            Notes : <b>{b.invitee_notes}</b>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                      {b.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            className="btn accent sm"
                            disabled={working}
                            onClick={() => void act(b, "confirm")}
                          >
                            <Check size={13} /> Confirmer
                          </button>
                          <button
                            type="button"
                            className="btn outline sm"
                            disabled={working}
                            onClick={() => void act(b, "decline")}
                          >
                            <X size={13} /> Refuser
                          </button>
                        </>
                      ) : null}
                      {isActive ? (
                        <>
                          <button
                            type="button"
                            className="btn outline sm"
                            disabled={working}
                            onClick={() => {
                              setRescheduleTarget(b);
                              setRescheduleAt("");
                            }}
                          >
                            <RefreshCw size={13} /> Reprogrammer
                          </button>
                          <button
                            type="button"
                            className="btn danger-ghost sm"
                            disabled={working}
                            onClick={() => setCancelTarget(b)}
                          >
                            <X size={13} /> Annuler
                          </button>
                          <button type="button" className="btn ghost sm" onClick={() => copyManageLink(b)}>
                            <Link2 size={13} /> Lien de gestion
                          </button>
                        </>
                      ) : null}
                      {b.contact_id ? (
                        <Link href={`/contacts?focus=${b.contact_id}`} className="btn ghost sm">
                          <ExternalLink size={13} /> Fiche contact
                        </Link>
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
