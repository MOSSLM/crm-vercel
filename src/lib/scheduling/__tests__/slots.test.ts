import { computeAvailableSlots, isSlotAvailable, mergeIntervals } from "../slots";
import type { SlotComputationInput } from "../slots";

/**
 * Cas de base : lundi 12 janvier 2026 (hiver, Paris = UTC+1).
 * Règles 09:00–12:00 Europe/Paris → 08:00–11:00 UTC.
 */
const baseEventType: SlotComputationInput["eventType"] = {
  duration_minutes: 30,
  slot_interval_minutes: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  booking_window_days: 60,
  max_bookings_per_day: null,
  max_bookings_per_week: null,
};

const mondayMorning = (over: Partial<SlotComputationInput> = {}): SlotComputationInput => ({
  eventType: { ...baseEventType },
  timezone: "Europe/Paris",
  rules: [{ weekday: 1, start_minute: 9 * 60, end_minute: 12 * 60 }],
  overrides: [],
  busy: [],
  activeBookingStarts: [],
  fromUtc: new Date("2026-01-12T00:00:00.000Z"),
  toUtc: new Date("2026-01-13T00:00:00.000Z"),
  now: new Date("2026-01-05T10:00:00.000Z"),
  ...over,
});

const isoList = (slots: Date[]) => slots.map((s) => s.toISOString());

