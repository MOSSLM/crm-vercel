"use client";

/**
 * Panneau « Proposer un RDV » du cockpit d'appel — portage de `RdvPanel`
 * (rdv-cockpit.jsx) : bascule Réserver / Envoyer un lien, pastilles de jours
 * avec nombre de créneaux libres, grille d'heures, bloc de confirmation.
 *
 * Branché sur les vraies disponibilités de l'hôte et la création de
 * réservation côté staff (source « agent »).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { fetchEventTypes, fetchSchedulingPage } from "@/lib/scheduling/client";
import type { Booking, EventType } from "@/lib/scheduling/types";
import { Btn, Field, RV_LOC, Row, Seg, Stack, addMin, fmtDur } from "./rdv/atoms";
import { Icon } from "./rdv/Icon";
import { getAppUrlClient } from "./rdv/shared";
import "./rdv-skin.css";
import "./rdv-embed.css";

/** Jours affichés d'un coup dans la barre de pastilles (une semaine). */
const DAY_COUNT = 7;
/**
 * Semaines chargées en une fois. On charge plusieurs semaines d'avance pour que
 * la navigation soit instantanée (et que les compteurs « X libres » soient déjà
 * là), puis on étend au besoin — l'API accepte une fenêtre de 62 jours max.
 */
const WEEKS_PER_FETCH = 4;
const MAX_WEEKS_AHEAD = 8;

/** Minuit du jour J + `days`, en heure locale. */
const dayStart = (days: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const dateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
/** « mar. 12 août » — date complète du créneau retenu. */
const slotLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );

export interface BookingLinkPanelProps {
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
  contactId?: string | null;
  callId?: string | null;
  /** Libellé du rattachement affiché en sous-titre (ex. nom de l'opportunité). */
  contextLabel?: string | null;
}

