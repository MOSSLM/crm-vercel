import { expandOccurrences, isoWeekday, toDateKey, type CalendarEventModel } from "./recurrence";

// Note : les dates ISO sans "Z" sont interprétées en heure locale, ce qui rend
// les tests indépendants du fuseau de la machine.

const makeEvent = (overrides: Partial<CalendarEventModel> = {}): CalendarEventModel => ({
  id: "e1",
  title: "Bloc",
  color: "#2A6FDB",
  allDay: false,
  startAt: "2026-06-01T09:00:00", // lundi 1er juin 2026
  endAt: "2026-06-01T11:00:00",
  rule: { freq: "none", interval: 1 },
  ...overrides,
});

const keys = (event: CalendarEventModel, from: string, to: string) =>
  expandOccurrences(event, new Date(from), new Date(to)).map((o) => o.occurrenceDate);

describe("isoWeekday", () => {
  it("lundi = 1, dimanche = 7", () => {
    expect(isoWeekday(new Date("2026-06-01T00:00:00"))).toBe(1); // lundi
    expect(isoWeekday(new Date("2026-06-07T00:00:00"))).toBe(7); // dimanche
  });
});

describe("expandOccurrences", () => {
  it("none : une seule occurrence", () => {
    const got = keys(makeEvent(), "2026-06-01T00:00:00", "2026-06-30T23:59:59");
    expect(got).toEqual(["2026-06-01"]);
  });

  it("daily : tous les jours de la fenêtre", () => {
    const event = makeEvent({ rule: { freq: "daily", interval: 1 } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-05T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
  });

  it("daily interval 2 : un jour sur deux", () => {
    const event = makeEvent({ rule: { freq: "daily", interval: 2 } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-07T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-06-03", "2026-06-05", "2026-06-07"]);
  });

  it("weekly Lun/Mer/Ven", () => {
    const event = makeEvent({ rule: { freq: "weekly", interval: 1, weekdays: [1, 3, 5] } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-14T23:59:59");
    expect(got).toEqual([
      "2026-06-01", "2026-06-03", "2026-06-05", // semaine 1 : lun, mer, ven
      "2026-06-08", "2026-06-10", "2026-06-12", // semaine 2
    ]);
  });

  it("weekly jours de semaine (Lun–Ven) exclut le week-end", () => {
    const event = makeEvent({ rule: { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-07T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
    expect(got).not.toContain("2026-06-06"); // samedi
    expect(got).not.toContain("2026-06-07"); // dimanche
  });

  it("respecte la date de fin (until)", () => {
    const event = makeEvent({ rule: { freq: "daily", interval: 1, until: "2026-06-03" } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-30T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("ignore les exceptions", () => {
    const event = makeEvent({
      rule: { freq: "daily", interval: 1, exceptions: ["2026-06-03"] },
    });
    const got = keys(event, "2026-06-01T00:00:00", "2026-06-05T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05"]);
  });

  it("monthly : même quantième chaque mois", () => {
    const event = makeEvent({ rule: { freq: "monthly", interval: 1 } });
    const got = keys(event, "2026-06-01T00:00:00", "2026-08-31T23:59:59");
    expect(got).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
  });

  it("conserve l'heure et la durée", () => {
    const event = makeEvent({ rule: { freq: "daily", interval: 1 } });
    const [first] = expandOccurrences(event, new Date("2026-06-01T00:00:00"), new Date("2026-06-02T23:59:59"));
    expect(first.start.getHours()).toBe(9);
    expect(first.end.getTime() - first.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("ne renvoie que les occurrences chevauchant la fenêtre", () => {
    const event = makeEvent({ rule: { freq: "daily", interval: 1 } });
    const got = keys(event, "2026-06-10T00:00:00", "2026-06-12T23:59:59");
    expect(got).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("toDateKey ne décale pas le jour", () => {
    expect(toDateKey(new Date(2026, 5, 1, 9, 0))).toBe("2026-06-01");
  });
});
