"use client";

/**
 * Aperçu Cal.SAMA (habillage maquettes) : tuiles serif, carte héro sombre
 * « prochain RDV », demandes à valider, prochains rendez-vous, raccourcis.
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
const fmtLong = (iso: string) => {
  const s = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
  return `${s} · ${fmtTime(iso)}`;
};

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
  return (
    <div className="blk stat">
      <span className="cs-tag">{label}</span>
      <div className={`v ${tone ?? ""}`}>{value}</div>
      {hint ? <div className="h">{hint}</div> : null}
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
      <div className="blk empty">
        <Loader2 size={18} className="spin" style={{ margin: "0 auto 8px" }} />
        Chargement…
      </div>
    );
  }

  const next = upcoming.find((b) => b.status === "confirmed") ?? upcoming[0] ?? null;
  const rest = next ? upcoming.filter((b) => b.id !== next.id).slice(0, 5) : upcoming.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Tuiles */}
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
        {/* Prochain RDV — carte héro sombre (signature maquette) */}
        <div>
          {next ? (
            <div className="hero-dark">
              <div className="h4">
                Prochain rendez-vous ·{" "}
                {new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(
                  new Date(next.start_at),
                )}
              </div>
              <div className="nm">
                {next.invitee_name}
                <br />
                <span>{next.event_title}</span>
              </div>
              <div className="meta">
                <div>
                  <Clock size={13} /> {fmtLong(next.start_at)}
                </div>
                <div>
                  <Mail size={13} /> {next.invitee_email}
                </div>
                {next.invitee_phone ? (
                  <div>
                    <Phone size={13} /> {next.invitee_phone}
                  </div>
                ) : null}
              </div>
              <div className="actions">
                {next.meeting_url ? (
                  <a
                    href={next.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn accent xs grow"
                  >
                    <Video size={13} /> Rejoindre la visio
                  </a>
                ) : (
                  <Link href={`${basePath}/reservations`} className="btn accent xs grow">
                    Voir le détail
                  </Link>
                )}
                <a href={`mailto:${next.invitee_email}`} className="btn dark-ghost icon xs" aria-label="Écrire">
                  <Mail size={13} />
                </a>
              </div>
            </div>
          ) : (
            <div className="blk empty">
              <CalendarClock size={22} />
              Rien de prévu.
              <br />
              Partagez votre lien pour recevoir des réservations.
            </div>
          )}

          {/* Raccourcis */}
          <div className="blk" style={{ marginTop: 12 }}>
            <h4>Raccourcis</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Link href={`${basePath}/types`} className="btn outline sm" style={{ justifyContent: "flex-start" }}>
                <CalendarCog size={14} /> Gérer mes types d&apos;évènements
              </Link>
              <Link
                href={`${basePath}/disponibilites`}
                className="btn outline sm"
                style={{ justifyContent: "flex-start" }}
              >
                <Clock3 size={14} /> Ajuster mes disponibilités
              </Link>
              <button
                type="button"
                className="btn outline sm"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  if (!publicUrl) return;
                  void navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien public copié");
                }}
              >
                <Copy size={14} /> Copier mon lien public
              </button>
            </div>
          </div>
        </div>

        {/* Demandes à valider */}
        <div className="blk" style={{ alignSelf: "start" }}>
          <h4>
            <Hourglass size={13} style={{ color: "var(--warn)" }} /> À valider
            <Link href={`${basePath}/reservations?filter=pending`} className="btn ghost xs" style={{ marginLeft: "auto" }}>
              Tout voir <ArrowRight size={12} />
            </Link>
          </h4>
          {pending.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
              Aucune demande en attente. 👌
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pending.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 9,
                    background: "var(--warn-tint)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{b.invitee_name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                      {b.event_title} · {fmtDay(b.start_at)} {fmtTime(b.start_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn accent icon xs"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "confirm")}
                    aria-label="Confirmer"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn outline icon xs"
                    disabled={working === b.id}
                    onClick={() => void quickAction(b, "decline")}
                    aria-label="Refuser"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prochains RDV */}
        <div className="blk" style={{ alignSelf: "start" }}>
          <h4>
            Ensuite
            <Link href={`${basePath}/reservations`} className="btn ghost xs" style={{ marginLeft: "auto" }}>
              Tout voir <ArrowRight size={12} />
            </Link>
          </h4>
          {rest.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
              Rien d&apos;autre de prévu.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {rest.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 2px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div className="when">
                    <div className="d">{fmtDay(b.start_at)}</div>
                    <div className="t">{fmtTime(b.start_at)}</div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.invitee_name}
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.event_title}
                    </div>
                  </div>
                  {b.status === "pending" ? <span className="pill warn">attente</span> : null}
                  {b.meeting_url ? (
                    <a
                      href={b.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn ghost icon xs"
                      aria-label="Lien visio"
                    >
                      <Video size={13} />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {user?.role === "admin" ? (
        <p style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          Astuce : la page{" "}
          <Link className="link" href={`${basePath}/equipe`}>
            Équipe
          </Link>{" "}
          liste les liens de réservation de tous les agents.
        </p>
      ) : null}
    </div>
  );
}