export default function BookingLinkPanel({
  prospectName,
  prospectEmail,
  prospectPhone,
  entrepriseId,
  opportuniteId,
  contactId,
  callId,
  contextLabel,
}: BookingLinkPanelProps) {
  const [mode, setMode] = useState("book");
  const [types, setTypes] = useState<EventType[]>([]);
  const [tid, setTid] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [hostName, setHostName] = useState("");
  const [loading, setLoading] = useState(true);

  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  /** Semaine affichée (0 = celle en cours), et semaines déjà chargées. */
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeksLoaded, setWeeksLoaded] = useState(WEEKS_PER_FETCH);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState(prospectName ?? "");
  const [email, setEmail] = useState(prospectEmail ?? "");
  const [phone, setPhone] = useState(prospectPhone ?? "");
  const [sending, setSending] = useState(false);
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<Booking | null>(null);

  useEffect(() => setName(prospectName ?? ""), [prospectName]);
  useEffect(() => setEmail(prospectEmail ?? ""), [prospectEmail]);
  useEffect(() => setPhone(prospectPhone ?? ""), [prospectPhone]);

  const type = types.find((t) => t.id === tid) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const [page, tps] = await Promise.all([fetchSchedulingPage(), fetchEventTypes()]);
        setUsername(page.page.username);
        setHostName(page.page.display_name);
        const active = tps.event_types.filter((t) => t.is_active);
        setTypes(active);
        setTid(active[0]?.id ?? "");
      } catch {
        /* panneau non bloquant */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fenêtre glissante de 7 jours, décalée d'une semaine à chaque « suivant » :
  // un prospect indisponible cette semaine se cale sur la suivante sans quitter
  // le cockpit.
  const days = useMemo(
    () =>
      Array.from({ length: DAY_COUNT }, (_, i) => {
        const offset = weekOffset * DAY_COUNT + i;
        const d = dayStart(offset);
        return {
          key: dateKey(d),
          lb:
            offset === 0
              ? "Auj."
              : new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d).replace(".", ""),
          n: d.getDate(),
          month: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).replace(".", ""),
        };
      }),
    [weekOffset],
  );

  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return "Cette semaine";
    const first = dayStart(weekOffset * DAY_COUNT);
    const last = dayStart(weekOffset * DAY_COUNT + DAY_COUNT - 1);
    const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
    return `${fmt.format(first)} – ${fmt.format(last)}`;
  }, [weekOffset]);

  const loadSlots = useCallback(async () => {
    if (!tid) return;
    setLoadingSlots(true);
    try {
      const from = dayStart(0);
      const to = dayStart(weeksLoaded * DAY_COUNT);
      const res = await authedFetch(
        `/api/scheduling/event-types/${tid}/slots?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { slots: string[] };
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [tid, weeksLoaded]);

  useEffect(() => {
    setSlot(null);
    void loadSlots();
  }, [loadSlots]);

  // Changer de type d'évènement remet la navigation à cette semaine : les
  // disponibilités affichées ne sont plus celles qu'on parcourait.
  useEffect(() => {
    setWeekOffset(0);
    setWeeksLoaded(WEEKS_PER_FETCH);
  }, [tid]);

  /** Avance/recule d'une semaine, en chargeant plus loin quand on sort du lot. */
  const shiftWeek = (delta: number) => {
    const next = Math.min(Math.max(weekOffset + delta, 0), MAX_WEEKS_AHEAD - 1);
    if (next === weekOffset) return;
    setWeekOffset(next);
    setDayIdx(0);
    if (next >= weeksLoaded) {
      setWeeksLoaded(Math.min(next + WEEKS_PER_FETCH, MAX_WEEKS_AHEAD));
    }
  };

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const iso of slots) {
      const k = dateKey(new Date(iso));
      const arr = m.get(k);
      if (arr) arr.push(iso);
      else m.set(k, [iso]);
    }
    return m;
  }, [slots]);

  const currentDay = days[dayIdx];
  const daySlots = currentDay ? byDay.get(currentDay.key) ?? [] : [];

  const link = useMemo(() => {
    if (!username || !type) return null;
    const url = new URL(`${getAppUrlClient()}/rdv/${username}/${type.slug}`);
    if (name.trim()) url.searchParams.set("name", name.trim());
    if (email.trim()) url.searchParams.set("email", email.trim());
    return url.toString();
  }, [username, type, name, email]);

  const phoneRequired = type?.location_type === "phone";
  const canBook =
    !!slot &&
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email) &&
    (!phoneRequired || phone.trim().length > 0);

  const book = async () => {
    if (!canBook || !slot || booking) return;
    setBooking(true);
    try {
      const res = await authedFetch("/api/scheduling/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type_id: tid,
          start: slot,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          call_id: callId ?? null,
          opportunite_id: opportuniteId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; booking?: Booking };
      if (!res.ok || !data.booking) {
        if (data.error === "slot_taken" || data.error === "slot_unavailable") {
          toast.error("Ce créneau vient d'être pris — liste rafraîchie.");
          setSlot(null);
          void loadSlots();
        } else {
          toast.error("Réservation impossible", { description: data.error });
        }
        return;
      }
      setDone(data.booking);
      toast.success(`RDV confirmé — invitation envoyée à ${data.booking.invitee_email}`);
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setBooking(false);
    }
  };

  const sendLink = async () => {
    if (!link || !/.+@.+\..+/.test(email) || sending) return;
    setSending(true);
    try {
      const firstName = (name ?? "").trim().split(/\s+/)[0] || null;
      const bodyHtml =
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.6;">` +
        `<p style="margin:0 0 16px 0;">Bonjour${firstName ? ` ${firstName}` : ""},</p>` +
        `<p style="margin:0 0 16px 0;">Comme convenu, voici le lien pour réserver directement un créneau` +
        (type ? ` pour « ${type.title} »` : "") +
        ` :</p>` +
        `<p style="margin:0 0 16px 0;"><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2F7AE0;color:#ffffff;border-radius:8px;text-decoration:none;">Choisir mon créneau</a></p>` +
        `<p style="margin:0;">À très vite,<br>${hostName}</p></div>`;

      const res = await authedFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: email.trim(),
          to_name: name || undefined,
          subject: `Réservez votre créneau${type ? ` — ${type.title}` : ""}`,
          body_html: bodyHtml,
          body_text: `Bonjour${firstName ? ` ${firstName}` : ""},\n\nVoici le lien pour réserver un créneau : ${link}\n\nÀ très vite,\n${hostName}`,
          type: "scheduling_link",
          entreprise_id: entrepriseId ?? undefined,
          opportunite_id: opportuniteId ?? undefined,
          contact_id: contactId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`Lien envoyé à ${email.trim()}`);
    } catch {
      toast.error("Envoi impossible (Resend configuré ?)");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rv-scope">
        <div className="rv-panel">
          <div className="pb">
            <div className="rv-empty">Chargement…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!username || types.length === 0) {
    return (
      <div className="rv-scope">
        <div className="rv-panel">
          <div className="pb">
            <div className="rv-empty">
              Créez un type de rendez-vous dans Cal.SAMA pour proposer un créneau pendant
              l&apos;appel.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rv-scope">
      <div className="rv-panel">
        <div className="ph">
          <span className="ic">
            <Icon name="calPlus" className="ico-sm" />
          </span>
          <div className="t">
            Proposer un RDV
            {contextLabel ? <div className="s">lié à {contextLabel}</div> : null}
          </div>
        </div>

        <div className="pb">
          <Seg
            opts={[
              { id: "book", lb: "Réserver", ic: "calPlus" },
              { id: "link", lb: "Envoyer un lien", ic: "link" },
            ]}
            val={mode}
            set={(v) => setMode(v)}
            accent
          />

          {mode === "book" ? (
            done ? (
              <div className="rv-confirm">
                <div className="rc">
                  <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
                  <b>Rendez-vous confirmé</b>
                </div>
                <div className="sub">
                  {done.invitee_name} · {hhmm(done.start_at)}
                  <br />
                  Invitation envoyée à {done.invitee_email}.
                </div>
                <button
                  type="button"
                  className="go"
                  onClick={() => {
                    setDone(null);
                    setSlot(null);
                    void loadSlots();
                  }}
                >
                  <Icon name="calPlus" className="ico-sm" />
                  Nouveau rendez-vous
                </button>
              </div>
            ) : (
              <>
                <select
                  className="rv-in"
                  value={tid}
                  onChange={(e) => setTid(e.target.value)}
                  aria-label="Type de rendez-vous"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · {fmtDur(t.duration_minutes)}
                    </option>
                  ))}
                </select>

                <div className="rv-weeknav">
                  <button
                    type="button"
                    className="wk"
                    onClick={() => shiftWeek(-1)}
                    disabled={weekOffset === 0}
                    title="Semaine précédente"
                    aria-label="Semaine précédente"
                  >
                    <Icon name="chevleft" className="ico-sm" />
                  </button>
                  <span className="lb">{weekLabel}</span>
                  <button
                    type="button"
                    className="wk"
                    onClick={() => shiftWeek(1)}
                    disabled={weekOffset >= MAX_WEEKS_AHEAD - 1}
                    title="Semaine suivante"
                    aria-label="Semaine suivante"
                  >
                    <Icon name="chevright" className="ico-sm" />
                  </button>
                </div>

                <div className="rv-days">
                  {days.map((d, i) => {
                    const free = byDay.get(d.key)?.length ?? 0;
                    return (
                      <button
                        type="button"
                        key={d.key}
                        className={`rv-dpill ${dayIdx === i ? "on" : ""} ${free === 0 ? "full" : ""}`.trim()}
                        onClick={() => {
                          setDayIdx(i);
                          setSlot(null);
                        }}
                      >
                        <span className="dl">{weekOffset === 0 ? d.lb : `${d.lb} ${d.month}`}</span>
                        <span className="dn">{d.n}</span>
                        <span className="n">{free} libres</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rv-slotgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                  {daySlots.map((iso) => (
                    <button
                      type="button"
                      key={iso}
                      className={`rv-sc ${slot === iso ? "on" : ""}`.trim()}
                      onClick={() => setSlot(iso)}
                    >
                      {hhmm(iso)}
                    </button>
                  ))}
                </div>
                {!loadingSlots && !daySlots.length ? (
                  <div className="rv-empty">
                    Aucun créneau libre ce jour-là — essayez un autre jour ou la semaine suivante.
                  </div>
                ) : null}

                <Field label="Coordonnées du prospect">
                  <Stack gap={6}>
                    <input
                      className="rv-in"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nom complet *"
                    />
                    <input
                      className="rv-in"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@prospect.fr *"
                    />
                    <input
                      className="rv-in"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={phoneRequired ? "Téléphone *" : "Téléphone"}
                    />
                  </Stack>
                </Field>

                {slot && type ? (
                  <div className="rv-confirm">
                    <div className="rc">
                      <Icon name="calCheck" className="ico-sm" style={{ color: "var(--accent)" }} />
                      {/* Le libellé suit le créneau, pas la pastille affichée :
                          on peut réserver mardi prochain et continuer à
                          feuilleter les semaines sans que la confirmation mente. */}
                      <b>
                        {slotLabel(slot)} · {hhmm(slot)}–{addMin(hhmm(slot), type.duration_minutes)}
                      </b>
                    </div>
                    <div className="sub">
                      {type.title} · {(RV_LOC[type.location_type] ?? RV_LOC.custom).lb}
                      <br />
                      Email de confirmation + invitation .ics
                      {email.trim() ? ` à ${email.trim()}` : ""}.
                    </div>
                    <button
                      type="button"
                      className="go"
                      disabled={!canBook || booking}
                      onClick={() => void book()}
                    >
                      <Icon name="send" className="ico-sm" />
                      {booking ? "Confirmation…" : "Confirmer et envoyer l'invitation"}
                    </button>
                  </div>
                ) : (
                  <div
                    className="rv-confirm"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-3)",
                      border: "1px dashed var(--border-2)",
                    }}
                  >
                    <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                      Choisissez un créneau : les heures affichées sont vos vraies disponibilités,
                      occupé Google inclus.
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            <Stack gap={9}>
              <select
                className="rv-in"
                value={tid}
                onChange={(e) => setTid(e.target.value)}
                aria-label="Type de rendez-vous"
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {fmtDur(t.duration_minutes)}
                  </option>
                ))}
              </select>

              <Field label="Email du prospect">
                <Row style={{ gap: 6 }}>
                  <input
                    className="rv-in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@prospect.fr"
                  />
                  <Btn
                    kind="accent"
                    ic="send"
                    disabled={sending || !/.+@.+\..+/.test(email)}
                    onClick={() => void sendLink()}
                  >
                    Envoyer
                  </Btn>
                </Row>
              </Field>

              {link ? (
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--text-2)",
                    wordBreak: "break-all",
                    lineHeight: 1.5,
                  }}
                >
                  {link.replace(/^https?:\/\//, "")}
                </div>
              ) : null}

              <Btn
                kind="outline"
                ic="copy"
                style={{ justifyContent: "center" }}
                onClick={() => {
                  if (!link) return;
                  void navigator.clipboard.writeText(link);
                  toast.success("Lien prérempli copié");
                }}
              >
                Copier le lien prérempli
              </Btn>

              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>
                À utiliser quand le prospect veut « voir ça plus tard » : le lien est prérempli, il
                ne choisit que son créneau.
              </div>
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
}
