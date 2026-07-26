"use client";

/**
 * Widget public de réservation — portage de `BookingWidget`
 * (rdv-public.jsx) : panneau latéral d'infos, fil d'étapes, mini-calendrier
 * mensuel + créneaux, formulaire, écran de confirmation.
 *
 * Branché sur nos vraies API publiques (créneaux réels, création de
 * réservation avec verrou anti double-booking, reprogrammation par token).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Field, RV_LOC, Row, addMin, fmtDur, rvInit } from "./rdv/atoms";
import { Icon } from "./rdv/Icon";
import { googleCalendarUrl, outlookCalendarUrl } from "./calendar-links";
import "./rdv-skin.css";
import "./rdv-embed.css";

const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

type PublicPage = {
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  brand_color: string;
  timezone: string;
};

type PublicQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "phone";
  required: boolean;
  options?: string[];
};

type PublicEventType = {
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  requires_confirmation: boolean;
  custom_questions: PublicQuestion[];
  color: string | null;
  price_cents: number | null;
  currency: string;
  success_redirect_url: string | null;
};

const pad = (n: number) => `${n}`.padStart(2, "0");

const dateKeyInTz = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

const timeInTz = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

const detectTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
};

const tzList = (): string[] => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (sv) return sv("timeZone");
  } catch {
    /* fallback ci-dessous */
  }
  return [
    "Europe/Paris", "Europe/Brussels", "Europe/London", "Africa/Casablanca",
    "America/Montreal", "America/New_York", "UTC",
  ];
};

export interface BookingWidgetProps {
  page: PublicPage;
  eventType: PublicEventType;
  embed?: boolean;
  wide?: boolean;
  prefill?: { name?: string; email?: string; phone?: string; tz?: string };
  rescheduleToken?: string;
  onBack?: () => void;
}

