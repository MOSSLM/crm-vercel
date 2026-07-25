"use client";

/**
 * Widget public de réservation (parcours invité, sans compte) :
 *   1. calendrier mensuel + créneaux du jour (fuseau au choix, détecté)
 *   2. formulaire (nom, email, questions custom, invités en copie)
 *   3. confirmation (ou « demande envoyée » si validation manuelle)
 *
 * Fonctionne aussi en mode embed (?embed=1) : chrome allégé + hauteur
 * auto-transmise au parent via postMessage (voir embed.js).
 *
 * Les créneaux sont des instants UTC servis par l'API ; seule la PRÉSENTATION
 * change avec le fuseau sélectionné — zéro décalage au changement d'heure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe2,
  Loader2,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { googleCalendarUrl, outlookCalendarUrl } from "./calendar-links";

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

const LOCATION_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  phone: "Appel téléphonique",
  in_person: "En présentiel",
  custom: "À définir",
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const pad = (n: number) => `${n}`.padStart(2, "0");

/** Clé 'yyyy-MM-dd' d'un instant vu dans un fuseau (Intl, comme le serveur). */
const dateKeyInTz = (iso: string, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts; // en-CA → format YYYY-MM-DD
};

const timeInTz = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

const dateLongFr = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const detectTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
};

const allTimezones = (): string[] => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (sv) return sv("timeZone");
  } catch {
    // fallback ci-dessous
  }
  return [
    "Europe/Paris", "Europe/London", "Europe/Brussels", "Europe/Zurich", "Europe/Madrid",
    "Europe/Berlin", "Europe/Rome", "Europe/Lisbon", "Africa/Casablanca", "Africa/Dakar",
    "Africa/Abidjan", "Africa/Tunis", "Africa/Algiers", "America/New_York", "America/Chicago",
    "America/Denver", "America/Los_Angeles", "America/Montreal", "America/Sao_Paulo",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
    "Australia/Sydney", "Pacific/Auckland", "UTC",
  ];
};

const durationLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
};

export interface BookingWidgetProps {
  page: PublicPage;
  eventType: PublicEventType;
  embed?: boolean;
  prefill?: { name?: string; email?: string; phone?: string; tz?: string };
  /** Reprogrammation : token du booking à déplacer (change l'appel final). */
  rescheduleToken?: string;
}

type Step = "slot" | "form" | "done";

