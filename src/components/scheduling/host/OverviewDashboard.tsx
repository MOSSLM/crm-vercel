"use client";

/**
 * Aperçu — portage de `ScreenOverview` (rdv-screens-a.jsx) : hero sombre du
 * prochain rendez-vous avec sparkline, bandeau de KPIs, listes « à valider »
 * et « aujourd'hui & demain », sources de réservation et charge de l'équipe.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  bookingAction,
  fetchBookings,
  fetchEventTypes,
  fetchSchedulingPage,
  fetchStats,
  fetchTeam,
  type BookingWithHost,
  type SchedulingStats,
  type TeamMember,
} from "@/lib/scheduling/client";
import type { EventType } from "@/lib/scheduling/types";
import { useAuth } from "@/components/AuthContext";
import { Av, Blk, Btn, Row, Stack, addMin } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import BookingRow from "../rdv/BookingRow";
import { SectionHeader } from "./CalShell";
import { dayLabel, durationOf, hhmm, rvColorOfHost } from "../rdv/overview-helpers";

const SRC_LABELS: Record<string, { k: string; c: string }> = {
  public: { k: "Page publique", c: "var(--info)" },
  embed: { k: "Embed sur site", c: "var(--magic)" },
  agent: { k: "Calé par un agent", c: "var(--accent)" },
  api: { k: "API", c: "var(--text-3)" },
};

export default function OverviewDashboard({ basePath }: { basePath: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [stats, setStats] = useState<SchedulingStats | null>(null);
  const [upcoming, setUpcoming] = useState<BookingWithHost[]>([]);
  const [pending, setPending] = useState<BookingWithHost[]>([]);
  const [types, setTypes] = useState<EventType[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [publicUrl, setPublicUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, up, pend, page, tps] = await Promise.all([
        fetchStats(30),
        fetchBookings("upcoming"),
        fetchBookings("pending"),
        fetchSchedulingPage(),
        fetchEventTypes().catch(() => ({ event_types: [] as EventType[] })),
      ]);
      setStats(statsData);
      setUpcoming(up.bookings);
      setPending(pend.bookings);
      setPublicUrl(page.public_url);
      setTypes(tps.event_types);
      if (isAdmin) {
        const t = await fetchTeam().catch(() => null);
        if (t) setTeam(t.members);
      }
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const quick = async (b: BookingWithHost, action: "confirm" | "decline") => {
    setWorking(b.id);
    try {
      await bookingAction(b.id, action);
      toast.success(action === "confirm" ? "Rendez-vous confirmé" : "Demande refusée");
      await load();
    } catch {
      toast.error("Action impossible");
    } finally {
      setWorking(null);
    }
  };

  const colorOfType = (b: BookingWithHost): string | null =>
    types.find((t) => t.id === b.event_type_id)?.color ?? null;

  if (loading) {
    return (
      <>
        <SectionHeader
          title="Aperçu"
          subtitle="Vos rendez-vous en ligne, vos demandes à valider et l'état de vos liens de réservation."
        />
        <div className="rv-empty" style={{ padding: 40 }}>
          Chargement…
        </div>
      </>
    );
  }

  const confirmed = upcoming.filter((b) => b.status === "confirmed");
  const next = confirmed[0] ?? null;
  const soon = confirmed
    .filter((b) => ["auj.", "demain"].includes(dayLabel(b.start_at)))
    .slice(0, 4);
  const weeks = stats?.by_week.slice(-6) ?? [];
  const maxWeek = Math.max(1, ...weeks.map((w) => w.total));

  const minutesToNext = next
    ? Math.round((Date.parse(next.start_at) - Date.now()) / 60000)
    : 0;
  const nextIn =
    minutesToNext < 60
      ? `dans ${Math.max(1, minutesToNext)} min`
      : minutesToNext < 24 * 60
        ? `dans ${Math.round(minutesToNext / 60)} h`
        : dayLabel(next?.start_at ?? "");

  // Répartition par canal, en pourcentage (les stats renvoient des volumes).
  const srcTotal = (stats?.by_source ?? []).reduce((acc, s) => acc + s.count, 0);
  const bySrc = (stats?.by_source ?? []).map((s) => ({
    ...SRC_LABELS[s.label] ?? { k: s.label, c: "var(--text-3)" },
    n: srcTotal ? Math.round((s.count / srcTotal) * 100) : 0,
  }));

  return (
    <>
      <SectionHeader
        title="Aperçu"
        subtitle="Vos rendez-vous en ligne, vos demandes à valider et l'état de vos liens de réservation."
        actions={
          <>
            <Btn
              kind="outline"
              ic="ext"
              onClick={() => publicUrl && window.open(publicUrl, "_blank")}
            >
              Voir ma page
            </Btn>
            <Btn kind="primary" ic="calPlus" onClick={() => router.push(`${basePath}/types`)}>
              Nouveau type de RDV
            </Btn>
          </>
        }
      />

      {next ? (
        <div className="rv-hero">
          <div style={{ position: "relative" }}>
            <span className="tag">Prochain rendez-vous · {nextIn}</span>
            <h2>
              {next.invitee_name} — {next.event_title}
            </h2>
            <div className="who">
              <span className="it">
                <Icon name="clock" className="ico-sm" style={{ color: "var(--accent)" }} />
                {hhmm(next.start_at)} – {addMin(hhmm(next.start_at), durationOf(next))}
              </span>
              <span className="it">
                <Icon name="mail" className="ico-sm" style={{ color: "var(--accent)" }} />
                {next.invitee_email}
              </span>
              {next.invitee_phone ? (
                <span className="it">
                  <Icon name="phone" className="ico-sm" style={{ color: "var(--accent)" }} />
                  {next.invitee_phone}
                </span>
              ) : null}
              <span className="it">
                <Icon name="globe" className="ico-sm" style={{ color: "var(--accent)" }} />
                {next.source === "agent"
                  ? "Calé pendant un appel"
                  : next.source === "embed"
                    ? "Réservé depuis un site"
                    : "Réservé sur votre page publique"}
              </span>
            </div>
            <div className="acts">
              {next.meeting_url ? (
                <a className="gb acc" href={next.meeting_url} target="_blank" rel="noreferrer">
                  <Icon name="video" className="ico-sm" />
                  Rejoindre la visio
                </a>
              ) : null}
              {next.contact_id ? (
                <a className="gb" href={`/contacts?focus=${next.contact_id}`}>
                  <Icon name="user" className="ico-sm" />
                  Fiche prospect
                </a>
              ) : null}
              <button
                type="button"
                className="gb"
                onClick={() => router.push(`${basePath}/reservations`)}
              >
                <Icon name="repeat" className="ico-sm" />
                Reprogrammer
              </button>
            </div>
          </div>

          <div className="side">
            <div className="row">
              <span>Réservations à venir</span>
              <b>{stats?.totals.upcoming ?? 0}</b>
            </div>
            <div className="row">
              <span>En attente de validation</span>
              <b className={stats?.totals.pending ? "w" : ""}>{stats?.totals.pending ?? 0}</b>
            </div>
            <div className="row">
              <span>Annulation · 30 j</span>
              <b>{stats?.totals.cancellation_rate ?? 0} %</b>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--on-ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: ".09em",
                }}
              >
                6 dernières semaines
              </div>
              <div className="spark">
                {weeks.map((w, i) => (
                  <i
                    key={w.week}
                    className={i === weeks.length - 1 ? "hi" : ""}
                    style={{ height: `${Math.max(4, (w.total / maxWeek) * 100)}%` }}
                    title={`${w.week} · ${w.total}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rv-kpis">
        <div className="rv-kpi">
          <div className="k">
            <Icon name="calCheck" className="ico-xs" />À venir
          </div>
          <div className="v">{stats?.totals.upcoming ?? 0}</div>
          <div className="d">{confirmed.length} confirmé(s)</div>
        </div>
        <div className="rv-kpi warn">
          <div className="k">
            <Icon name="hourglass" className="ico-xs" />À valider
          </div>
          <div className="v">{stats?.totals.pending ?? 0}</div>
          <div className="d">
            {pending.length ? "demande(s) en attente" : "rien à traiter"}
          </div>
        </div>
        <div className="rv-kpi ok">
          <div className="k">
            <Icon name="check" className="ico-xs" />
            Tenus · 30 j
          </div>
          <div className="v">{stats?.totals.held_past ?? 0}</div>
          <div className="d">sur {stats?.totals.total_past ?? 0} rendez-vous</div>
        </div>
        <div className="rv-kpi">
          <div className="k">
            <Icon name="ban" className="ico-xs" />
            Annulation · 30 j
          </div>
          <div className="v">
            {stats?.totals.cancellation_rate ?? 0}
            <small>%</small>
          </div>
          <div className="d">{stats?.totals.cancelled_past ?? 0} annulé(s)</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="rv-list">
          <div className="rv-list-hd">
            <Icon name="hourglass" className="ico-sm" style={{ color: "var(--warn)" }} />
            <h3>À valider</h3>
            <span className="n">{pending.length}</span>
            <Btn
              kind="ghost"
              size="xs"
              onClick={() => router.push(`${basePath}/reservations?filter=pending`)}
            >
              Tout voir
              <Icon name="arrowRight" className="ico-xs" />
            </Btn>
          </div>
          {pending.length ? (
            pending
              .slice(0, 4)
              .map((b) => (
                <BookingRow
                  key={b.id}
                  b={b}
                  compact
                  showHost={isAdmin}
                  working={working === b.id}
                  typeColor={colorOfType(b)}
                  onConfirm={(x) => void quick(x, "confirm")}
                  onDecline={(x) => void quick(x, "decline")}
                  onSel={() => router.push(`${basePath}/reservations?filter=pending`)}
                />
              ))
          ) : (
            <div style={{ padding: 28 }}>
              <div className="rv-empty">Aucune demande en attente.</div>
            </div>
          )}
        </div>

        <div className="rv-list">
          <div className="rv-list-hd">
            <Icon name="calCheck" className="ico-sm" style={{ color: "var(--ok)" }} />
            <h3>Aujourd&apos;hui &amp; demain</h3>
            <span className="n">{soon.length}</span>
            <Btn kind="ghost" size="xs" onClick={() => router.push(`${basePath}/reservations`)}>
              Tout voir
              <Icon name="arrowRight" className="ico-xs" />
            </Btn>
          </div>
          {soon.length ? (
            soon.map((b) => (
              <BookingRow
                key={b.id}
                b={b}
                compact
                showHost={isAdmin}
                typeColor={colorOfType(b)}
                onSel={() => router.push(`${basePath}/reservations`)}
              />
            ))
          ) : (
            <div style={{ padding: 28 }}>
              <div className="rv-empty">Rien de prévu aujourd&apos;hui ni demain.</div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <Blk title="D'où viennent les réservations" ic="target">
          {bySrc.length ? (
            <Stack gap={9}>
              {bySrc.map((s) => (
                <div key={s.k}>
                  <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{s.k}</span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                    >
                      {s.n} %
                    </span>
                  </Row>
                  <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 999 }}>
                    <i
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${s.n}%`,
                        background: s.c,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </Stack>
          ) : (
            <div className="rv-empty">Pas encore de réservation.</div>
          )}
        </Blk>

        {isAdmin ? (
          <Blk
            title="Charge de l'équipe"
            ic="users"
            right={
              <Btn kind="ghost" size="xs" onClick={() => router.push(`${basePath}/equipe`)}>
                Équipe
                <Icon name="arrowRight" className="ico-xs" />
              </Btn>
            }
          >
            {team.length ? (
              <Stack gap={9}>
                {team.slice(0, 5).map((m) => {
                  const cap = Math.max(4, ...team.map((x) => x.upcoming));
                  const ratio = cap ? m.upcoming / cap : 0;
                  return (
                    <Row key={m.user_id} style={{ gap: 10 }}>
                      <Av name={m.name} size={24} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Row style={{ justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10.5,
                              color: "var(--text-3)",
                            }}
                          >
                            {m.upcoming} à venir
                          </span>
                        </Row>
                        <div
                          style={{
                            height: 4,
                            background: "var(--bg-3)",
                            borderRadius: 999,
                            marginTop: 4,
                          }}
                        >
                          <i
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${ratio * 100}%`,
                              background: ratio > 0.85 ? "var(--warn)" : rvColorOfHost(m.name),
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    </Row>
                  );
                })}
              </Stack>
            ) : (
              <div className="rv-empty">Aucun hôte actif.</div>
            )}
          </Blk>
        ) : null}
      </div>
    </>
  );
}