export default function BookingWidget({
  page,
  eventType,
  embed = false,
  wide,
  prefill,
  rescheduleToken,
  onBack,
}: BookingWidgetProps) {
  const t = eventType;
  const loc = RV_LOC[t.location_type] ?? RV_LOC.custom;
  const now = useMemo(() => new Date(), []);

  const [step, setStep] = useState(0);
  const [tz, setTz] = useState(prefill?.tz || detectTz());
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ manage_token?: string; meeting_url?: string | null; pending?: boolean } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  // Mode embed : hauteur transmise au parent (voir embed.js).
  useEffect(() => {
    if (!embed || typeof window === "undefined") return;
    const post = () =>
      window.parent?.postMessage(
        { type: "sama-rdv:height", height: document.documentElement.scrollHeight },
        "*",
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    try {
      const from = new Date(Date.UTC(cursor.y, cursor.m, 1) - 86400000);
      const to = new Date(Date.UTC(cursor.y, cursor.m + 1, 1) + 86400000);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (rescheduleToken) params.set("exclude_token", rescheduleToken);
      const res = await fetch(
        `/api/public/scheduling/${encodeURIComponent(page.username)}/${encodeURIComponent(
          t.slug,
        )}/slots?${params.toString()}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { slots: string[] };
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [cursor, page.username, t.slug, rescheduleToken]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const k = dateKeyInTz(iso, tz);
      const arr = map.get(k);
      if (arr) arr.push(iso);
      else map.set(k, [iso]);
    }
    return map;
  }, [slots, tz]);

  // Sélection automatique du premier jour disponible du mois affiché.
  useEffect(() => {
    if (day && byDay.has(day)) return;
    const first = [...byDay.keys()].sort()[0] ?? null;
    setDay(first);
    setSlot(null);
  }, [byDay, day]);

  const cells = useMemo(() => {
    const firstDow = (new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay() + 6) % 7;
    const nDays = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: firstDow }, () => null);
    for (let d = 1; d <= nDays; d++) out.push(`${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`);
    return out;
  }, [cursor]);

  const isCurrentMonth = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const goMonth = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const dayLabelFull = (key: string): string => {
    const [y, m, d] = key.split("-").map(Number);
    const s = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const daySlots = day ? byDay.get(day) ?? [] : [];
  const phoneRequired = t.location_type === "phone";

  const canSubmit =
    !!slot &&
    (rescheduleToken
      ? true
      : name.trim().length > 0 &&
        /.+@.+\..+/.test(email) &&
        (!phoneRequired || phone.trim().length > 0) &&
        t.custom_questions.every(
          (q) =>
            !q.required ||
            (q.type === "checkbox" ? answers[q.id] === "Oui" : (answers[q.id] ?? "").trim()),
        ));

  const submit = async () => {
    if (!slot || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = rescheduleToken
        ? await fetch(
            `/api/public/scheduling/manage/${encodeURIComponent(rescheduleToken)}/reschedule`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ start: slot, timezone: tz }),
            },
          )
        : await fetch(`/api/public/scheduling/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: page.username,
              event_slug: t.slug,
              start: slot,
              timezone: tz,
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || null,
              notes: notes.trim() || null,
              answers: t.custom_questions.map((q) => ({ id: q.id, value: answers[q.id] ?? "" })),
              guests: guests
                .split(/[,;\s]+/)
                .map((g) => g.trim().toLowerCase())
                .filter((g) => /.+@.+\..+/.test(g))
                .slice(0, 5),
              source: embed ? "embed" : "public",
            }),
          });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        booking?: { manage_token?: string; meeting_url?: string | null };
        requires_confirmation?: boolean;
        success_redirect_url?: string | null;
      };

      if (!res.ok) {
        if (data.error === "slot_taken" || data.error === "slot_unavailable") {
          setError("Ce créneau vient d'être réservé. Choisissez-en un autre.");
          setStep(0);
          setSlot(null);
          void loadSlots();
        } else {
          setError("La réservation a échoué. Vérifiez vos informations et réessayez.");
        }
        return;
      }

      const redirect = data.success_redirect_url || t.success_redirect_url;
      if (redirect && !rescheduleToken) {
        try {
          const target = embed && window.top ? window.top : window;
          target.location.href = redirect;
          return;
        } catch {
          /* cross-origin bloqué → confirmation standard */
        }
      }

      setResult({
        manage_token: data.booking?.manage_token,
        meeting_url: data.booking?.meeting_url ?? null,
        pending: data.requires_confirmation,
      });
      setStep(2);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setSlot(null);
    setError(null);
  };

  const steps = ["Créneau", "Vos informations", rescheduleToken ? "Reprogrammé" : "Confirmé"];
  const endIso = slot
    ? new Date(Date.parse(slot) + t.duration_minutes * 60000).toISOString()
    : null;

  return (
    <div ref={rootRef} className={`rv-book ${wide ? "wide" : ""}`.trim()}>
      <aside className="rv-bk-side">
        <div className="host">
          <span className="av" style={{ background: page.brand_color }}>
            {rvInit(page.display_name)}
          </span>
          <div>
            <div className="n">{page.display_name}</div>
            <div className="o">Sama Digital Studio</div>
          </div>
        </div>
        <h2>{t.title}</h2>
        {t.description ? <p className="desc">{t.description}</p> : null}
        <div className="facts">
          <div className="fact">
            <Icon name="clock" className="ico-sm" />
            <div>{fmtDur(t.duration_minutes)}</div>
          </div>
          <div className="fact">
            <Icon name={loc.ic} className="ico-sm" />
            <div>
              {loc.lb}
              {t.location_type === "google_meet" && (
                <div className="s">Lien envoyé à la confirmation</div>
              )}
            </div>
          </div>
          <div className="fact">
            <Icon name="globe" className="ico-sm" />
            <div>
              {tz.replace("_", " ")}
              <div className="s">Heures affichées dans votre fuseau</div>
            </div>
          </div>
          {t.price_cents ? (
            <div className="fact">
              <Icon name="euro" className="ico-sm" />
              <div>
                {(t.price_cents / 100).toLocaleString("fr-FR", {
                  style: "currency",
                  currency: t.currency || "EUR",
                })}
              </div>
            </div>
          ) : null}
          {t.requires_confirmation && (
            <div className="fact">
              <Icon name="hourglass" className="ico-sm" />
              <div>
                Demande à valider
                <div className="s">Vous recevez la réponse par email</div>
              </div>
            </div>
          )}
        </div>
        <div className="ft">
          <Icon name="calCheck" className="ico-xs" />
          Cal.SAMA
        </div>
      </aside>

      <div className="rv-bk-main">
        <div className="rv-bk-steps">
          {steps.map((s, i) => (
            <div key={s} style={{ display: "contents" }}>
              {i > 0 && <span className="ln" />}
              <span className={`st ${i === step ? "on" : ""} ${i < step ? "done" : ""}`}>
                <span className="n">{i < step ? <Icon name="check" className="ico-xs" /> : i + 1}</span>
                {s}
              </span>
            </div>
          ))}
        </div>

        {error ? (
          <div
            style={{
              margin: "0 0 12px",
              padding: "9px 12px",
              borderRadius: 9,
              background: "var(--danger-tint)",
              color: "var(--danger)",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        ) : null}

        {step === 0 && (
          <div className="rv-pick">
            <div>
              <div className="rv-cal-hd">
                <span className="m">
                  {MONTHS[cursor.m]} {cursor.y}
                </span>
                <button
                  type="button"
                  className="rv-nav"
                  onClick={() => goMonth(-1)}
                  disabled={isCurrentMonth}
                  aria-label="Mois précédent"
                >
                  <Icon name="chevleft" className="ico-sm" />
                </button>
                <button
                  type="button"
                  className="rv-nav"
                  onClick={() => goMonth(1)}
                  aria-label="Mois suivant"
                >
                  <Icon name="chevright" className="ico-sm" />
                </button>
              </div>

              <div className="rv-mini">
                {WD.map((w, i) => (
                  <div key={`${w}${i}`} className="dw">
                    {w[0]}
                  </div>
                ))}
                {cells.map((key, i) => {
                  if (!key) return <div key={`e${i}`} className="dd" />;
                  const free = (byDay.get(key)?.length ?? 0) > 0;
                  const d = Number(key.split("-")[2]);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`dd ${free ? "free" : "off"} ${day === key && free ? "sel" : ""}`.trim()}
                      onClick={() => {
                        if (free) {
                          setDay(key);
                          setSlot(null);
                        }
                      }}
                      disabled={!free}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              <div className="rv-tz">
                <Icon name="globe" className="ico-sm" style={{ color: "var(--text-4)" }} />
                <select value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Fuseau horaire">
                  {tzList().map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rv-slots">
              <div className="h">
                <span className="d">{day ? dayLabelFull(day) : "—"}</span>
                <span className="n">
                  {loadingSlots ? "chargement…" : `${daySlots.length} créneaux`}
                </span>
              </div>
              <div className="sc">
                {daySlots.map((iso) =>
                  slot === iso ? (
                    <div key={iso} className="rv-slot-pair">
                      <span className="rv-slot sel">{timeInTz(iso, tz)}</span>
                      <button type="button" className="go" onClick={() => setStep(1)}>
                        Suivant
                        <Icon name="chevright" className="ico-xs" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      key={iso}
                      className="rv-slot"
                      onClick={() => setSlot(iso)}
                    >
                      {timeInTz(iso, tz)}
                    </button>
                  ),
                )}
                {!loadingSlots && !daySlots.length ? (
                  <div className="rv-empty">Aucun créneau disponible ce jour-là.</div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {step === 1 && slot && (
          <div className="rv-form">
            <div className="rv-recap">
              <Icon name="calCheck" className="ico-sm" style={{ color: "var(--accent)" }} />
              <div>
                <b>
                  {dayLabelFull(dateKeyInTz(slot, tz))} · {timeInTz(slot, tz)}–
                  {addMin(timeInTz(slot, tz), t.duration_minutes)}
                </b>
                <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2 }}>
                  {t.title} · {fmtDur(t.duration_minutes)} · {loc.lb}
                </div>
              </div>
              <button type="button" className="btn ghost xs" style={{ marginLeft: "auto" }} onClick={reset}>
                Modifier
              </button>
            </div>

            {rescheduleToken ? (
              <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                Confirmez pour déplacer votre rendez-vous sur ce créneau. Vous recevrez un email de
                mise à jour.
              </div>
            ) : (
              <>
                <div className="rv-grid2">
                  <Field label="Nom complet *">
                    <input
                      className="rv-in"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Karim Belhadj"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Email *">
                    <input
                      className="rv-in"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@entreprise.fr"
                      autoComplete="email"
                    />
                  </Field>
                </div>

                <Field label={phoneRequired ? "Téléphone *" : "Téléphone"}>
                  <input
                    className="rv-in"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="06 12 34 56 78"
                    autoComplete="tel"
                  />
                </Field>

                {t.custom_questions.map((q) => (
                  <Field key={q.id} label={q.label + (q.required ? " *" : "")}>
                    {q.type === "textarea" ? (
                      <textarea
                        className="rv-in"
                        rows={2}
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    ) : q.type === "select" ? (
                      <select
                        className="rv-in"
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      >
                        <option value="">— Choisir —</option>
                        {(q.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : q.type === "checkbox" ? (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                        <input
                          type="checkbox"
                          checked={answers[q.id] === "Oui"}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [q.id]: e.target.checked ? "Oui" : "" }))
                          }
                        />
                        {q.label}
                      </label>
                    ) : (
                      <input
                        className="rv-in"
                        type={q.type === "phone" ? "tel" : "text"}
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    )}
                  </Field>
                ))}

                <Field label="Précisions (optionnel)">
                  <textarea
                    className="rv-in"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contexte, sujets à aborder…"
                  />
                </Field>

                <Field label="Ajouter des invités">
                  <input
                    className="rv-in"
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    placeholder="email1@ex.fr, email2@ex.fr"
                  />
                </Field>
              </>
            )}

            <Row style={{ marginTop: 2 }}>
              <Btn kind="ghost" onClick={reset} ic="chevleft">
                Retour
              </Btn>
              <span style={{ flex: 1 }} />
              <Btn
                kind="accent"
                size=""
                ic="check"
                disabled={!canSubmit || submitting}
                onClick={() => void submit()}
              >
                {submitting
                  ? "Envoi…"
                  : rescheduleToken
                    ? "Confirmer le nouveau créneau"
                    : t.requires_confirmation
                      ? "Envoyer la demande"
                      : "Confirmer le rendez-vous"}
              </Btn>
            </Row>

            <div style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.5 }}>
              En confirmant, vous recevez un email avec l&apos;invitation agenda (.ics)
              {t.location_type === "google_meet" ? " et le lien Google Meet" : ""}. Annulation ou
              report possibles à tout moment depuis cet email.
            </div>
          </div>
        )}

        {step === 2 && slot && endIso && (
          <div className="rv-done">
            <span className="ok">
              <Icon name={result?.pending ? "hourglass" : "check"} className="ico-xl" />
            </span>
            <h3>
              {result?.pending
                ? "Demande envoyée"
                : rescheduleToken
                  ? "Rendez-vous déplacé"
                  : "C'est confirmé"}
            </h3>
            <p className="s">
              {result?.pending
                ? `${page.display_name} valide votre créneau et vous recevez la confirmation par email.`
                : `Un email de confirmation vient de partir avec l'invitation agenda${
                    t.location_type === "google_meet" ? " et le lien de visio" : ""
                  }.`}
            </p>

            <div className="card">
              <div className="r">
                <span className="k">Quand</span>
                <span>
                  <b style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {dayLabelFull(dateKeyInTz(slot, tz))} · {timeInTz(slot, tz)}–
                    {addMin(timeInTz(slot, tz), t.duration_minutes)}
                  </b>
                  <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{tz.replace("_", " ")}</div>
                </span>
              </div>
              <div className="r">
                <span className="k">Avec</span>
                <span>{page.display_name} · Sama Digital Studio</span>
              </div>
              <div className="r">
                <span className="k">Où</span>
                <span>
                  {loc.lb}
                  {result?.meeting_url ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--info)" }}>
                      {result.meeting_url.replace(/^https?:\/\//, "")}
                    </div>
                  ) : null}
                </span>
              </div>
            </div>

            {!result?.pending ? (
              <div className="adds">
                <a
                  className="btn outline sm"
                  target="_blank"
                  rel="noreferrer"
                  href={googleCalendarUrl({
                    title: `${t.title} avec ${page.display_name}`,
                    startIso: slot,
                    endIso,
                    details: result?.meeting_url ? `Visio : ${result.meeting_url}` : undefined,
                    location: result?.meeting_url ?? undefined,
                  })}
                >
                  <Icon name="google" className="ico-sm" />
                  Google Agenda
                </a>
                <a
                  className="btn outline sm"
                  target="_blank"
                  rel="noreferrer"
                  href={outlookCalendarUrl({
                    title: `${t.title} avec ${page.display_name}`,
                    startIso: slot,
                    endIso,
                    details: result?.meeting_url ? `Visio : ${result.meeting_url}` : undefined,
                    location: result?.meeting_url ?? undefined,
                  })}
                >
                  <Icon name="microsoft" className="ico-sm" />
                  Outlook
                </a>
              </div>
            ) : null}

            {result?.manage_token ? (
              <a className="btn ghost sm" style={{ marginTop: 12 }} href={`/rdv/gerer/${result.manage_token}`}>
                <Icon name="repeat" className="ico-sm" />
                Reprogrammer / annuler
              </a>
            ) : null}

            {onBack ? (
              <button type="button" className="btn ghost sm" style={{ marginTop: 4 }} onClick={onBack}>
                <Icon name="chevleft" className="ico-sm" />
                Tous les rendez-vous de {page.display_name.split(" ")[0]}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