describe("computeAvailableSlots", () => {
  it("découpe une plage selon la durée (30 min sur 9h–12h Paris)", () => {
    const slots = computeAvailableSlots(mondayMorning());
    expect(isoList(slots)).toEqual([
      "2026-01-12T08:00:00.000Z",
      "2026-01-12T08:30:00.000Z",
      "2026-01-12T09:00:00.000Z",
      "2026-01-12T09:30:00.000Z",
      "2026-01-12T10:00:00.000Z",
      "2026-01-12T10:30:00.000Z",
    ]);
  });

  it("respecte une grille de départ différente de la durée (interval 15, durée 30)", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, slot_interval_minutes: 15 },
      }),
    );
    // Départs toutes les 15 min, dernier départ 11:30 Paris (fin 12:00).
    expect(slots).toHaveLength(11);
    expect(isoList(slots)[0]).toBe("2026-01-12T08:00:00.000Z");
    expect(isoList(slots)[10]).toBe("2026-01-12T10:30:00.000Z");
  });

  it("soustrait les busy (booking existant 10:00–10:30 Paris)", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        busy: [
          {
            start: Date.parse("2026-01-12T09:00:00.000Z"), // 10:00 Paris
            end: Date.parse("2026-01-12T09:30:00.000Z"),
          },
        ],
      }),
    );
    expect(isoList(slots)).not.toContain("2026-01-12T09:00:00.000Z");
    expect(isoList(slots)).toContain("2026-01-12T08:30:00.000Z");
    expect(isoList(slots)).toContain("2026-01-12T09:30:00.000Z");
  });

  it("un busy adjacent (fin = début du créneau) ne bloque pas sans buffer", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        busy: [
          {
            start: Date.parse("2026-01-12T07:00:00.000Z"),
            end: Date.parse("2026-01-12T08:00:00.000Z"), // finit pile à 9h Paris
          },
        ],
      }),
    );
    expect(isoList(slots)).toContain("2026-01-12T08:00:00.000Z");
  });

  it("applique les buffers avant/après autour du créneau candidat", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, buffer_before_minutes: 15, buffer_after_minutes: 15 },
        busy: [
          {
            start: Date.parse("2026-01-12T09:00:00.000Z"), // 10:00–10:30 Paris
            end: Date.parse("2026-01-12T09:30:00.000Z"),
          },
        ],
      }),
    );
    // 09:30–10:00 Paris : buffer après (15) mord sur le busy → exclu.
    expect(isoList(slots)).not.toContain("2026-01-12T08:30:00.000Z");
    // 10:30–11:00 Paris : buffer avant (15) mord sur le busy → exclu.
    expect(isoList(slots)).not.toContain("2026-01-12T09:30:00.000Z");
    // 09:00–09:30 Paris : requiredFree 08:45–09:45 Paris, libre → gardé.
    expect(isoList(slots)).toContain("2026-01-12T08:00:00.000Z");
    // 11:00–11:30 Paris : gardé.
    expect(isoList(slots)).toContain("2026-01-12T10:00:00.000Z");
  });

  it("applique le préavis minimum", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, minimum_notice_minutes: 120 },
        now: new Date("2026-01-12T07:30:00.000Z"), // 08:30 Paris le jour même
      }),
    );
    // Préavis 2 h → premier créneau ≥ 09:30 UTC (10:30 Paris).
    expect(isoList(slots)).toEqual([
      "2026-01-12T09:30:00.000Z",
      "2026-01-12T10:00:00.000Z",
      "2026-01-12T10:30:00.000Z",
    ]);
  });

  it("applique la fenêtre de réservation max", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, booking_window_days: 3 },
        now: new Date("2026-01-05T10:00:00.000Z"), // lundi 12 = J+7 → hors fenêtre
      }),
    );
    expect(slots).toHaveLength(0);
  });

  it("respecte la limite de réservations par jour", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, max_bookings_per_day: 2 },
        activeBookingStarts: [
          "2026-01-12T13:00:00.000Z", // 2 bookings ce lundi (fuseau Paris)
          "2026-01-12T14:00:00.000Z",
        ],
      }),
    );
    expect(slots).toHaveLength(0);
  });

  it("respecte la limite hebdomadaire", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        eventType: { ...baseEventType, max_bookings_per_week: 1 },
        // Un booking le mercredi de la même semaine ISO.
        activeBookingStarts: ["2026-01-14T13:00:00.000Z"],
      }),
    );
    expect(slots).toHaveLength(0);
  });

  it("un jour bloqué par override ne produit aucun créneau", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        overrides: [{ date: "2026-01-12", is_unavailable: true, ranges: [] }],
      }),
    );
    expect(slots).toHaveLength(0);
  });

  it("un override avec plages remplace les règles hebdo du jour", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        overrides: [
          {
            date: "2026-01-12",
            is_unavailable: false,
            // 15:00–16:00 Paris uniquement ce jour-là.
            ranges: [{ startMinute: 15 * 60, endMinute: 16 * 60 }],
          },
        ],
      }),
    );
    expect(isoList(slots)).toEqual([
      "2026-01-12T14:00:00.000Z",
      "2026-01-12T14:30:00.000Z",
    ]);
  });

  it("produit des créneaux stables autour du passage à l'heure d'été", () => {
    // Vendredi 27 mars (UTC+1) et lundi 30 mars 2026 (UTC+2), règle 9h–10h
    // en semaine : l'heure murale de Paris reste 9h des deux côtés.
    const slots = computeAvailableSlots(
      mondayMorning({
        rules: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          start_minute: 9 * 60,
          end_minute: 10 * 60,
        })),
        fromUtc: new Date("2026-03-27T00:00:00.000Z"),
        toUtc: new Date("2026-03-31T00:00:00.000Z"),
        now: new Date("2026-03-20T10:00:00.000Z"),
      }),
    );
    const isos = isoList(slots);
    expect(isos).toContain("2026-03-27T08:00:00.000Z"); // ven 9h Paris (UTC+1)
    expect(isos).toContain("2026-03-30T07:00:00.000Z"); // lun 9h Paris (UTC+2)
  });

  it("gère un planning dans un fuseau lointain (créneau la veille en UTC)", () => {
    // Mardi 9h–10h Asia/Tokyo (UTC+9) → lundi 12/01 en UTC minuit passé…
    // 9h Tokyo mardi 13 = lundi 12 à 00:00 UTC.
    const slots = computeAvailableSlots(
      mondayMorning({
        timezone: "Asia/Tokyo",
        rules: [{ weekday: 2, start_minute: 9 * 60, end_minute: 10 * 60 }],
        fromUtc: new Date("2026-01-12T00:00:00.000Z"),
        toUtc: new Date("2026-01-14T00:00:00.000Z"),
      }),
    );
    expect(isoList(slots)).toContain("2026-01-13T00:00:00.000Z");
  });

  it("dédoublonne des règles qui se chevauchent", () => {
    const slots = computeAvailableSlots(
      mondayMorning({
        rules: [
          { weekday: 1, start_minute: 9 * 60, end_minute: 11 * 60 },
          { weekday: 1, start_minute: 9 * 60, end_minute: 12 * 60 },
        ],
      }),
    );
    const isos = isoList(slots);
    expect(new Set(isos).size).toBe(isos.length);
  });
});

describe("isSlotAvailable", () => {
  const base = mondayMorning();

  it("valide un créneau exact de la grille", () => {
    expect(isSlotAvailable(base, new Date("2026-01-12T08:30:00.000Z"))).toBe(true);
  });

  it("rejette un créneau hors grille ou occupé", () => {
    expect(isSlotAvailable(base, new Date("2026-01-12T08:10:00.000Z"))).toBe(false);
    expect(
      isSlotAvailable(
        {
          ...base,
          busy: [
            {
              start: Date.parse("2026-01-12T08:30:00.000Z"),
              end: Date.parse("2026-01-12T09:00:00.000Z"),
            },
          ],
        },
        new Date("2026-01-12T08:30:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("mergeIntervals", () => {
  it("fusionne les intervalles qui se touchent ou se chevauchent", () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 30, end: 40 },
        { start: 50, end: 60 },
      ]),
    ).toEqual([
      { start: 10, end: 40 },
      { start: 50, end: 60 },
    ]);
  });
});
