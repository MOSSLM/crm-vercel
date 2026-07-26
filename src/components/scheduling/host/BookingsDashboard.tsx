"use client";

/**
 * Réservations — portage de `ScreenBookings` + `BookingDrawer`
 * (rdv-screens-a.jsx) : segmented des filtres, recherche, sélecteur d'hôte,
 * séparateurs de jour, rangées `rv-bk` et tiroir de détail avec journal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  bookingAction,
  fetchBookings,
  fetchEventTypes,
  fetchTeam,
  type BookingFilter,
  type BookingWithHost,
  type TeamMember,
} from "@/lib/scheduling/client";
import type { EventType } from "@/lib/scheduling/types";
import { useAuth } from "@/components/AuthContext";
import { Blk, Btn, Chip, Pill, RV_LOC, Row, Seg, Stack, ST_LB, addMin } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import BookingRow from "../rdv/BookingRow";
import { SectionHeader, BOOKING_FILTERS } from "./CalShell";
import { dayLong, displayStatus, durationOf, getAppUrlClient, hhmm } from "../rdv/shared";

const VALID: BookingFilter[] = ["upcoming", "pending", "past", "cancelled"];

export default function BookingsDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const urlFilter = searchParams?.get("filter") as BookingFilter | null;
  const filter: BookingFilter = urlFilter && VALID.includes(urlFilter) ? urlFilter : "upcoming";
  const hostId = isAdmin ? searchParams?.get("host") ?? null : null;

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [bookings, setBookings] = useState<BookingWithHost[]>([]);
  const [types, setTypes] = useState<EventType[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [main, pend, tps] = await Promise.all([
        fetchBookings(filter, isAdmin && !hostId, hostId),
        filter === "pending" ? Promise.resolve(null) : fetchBookings("pending").catch(() => null),
        fetchEventTypes().catch(() => ({ event_types: [] as EventType[] })),
      ]);
      setBookings(main.bookings);
      setTypes(tps.event_types);
      setPendingCount(filter === "pending" ? main.bookings.length : pend?.bookings.length ?? 0);
      if (isAdmin && team.length === 0) {
        const t = await fetchTeam().catch(() => null);
        if (t) setTeam(t.members);
      }
    } catch (err) {
      toast.error("Impossible de charger les réservations", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
    // team.length volontairement hors deps : chargé une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, hostId, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    b: BookingWithHost,
    action: "confirm" | "decline" | "cancel" | "reschedule",
    extra: { reason?: string | null; start?: string } = {},
  ) => {
    setWorking(b.id);
    try {
      await bookingAction(b.id, action, extra);
      toast.success(
        action === "confirm"
          ? "Rendez-vous confirmé — emails envoyés"
          : action === "decline"
            ? "Demande refusée"
            : action === "cancel"
              ? "Rendez-vous annulé — invité prévenu"
              : "Rendez-vous reprogrammé",
      );
      setSel(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "slot_unavailable" || msg === "slot_taken"
          ? "Ce créneau n'est pas disponible."
          : "L'action a échoué",
      );
    } finally {
      setWorking(null);
    }
  };

  const reschedule = (b: BookingWithHost) => {
    const raw = window.prompt(
      "Nouveau créneau (format JJ/MM/AAAA HH:MM, votre heure locale) :",
      "",
    );
    if (!raw) return;
    const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (!m) {
      toast.error("Format attendu : JJ/MM/AAAA HH:MM");
      return;
    }
    const [, d, mo, y, h, mi] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    if (Number.isNaN(dt.getTime())) {
      toast.error("Date invalide");
      return;
    }
    void act(b, "reschedule", { start: dt.toISOString() });
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((b) =>
      [b.invitee_name, b.invitee_email, b.event_title, b.invitee_phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [bookings, q]);

  const days = [...new Set(list.map((b) => dayLong(b.start_at)))];
  const current = bookings.find((b) => b.id === sel) ?? null;
  const colorOfType = (b: BookingWithHost) =>
    types.find((t) => t.id === b.event_type_id)?.color ?? null;

  return (
    <>
      <SectionHeader
        title="Réservations"
        subtitle="Tout ce qui est réservé sur vos liens — page publique, embed, ou calé par un agent pendant un appel."
      />

      <Row style={{ marginBottom: 13, gap: 10 }}>
        <Seg
          opts={BOOKING_FILTERS.map((f) => ({
            id: f.id,
            lb:
              f.id === "pending" && pendingCount ? (
                <>
                  En attente
                  <span className="pill warn" style={{ height: 15, padding: "0 4px", marginLeft: 4 }}>
                    {pendingCount}
                  </span>
                </>
              ) : (
                f.lb
              ),
          }))}
          val={filter}
          set={(id) => setQuery({ filter: id === "upcoming" ? null : id })}
          lg
        />
        <span style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Icon
            name="search"
            className="ico-sm"
            style={{ position: "absolute", left: 8, top: 8, color: "var(--text-4)" }}
          />
          <input
            className="rv-in"
            style={{ width: 210, paddingLeft: 27 }}
            placeholder="Invité, entreprise, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {isAdmin ? (
          <select
            className="rv-in"
            style={{ width: 150 }}
            value={hostId ?? "all"}
            onChange={(e) => setQuery({ host: e.target.value === "all" ? null : e.target.value })}
          >
            <option value="all">Tous les hôtes</option>
            {team.map((h) => (
              <option key={h.user_id} value={h.user_id}>
                {h.name}
              </option>
            ))}
          </select>
        ) : null}
      </Row>

      <div className="rv-list">
        {loading ? (
          <div style={{ padding: 40 }}>
            <div className="rv-empty">Chargement…</div>
          </div>
        ) : list.length ? (
          days.map((d) => (
            <div key={d}>
              <div className="rv-day-sep">
                <span>{d}</span>
                <span>
                  {list.filter((x) => dayLong(x.start_at) === d).length} rendez-vous
                </span>
              </div>
              {list
                .filter((x) => dayLong(x.start_at) === d)
                .map((x) => (
                  <BookingRow
                    key={x.id}
                    b={x}
                    sel={sel}
                    onSel={setSel}
                    showHost={isAdmin}
                    working={working === x.id}
                    typeColor={colorOfType(x)}
                    onConfirm={(b) => void act(b, "confirm")}
                    onDecline={(b) => void act(b, "decline")}
                    onReschedule={reschedule}
                  />
                ))}
            </div>
          ))
        ) : (
          <div style={{ padding: 40 }}>
            <div className="rv-empty">Rien dans cette vue.</div>
          </div>
        )}
      </div>

      {current ? (
        <BookingDrawer
          b={current}
          types={types}
          working={working === current.id}
          onClose={() => setSel(null)}
          onAct={act}
          onReschedule={reschedule}
        />
      ) : null}
    </>
  );
}

function BookingDrawer({
  b,
  types,
  working,
  onClose,
  onAct,
  onReschedule,
}: {
  b: BookingWithHost;
  types: EventType[];
  working?: boolean;
  onClose: () => void;
  onAct: (
    b: BookingWithHost,
    action: "confirm" | "decline" | "cancel" | "reschedule",
    extra?: { reason?: string | null; start?: string },
  ) => void;
  onReschedule: (b: BookingWithHost) => void;
}) {
  const st = displayStatus(b);
  const [lb, kind] = ST_LB[st] ?? ST_LB.confirmed;
  const loc = RV_LOC[b.location_type] ?? RV_LOC.custom;
  const type = types.find((t) => t.id === b.event_type_id) ?? null;

  // Journal reconstitué depuis les horodatages réels du booking.
  const stamp = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : "—";

  const timeline: { ic: string; lb: string; d: string; tint: string }[] = [
    {
      ic: b.source === "agent" ? "phone" : b.source === "embed" ? "code" : "globe",
      lb:
        b.source === "agent"
          ? "Calée par un agent pendant un appel"
          : b.source === "embed"
            ? "Réservée depuis un site (embed)"
            : "Réservée par l'invité",
      d: stamp(b.created_at),
      tint: "info",
    },
  ];
  if (b.confirmed_at) {
    timeline.push({
      ic: "mail",
      lb: "Confirmation + invitation .ics envoyées",
      d: stamp(b.confirmed_at),
      tint: "ok",
    });
  }
  if (b.calendar_event_id || b.google_event_id) {
    timeline.push({
      ic: "calendar",
      lb: b.google_event_id
        ? "Ajoutée au calendrier CRM et à Google Agenda"
        : "Ajoutée au calendrier CRM",
      d: stamp(b.confirmed_at ?? b.created_at),
      tint: "",
    });
  }
  if (b.cancelled_at) {
    timeline.push({
      ic: "ban",
      lb: `Annulée par ${b.cancelled_by === "invitee" ? "l'invité" : "l'hôte"}`,
      d: stamp(b.cancelled_at),
      tint: "danger",
    });
  }

  const manageUrl = `${getAppUrlClient()}/rdv/gerer/${b.manage_token}`;

  return (
    <div
      className="rv-ov"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rv-drawer" role="dialog" aria-modal="true">
        <div className="rv-dr-hd">
          <div style={{ flex: 1 }}>
            <Row style={{ gap: 7, marginBottom: 8 }}>
              <Pill kind={kind} dot>
                {lb}
              </Pill>
              <Chip line ic="clock">
                {dayLong(b.start_at)} · {hhmm(b.start_at)}–
                {addMin(hhmm(b.start_at), durationOf(b))}
              </Chip>
            </Row>
            <h2 className="t">{b.invitee_name}</h2>
            <div className="s">{b.event_title.toUpperCase()}</div>
          </div>
          <button type="button" className="cx" onClick={onClose} aria-label="Fermer">
            <Icon name="x" className="ico-sm" />
          </button>
        </div>

        <div className="rv-dr-bd">
          <Blk title="Invité">
            <Stack gap={8}>
              {(
                [
                  ["Email", b.invitee_email],
                  ["Téléphone", b.invitee_phone ?? "—"],
                  ["Fuseau", b.invitee_timezone.replace("_", " ")],
                  ["Lieu", b.location_text || loc.lb],
                ] as [string, string][]
              ).map(([k, v]) => (
                <Row key={k} style={{ gap: 12 }}>
                  <span
                    style={{ width: 76, fontSize: 11.5, color: "var(--text-3)", flexShrink: 0 }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontFamily:
                        k === "Email" || k === "Téléphone" ? "var(--font-mono)" : "inherit",
                    }}
                  >
                    {v}
                  </span>
                </Row>
              ))}
              {b.meeting_url ? (
                <Row style={{ gap: 12 }}>
                  <span style={{ width: 76, fontSize: 11.5, color: "var(--text-3)" }}>Visio</span>
                  <a
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                    href={b.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {b.meeting_url.replace(/^https?:\/\//, "")}
                  </a>
                </Row>
              ) : null}
              {b.additional_guests?.length ? (
                <Row style={{ gap: 12 }}>
                  <span style={{ width: 76, fontSize: 11.5, color: "var(--text-3)" }}>Invités</span>
                  <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
                    {b.additional_guests.join(", ")}
                  </span>
                </Row>
              ) : null}
            </Stack>
          </Blk>

          <Blk title="Réponses au formulaire">
            <Stack gap={9}>
              {b.answers?.length ? (
                b.answers.map((a) => (
                  <div key={a.id}>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{a.label}</div>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>{a.value}</div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {type?.custom_questions?.length
                    ? "Aucune réponse fournie."
                    : "Aucune question sur ce type de RDV."}
                </div>
              )}
              {b.invitee_notes ? (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>Notes de l&apos;invité</div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>{b.invitee_notes}</div>
                </div>
              ) : null}
            </Stack>
          </Blk>

          <Blk
            title="Rattachement CRM"
            right={
              b.contact_id ? (
                <Btn
                  kind="ghost"
                  size="xs"
                  ic="ext"
                  onClick={() => window.open(`/contacts?focus=${b.contact_id}`, "_blank")}
                >
                  Ouvrir
                </Btn>
              ) : undefined
            }
          >
            <Row style={{ gap: 7, flexWrap: "wrap" }}>
              {b.contact_id ? (
                <Chip ic="user">Contact rapproché par email</Chip>
              ) : (
                <Chip ic="user">Aucun contact rapproché</Chip>
              )}
              {b.entreprise_id ? <Chip ic="building">Entreprise liée</Chip> : null}
              {b.opportunite_id ? <Chip ic="pipeline">Opportunité liée</Chip> : null}
              {b.call_id ? <Chip ic="phone">Appel lié</Chip> : null}
            </Row>
          </Blk>

          <Blk title="Journal">
            <Stack gap={0}>
              {timeline.map((e, i) => (
                <Row
                  key={`${e.ic}-${i}`}
                  style={{
                    gap: 10,
                    padding: "8px 0",
                    borderTop: i ? "1px solid var(--border)" : 0,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: e.tint ? `var(--${e.tint}-tint)` : "var(--bg-2)",
                      color: e.tint ? `var(--${e.tint})` : "var(--text-3)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={e.ic} className="ico-xs" />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5 }}>{e.lb}</div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        color: "var(--text-4)",
                        marginTop: 1,
                      }}
                    >
                      {e.d}
                    </div>
                  </div>
                </Row>
              ))}
            </Stack>
          </Blk>

          <Blk title="Lien de gestion invité">
            <Row style={{ gap: 7 }}>
              <input className="rv-in" readOnly value={manageUrl} style={{ flex: 1 }} />
              <Btn
                kind="outline"
                size="xs"
                ic="copy"
                onClick={() => {
                  void navigator.clipboard.writeText(manageUrl);
                  toast.success("Lien de gestion copié");
                }}
              />
            </Row>
          </Blk>
        </div>

        <div className="rv-dr-ft">
          {st === "pending" && (
            <Btn kind="ok" ic="check" disabled={working} onClick={() => onAct(b, "confirm")}>
              Valider la demande
            </Btn>
          )}
          {st === "pending" || st === "confirmed" ? (
            <>
              <Btn kind="outline" ic="repeat" disabled={working} onClick={() => onReschedule(b)}>
                Reprogrammer
              </Btn>
              <Btn
                kind="outline"
                ic="mail"
                onClick={() => window.open(`mailto:${b.invitee_email}`, "_blank")}
              >
                Relancer
              </Btn>
              <span className="sp" />
              <Btn
                kind="danger"
                ic="ban"
                disabled={working}
                onClick={() => {
                  const reason = window.prompt("Motif d'annulation (optionnel) :", "") ?? null;
                  onAct(b, "cancel", { reason });
                }}
              >
                Annuler
              </Btn>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
