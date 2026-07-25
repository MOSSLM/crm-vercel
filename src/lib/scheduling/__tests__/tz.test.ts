import {
  dateKeyInTz,
  isoWeekKeyOfDateKey,
  isoWeekdayOfDateKey,
  minuteOfDayInTz,
  nextDateKey,
  offsetLabel,
  tzOffsetMinutes,
  isValidTimeZone,
  zonedTimeToUtc,
} from "../tz";

describe("tz — conversions Intl sans dépendance", () => {
  it("convertit une heure Paris en UTC (hiver : UTC+1)", () => {
    // Lundi 12 janvier 2026, 09:00 Europe/Paris → 08:00 UTC.
    const utc = zonedTimeToUtc("2026-01-12", 9 * 60, "Europe/Paris");
    expect(utc.toISOString()).toBe("2026-01-12T08:00:00.000Z");
  });

  it("convertit une heure Paris en UTC (été : UTC+2)", () => {
    // Lundi 6 juillet 2026, 09:00 Europe/Paris → 07:00 UTC.
    const utc = zonedTimeToUtc("2026-07-06", 9 * 60, "Europe/Paris");
    expect(utc.toISOString()).toBe("2026-07-06T07:00:00.000Z");
  });

  it("ne décale pas les créneaux autour du passage à l'heure d'été (mars)", () => {
    // Changement d'heure Europe/Paris : dimanche 29 mars 2026, 02:00 → 03:00.
    const friday = zonedTimeToUtc("2026-03-27", 9 * 60, "Europe/Paris");
    const monday = zonedTimeToUtc("2026-03-30", 9 * 60, "Europe/Paris");
    expect(friday.toISOString()).toBe("2026-03-27T08:00:00.000Z"); // UTC+1
    expect(monday.toISOString()).toBe("2026-03-30T07:00:00.000Z"); // UTC+2
  });

  it("ne décale pas les créneaux autour du retour à l'heure d'hiver (octobre)", () => {
    // Retour heure d'hiver : dimanche 25 octobre 2026.
    const friday = zonedTimeToUtc("2026-10-23", 14 * 60, "Europe/Paris");
    const monday = zonedTimeToUtc("2026-10-26", 14 * 60, "Europe/Paris");
    expect(friday.toISOString()).toBe("2026-10-23T12:00:00.000Z"); // UTC+2
    expect(monday.toISOString()).toBe("2026-10-26T13:00:00.000Z"); // UTC+1
  });

  it("gère les fuseaux à décalage négatif et demi-heure", () => {
    expect(zonedTimeToUtc("2026-01-12", 9 * 60, "America/New_York").toISOString()).toBe(
      "2026-01-12T14:00:00.000Z",
    );
    // Kolkata UTC+5:30 toute l'année.
    expect(zonedTimeToUtc("2026-01-12", 9 * 60, "Asia/Kolkata").toISOString()).toBe(
      "2026-01-12T03:30:00.000Z",
    );
  });

  it("expose l'offset et l'heure murale d'un instant", () => {
    const jan = new Date("2026-01-12T08:00:00.000Z");
    const jul = new Date("2026-07-06T07:00:00.000Z");
    expect(tzOffsetMinutes(jan, "Europe/Paris")).toBe(60);
    expect(tzOffsetMinutes(jul, "Europe/Paris")).toBe(120);
    expect(minuteOfDayInTz(jan, "Europe/Paris")).toBe(9 * 60);
    expect(dateKeyInTz(new Date("2026-01-12T23:30:00.000Z"), "Europe/Paris")).toBe("2026-01-13");
    expect(dateKeyInTz(new Date("2026-01-12T23:30:00.000Z"), "America/New_York")).toBe("2026-01-12");
  });

  it("calcule jour ISO, semaine ISO et date suivante", () => {
    expect(isoWeekdayOfDateKey("2026-01-12")).toBe(1); // lundi
    expect(isoWeekdayOfDateKey("2026-01-18")).toBe(7); // dimanche
    expect(nextDateKey("2026-01-31")).toBe("2026-02-01");
    expect(nextDateKey("2026-12-31")).toBe("2027-01-01");
    // 2026-01-01 est un jeudi → semaine 1.
    expect(isoWeekKeyOfDateKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKeyOfDateKey("2026-01-12")).toBe("2026-W03");
  });

  it("valide les identifiants IANA", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("formate un libellé d'offset", () => {
    expect(offsetLabel("Europe/Paris", new Date("2026-01-12T12:00:00Z"))).toBe("UTC+1");
    expect(offsetLabel("Asia/Kolkata", new Date("2026-01-12T12:00:00Z"))).toBe("UTC+5:30");
    expect(offsetLabel("America/New_York", new Date("2026-01-12T12:00:00Z"))).toBe("UTC-5");
  });
});