export default function BookingWidget({
  page,
  eventType,
  embed = false,
  prefill,
  rescheduleToken,
}: BookingWidgetProps) {
  const brand = eventType.color || page.brand_color || "#2A6FDB";
  const now = useMemo(() => new Date(), []);

  const [tz, setTz] = useState<string>(prefill?.tz || detectTz());
  const [monthCursor, setMonthCursor] = useState<{ year: number; month: number }>(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("slot");

  // Formulaire
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  const [showGuests, setShowGuests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    manage_token?: string;
    requires_confirmation?: boolean;
    meeting_url?: string | null;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  // ---- Embed : hauteur auto vers le parent -------------------------------
  useEffect(() => {
    if (!embed || typeof window === "undefined") return;
    const post = () => {
      const height = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: "sama-rdv:height", height }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [embed]);

  // ---- Chargement des créneaux du mois affiché ---------------------------
  const fetchSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const { year, month } = monthCursor;
      const from = new Date(Date.UTC(year, month, 1) - 24 * 3600 * 1000);
      const to = new Date(Date.UTC(year, month + 1, 1) + 24 * 3600 * 1000);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (rescheduleToken) params.set("exclude_token", rescheduleToken);
      const res = await fetch(
        `/api/public/scheduling/${encodeURIComponent(page.username)}/${encodeURIComponent(
          eventType.slug,
        )}/slots?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { slots: string[] };
      setSlots(data.slots ?? []);
    } catch {
      setSlotsError("Impossible de charger les disponibilités. Réessayez.");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [monthCursor, page.username, eventType.slug, rescheduleToken]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  // ---- Groupement par jour dans le fuseau choisi -------------------------
  const slotsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const key = dateKeyInTz(iso, tz);
      const arr = map.get(key);
      if (arr) arr.push(iso);
      else map.set(key, [iso]);
    }
    return map;
  }, [slots, tz]);

  // Jours du mois affiché (grille lun→dim).
  const monthDays = useMemo(() => {
    const { year, month } = monthCursor;
    const first = new Date(Date.UTC(year, month, 1));
    const startIso = (first.getUTCDay() + 6) % 7; // 0 = lundi
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startIso; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = `${MONTHS_FR[monthCursor.month]} ${monthCursor.year}`;
  const isCurrentMonth =
    monthCursor.year === now.getFullYear() && monthCursor.month === now.getMonth();

  const goMonth = (delta: number) => {
    setSelectedDay(null);
    setSelectedSlot(null);
    setMonthCursor(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  };

  // ---- Soumission ---------------------------------------------------------
  const canSubmit =
    !!selectedSlot &&
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email) &&
    (eventType.location_type !== "phone" || phone.trim().length > 0) &&
    eventType.custom_questions.every(
      (q) => !q.required || (q.type === "checkbox" ? answers[q.id] === "Oui" : (answers[q.id] ?? "").trim()),
    );

  const submit = async () => {
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let res: Response;
      if (rescheduleToken) {
        res = await fetch(
          `/api/public/scheduling/manage/${encodeURIComponent(rescheduleToken)}/reschedule`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: selectedSlot, timezone: tz }),
          },
        );
      } else {
        res = await fetch(`/api/public/scheduling/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: page.username,
            event_slug: eventType.slug,
            start: selectedSlot,
            timezone: tz,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            answers: eventType.custom_questions.map((q) => ({
              id: q.id,
              value: answers[q.id] ?? "",
            })),
            guests,
            source: embed ? "embed" : "public",
          }),
        });
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        booking?: { manage_token?: string; meeting_url?: string | null };
        requires_confirmation?: boolean;
        success_redirect_url?: string | null;
      };

      if (!res.ok) {
        if (data.error === "slot_taken" || data.error === "slot_unavailable") {
          setSubmitError(
            "Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez-en un autre.",
          );
          setStep("slot");
          setSelectedSlot(null);
          void fetchSlots();
        } else {
          setSubmitError("La réservation a échoué. Vérifiez vos informations et réessayez.");
        }
        return;
      }

      const redirect = data.success_redirect_url || eventType.success_redirect_url;
      if (redirect && !rescheduleToken) {
        try {
          const target = embed && window.top ? window.top : window;
          target.location.href = redirect;
          return;
        } catch {
          // cross-origin bloqué → confirmation standard
        }
      }

      setResult({
        manage_token: data.booking?.manage_token,
        requires_confirmation: data.requires_confirmation,
        meeting_url: data.booking?.meeting_url ?? null,
      });
      setStep("done");
    } catch {
      setSubmitError("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const daySlots = selectedDay ? slotsByDay.get(selectedDay) ?? [] : [];
  const tzList = useMemo(allTimezones, []);

  const inputCls =
    "w-full rounded-lg border border-[#D8D4C8] bg-white px-3 py-2 text-sm text-[#14120E] " +
    "placeholder:text-[#B4B0A6] focus:outline-none focus:ring-2 focus:ring-offset-0";

  // ------------------------------------------------------------------------
  return (
    <div
      ref={rootRef}
      className={
        embed
          ? "bg-transparent p-1 text-[#14120E]"
          : "min-h-screen bg-[#FBFAF7] px-4 py-8 text-[#14120E]"
      }
    >
      <div
        className={
          "mx-auto w-full overflow-hidden rounded-2xl border bg-white shadow-sm " +
          (step === "form" || step === "done" ? "max-w-xl" : "max-w-3xl")
        }
      >
        <div className="h-1.5 w-full" style={{ backgroundColor: brand }} />

        {step === "done" && result ? (
          <ConfirmationView
            brand={brand}
            page={page}
            eventType={eventType}
            slotIso={selectedSlot!}
            tz={tz}
            requiresConfirmation={!!result.requires_confirmation}
            manageToken={result.manage_token}
            meetingUrl={result.meeting_url}
            isReschedule={!!rescheduleToken}
          />
        ) : (
          <div className={step === "slot" ? "md:flex" : ""}>
            {/* Panneau infos évènement */}
            <div
              className={
                "border-b p-6 " + (step === "slot" ? "md:w-64 md:shrink-0 md:border-b-0 md:border-r" : "")
              }
            >
              <p className="text-sm text-[#8A877F]">{page.display_name}</p>
              <h1 className="mt-1 text-xl font-semibold leading-snug">{eventType.title}</h1>
              <div className="mt-3 space-y-2 text-sm text-[#8A877F]">
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {durationLabel(eventType.duration_minutes)}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {LOCATION_LABELS[eventType.location_type] ?? eventType.location_type}
                </p>
                {eventType.price_cents ? (
                  <p className="font-medium text-[#14120E]">
                    {(eventType.price_cents / 100).toLocaleString("fr-FR", {
                      style: "currency",
                      currency: eventType.currency || "EUR",
                    })}
                  </p>
                ) : null}
                {selectedSlot ? (
                  <p className="flex items-start gap-2 pt-1 font-medium text-[#14120E]">
                    <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {dateLongFr(dateKeyInTz(selectedSlot, tz))}
                      <br />
                      {timeInTz(selectedSlot, tz)} ({tz.replace(/_/g, " ")})
                    </span>
                  </p>
                ) : null}
              </div>
              {step === "slot" && eventType.description ? (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[#8A877F]">
                  {eventType.description}
                </p>
              ) : null}
              {eventType.requires_confirmation ? (
                <p className="mt-4 rounded-lg bg-[#F4F2EC] px-3 py-2 text-xs text-[#8A877F]">
                  Ce rendez-vous est soumis à la validation de l&apos;hôte.
                </p>
              ) : null}
            </div>

            {/* Étape 1 : créneau */}
            {step === "slot" ? (
              <div className="flex-1 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">Choisissez une date</h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => goMonth(-1)}
                      disabled={isCurrentMonth}
                      className="rounded-lg border p-1.5 text-[#8A877F] transition enabled:hover:bg-[#F4F2EC] disabled:opacity-40"
                      aria-label="Mois précédent"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-32 text-center text-sm font-medium capitalize">
                      {monthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => goMonth(1)}
                      className="rounded-lg border p-1.5 text-[#8A877F] transition hover:bg-[#F4F2EC]"
                      aria-label="Mois suivant"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {slotsError ? (
                  <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {slotsError}{" "}
                    <button type="button" className="underline" onClick={() => void fetchSlots()}>
                      Réessayer
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-[#8A877F]">
                  {WEEKDAYS_FR.map((d) => (
                    <div key={d} className="py-1 font-medium">
                      {d}
                    </div>
                  ))}
                  {monthDays.map((key, i) =>
                    key === null ? (
                      <div key={`empty-${i}`} />
                    ) : (
                      <DayCell
                        key={key}
                        dateKey={key}
                        hasSlots={(slotsByDay.get(key)?.length ?? 0) > 0}
                        selected={selectedDay === key}
                        loading={loadingSlots}
                        brand={brand}
                        onSelect={() => {
                          setSelectedDay(key);
                          setSelectedSlot(null);
                        }}
                      />
                    ),
                  )}
                </div>

                {loadingSlots ? (
                  <p className="mt-6 flex items-center gap-2 text-sm text-[#8A877F]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des disponibilités…
                  </p>
                ) : null}

                <div className="mt-5 flex items-center gap-2 text-xs text-[#8A877F]">
                  <Globe2 className="h-4 w-4 shrink-0" />
                  <select
                    value={tz}
                    onChange={(e) => {
                      setTz(e.target.value);
                      setSelectedDay(null);
                      setSelectedSlot(null);
                    }}
                    className="max-w-full rounded-lg border border-[#D8D4C8] bg-white px-2 py-1.5 text-xs"
                    aria-label="Fuseau horaire"
                  >
                    {tzList.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDay ? (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium">{dateLongFr(selectedDay)}</h3>
                    {daySlots.length === 0 ? (
                      <p className="mt-3 text-sm text-[#8A877F]">
                        Aucun créneau disponible ce jour.
                      </p>
                    ) : (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {daySlots.map((iso) => (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(iso);
                              setStep("form");
                            }}
                            className="rounded-lg border px-2 py-2 text-sm font-medium transition hover:text-white"
                            style={{ borderColor: brand, color: brand }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = brand;
                              e.currentTarget.style.color = "#fff";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "";
                              e.currentTarget.style.color = brand;
                            }}
                          >
                            {timeInTz(iso, tz)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Étape 2 : formulaire */}
            {step === "form" && selectedSlot ? (
              <div className="p-6">
                <button
                  type="button"
                  onClick={() => setStep("slot")}
                  className="mb-4 inline-flex items-center gap-1 text-sm text-[#8A877F] hover:text-[#14120E]"
                >
                  <ArrowLeft className="h-4 w-4" /> Changer de créneau
                </button>

                <div className="space-y-4">
                  {rescheduleToken ? null : (
                    <>
                      <div>
                        <label className="mb-1 block text-sm font-medium" htmlFor="rdv-name">
                          Nom complet *
                        </label>
                        <input
                          id="rdv-name"
                          className={inputCls}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jean Dupont"
                          autoComplete="name"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium" htmlFor="rdv-email">
                          Email *
                        </label>
                        <input
                          id="rdv-email"
                          type="email"
                          className={inputCls}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="jean@entreprise.fr"
                          autoComplete="email"
                        />
                      </div>
                      {eventType.location_type === "phone" ? (
                        <div>
                          <label className="mb-1 block text-sm font-medium" htmlFor="rdv-phone">
                            Téléphone * <span className="font-normal text-[#8A877F]">(vous serez appelé à ce numéro)</span>
                          </label>
                          <input
                            id="rdv-phone"
                            type="tel"
                            className={inputCls}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+33 6 12 34 56 78"
                            autoComplete="tel"
                          />
                        </div>
                      ) : null}

                      {eventType.custom_questions.map((q) => (
                        <QuestionField
                          key={q.id}
                          question={q}
                          value={answers[q.id] ?? ""}
                          inputCls={inputCls}
                          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                        />
                      ))}

                      <div>
                        <label className="mb-1 block text-sm font-medium" htmlFor="rdv-notes">
                          Notes <span className="font-normal text-[#8A877F]">(optionnel)</span>
                        </label>
                        <textarea
                          id="rdv-notes"
                          className={inputCls}
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Contexte, sujets à aborder…"
                        />
                      </div>

                      {showGuests ? (
                        <div>
                          <label className="mb-1 block text-sm font-medium" htmlFor="rdv-guest">
                            Invités en copie
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="rdv-guest"
                              type="email"
                              className={inputCls}
                              value={guestDraft}
                              onChange={(e) => setGuestDraft(e.target.value)}
                              placeholder="collegue@entreprise.fr"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = guestDraft.trim().toLowerCase();
                                if (/.+@.+\..+/.test(v) && !guests.includes(v) && guests.length < 5) {
                                  setGuests((g) => [...g, v]);
                                  setGuestDraft("");
                                }
                              }}
                              className="shrink-0 rounded-lg border px-3 text-sm"
                            >
                              Ajouter
                            </button>
                          </div>
                          {guests.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {guests.map((g) => (
                                <span
                                  key={g}
                                  className="inline-flex items-center gap-1 rounded-full bg-[#F4F2EC] px-2.5 py-1 text-xs"
                                >
                                  {g}
                                  <button
                                    type="button"
                                    onClick={() => setGuests((arr) => arr.filter((x) => x !== g))}
                                    aria-label={`Retirer ${g}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowGuests(true)}
                          className="inline-flex items-center gap-1 text-sm text-[#8A877F] hover:text-[#14120E]"
                        >
                          <Plus className="h-4 w-4" /> Ajouter des invités
                        </button>
                      )}
                    </>
                  )}

                  {submitError ? (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                      {submitError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={(!rescheduleToken && !canSubmit) || submitting}
                    onClick={() => void submit()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50"
                    style={{ backgroundColor: brand }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {rescheduleToken
                      ? "Confirmer le nouveau créneau"
                      : eventType.requires_confirmation
                        ? "Envoyer la demande"
                        : "Confirmer le rendez-vous"}
                  </button>
                  <p className="text-center text-xs text-[#B4B0A6]">
                    Vous recevrez un email de confirmation avec l&apos;invitation (.ics) et les
                    liens pour reprogrammer ou annuler.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!embed ? (
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-[#B4B0A6]">
          Propulsé par SAMA Digital Studio
        </p>
      ) : null}
    </div>
  );
}

function DayCell({
  dateKey,
  hasSlots,
  selected,
  loading,
  brand,
  onSelect,
}: {
  dateKey: string;
  hasSlots: boolean;
  selected: boolean;
  loading: boolean;
  brand: string;
  onSelect: () => void;
}) {
  const day = Number(dateKey.split("-")[2]);
  if (!hasSlots) {
    return (
      <div className={"py-2 text-sm " + (loading ? "text-[#D8D4C8]" : "text-[#D8D4C8]")}>{day}</div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition"
      style={
        selected
          ? { backgroundColor: brand, color: "#fff" }
          : { backgroundColor: `${brand}1A`, color: brand }
      }
    >
      {day}
    </button>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  inputCls,
}: {
  question: PublicQuestion;
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
}) {
  const label = (
    <label className="mb-1 block text-sm font-medium" htmlFor={`q-${question.id}`}>
      {question.label} {question.required ? "*" : null}
    </label>
  );
  switch (question.type) {
    case "textarea":
      return (
        <div>
          {label}
          <textarea
            id={`q-${question.id}`}
            className={inputCls}
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "select":
      return (
        <div>
          {label}
          <select
            id={`q-${question.id}`}
            className={inputCls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {(question.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm" htmlFor={`q-${question.id}`}>
          <input
            id={`q-${question.id}`}
            type="checkbox"
            checked={value === "Oui"}
            onChange={(e) => onChange(e.target.checked ? "Oui" : "")}
            className="h-4 w-4 rounded border-[#D8D4C8]"
          />
          <span>
            {question.label} {question.required ? "*" : null}
          </span>
        </label>
      );
    case "phone":
      return (
        <div>
          {label}
          <input
            id={`q-${question.id}`}
            type="tel"
            className={inputCls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="+33 6 12 34 56 78"
          />
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            id={`q-${question.id}`}
            type="text"
            className={inputCls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}

function ConfirmationView({
  brand,
  page,
  eventType,
  slotIso,
  tz,
  requiresConfirmation,
  manageToken,
  meetingUrl,
  isReschedule,
}: {
  brand: string;
  page: PublicPage;
  eventType: PublicEventType;
  slotIso: string;
  tz: string;
  requiresConfirmation: boolean;
  manageToken?: string;
  meetingUrl?: string | null;
  isReschedule: boolean;
}) {
  return (
    <div className="p-8 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: `${brand}1A` }}
      >
        <Check className="h-7 w-7" style={{ color: brand }} />
      </div>
      <h1 className="mt-4 text-xl font-semibold">
        {requiresConfirmation
          ? "Demande envoyée !"
          : isReschedule
            ? "Rendez-vous reprogrammé !"
            : "Rendez-vous confirmé !"}
      </h1>
      <p className="mt-2 text-sm text-[#8A877F]">
        {requiresConfirmation
          ? `${page.display_name} doit valider votre demande — vous recevrez un email dès que c'est fait.`
          : `Un email de confirmation (avec l'invitation .ics) vient de vous être envoyé.`}
      </p>

      <div className="mx-auto mt-6 max-w-sm rounded-xl border bg-[#FBFAF7] p-4 text-left text-sm">
        <p className="font-medium">{eventType.title}</p>
        <p className="mt-1 text-[#8A877F]">
          {dateLongFr(dateKeyInTz(slotIso, tz))} à {timeInTz(slotIso, tz)}
        </p>
        <p className="text-xs text-[#8A877F]">({tz.replace(/_/g, " ")})</p>
        <p className="mt-1 text-[#8A877F]">avec {page.display_name}</p>
        {meetingUrl ? (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: brand }}
          >
            Lien de la visio
          </a>
        ) : null}
      </div>

      {!requiresConfirmation ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-[#8A877F]">Ajouter à mon agenda :</span>
          <a
            className="rounded-full border px-3 py-1 font-medium text-[#14120E] hover:bg-[#F4F2EC]"
            target="_blank"
            rel="noreferrer"
            href={googleCalendarUrl({
              title: `${eventType.title} avec ${page.display_name}`,
              startIso: slotIso,
              endIso: new Date(
                Date.parse(slotIso) + eventType.duration_minutes * 60000,
              ).toISOString(),
              details: meetingUrl ? `Visio : ${meetingUrl}` : undefined,
              location: meetingUrl ?? undefined,
            })}
          >
            Google
          </a>
          <a
            className="rounded-full border px-3 py-1 font-medium text-[#14120E] hover:bg-[#F4F2EC]"
            target="_blank"
            rel="noreferrer"
            href={outlookCalendarUrl({
              title: `${eventType.title} avec ${page.display_name}`,
              startIso: slotIso,
              endIso: new Date(
                Date.parse(slotIso) + eventType.duration_minutes * 60000,
              ).toISOString(),
              details: meetingUrl ? `Visio : ${meetingUrl}` : undefined,
              location: meetingUrl ?? undefined,
            })}
          >
            Outlook
          </a>
        </div>
      ) : null}

      {manageToken ? (
        <p className="mt-6 text-xs text-[#8A877F]">
          Besoin de changer ?{" "}
          <a className="underline" href={`/rdv/gerer/${manageToken}`}>
            Reprogrammer ou annuler
          </a>
        </p>
      ) : null}
    </div>
  );
}
