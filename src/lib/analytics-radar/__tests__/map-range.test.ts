import { MAP_RANGES, MAP_RANGE_ORDER, parseMapRange } from "../map-range";
import { ga4MinuteStamp, ga4ReportTimeZone } from "../ga4-client";

describe("parseMapRange", () => {
  it("prend la fenêtre demandée quand elle existe", () => {
    expect(parseMapRange("live", 7)).toBe("live");
    expect(parseMapRange("hour", 7)).toBe("hour");
    expect(parseMapRange("24h", 7)).toBe("24h");
    expect(parseMapRange("today", 30)).toBe("today");
  });

  it("ignore une valeur inconnue plutôt que de la propager", () => {
    expect(parseMapRange("semaine-derniere", 7)).toBe("7d");
    expect(parseMapRange("", 7)).toBe("7d");
  });

  it("retombe sur la plage de la page quand la carte n'en demande pas", () => {
    // Compatibilité : un appel qui ne connaît pas encore `mapRange` doit voir
    // exactement ce que la carte affichait avant qu'elle ait sa propre plage.
    expect(parseMapRange(null, 1)).toBe("24h");
    expect(parseMapRange(null, 7)).toBe("7d");
    expect(parseMapRange(null, 14)).toBe("30d");
    expect(parseMapRange(null, 90)).toBe("90d");
  });
});

describe("MAP_RANGES", () => {
  it("mesure en minutes ce qui est plus court qu'un jour, en jours au-delà", () => {
    expect(MAP_RANGES.live).toMatchObject({ minutes: 30, days: null });
    expect(MAP_RANGES.hour).toMatchObject({ minutes: 60, days: null });
    expect(MAP_RANGES["24h"]).toMatchObject({ minutes: 1440, days: null });
    expect(MAP_RANGES.today).toMatchObject({ minutes: null, days: 0 });
    expect(MAP_RANGES["30d"]).toMatchObject({ minutes: null, days: 30 });
  });

  it("n'a jamais les deux à la fois — la route choisit son régime dessus", () => {
    for (const k of MAP_RANGE_ORDER) {
      const w = MAP_RANGES[k];
      expect(w.minutes == null || w.days == null).toBe(true);
      expect(w.minutes != null || w.days != null).toBe(true);
      expect(w.short.length).toBeGreaterThan(0);
      expect(w.label.length).toBeGreaterThan(0);
    }
  });

  it("va du plus frais au plus large", () => {
    expect(MAP_RANGE_ORDER).toEqual(["live", "hour", "24h", "today", "7d", "30d", "90d"]);
  });
});

describe("ga4MinuteStamp — la borne de la fenêtre glissante", () => {
  const AT = new Date("2026-08-15T09:07:00Z");

  it("rend le format de la dimension `dateHourMinute`, dans le fuseau donné", () => {
    expect(ga4MinuteStamp(AT, "UTC")).toBe("202608150907");
    // Paris est à UTC+2 en août.
    expect(ga4MinuteStamp(AT, "Europe/Paris")).toBe("202608151107");
  });

  it("se compare comme une chaîne, dans l'ordre chronologique", () => {
    const avant = ga4MinuteStamp(new Date(AT.getTime() - 60 * 60_000), "UTC");
    expect(avant < ga4MinuteStamp(AT, "UTC")).toBe(true);
  });

  it("passe minuit sans rendre « 24 »", () => {
    expect(ga4MinuteStamp(new Date("2026-08-15T00:03:00Z"), "UTC")).toBe("202608150003");
  });
});

describe("ga4ReportTimeZone", () => {
  it("lit le fuseau que GA4 joint à chaque rapport", () => {
    expect(ga4ReportTimeZone({ metadata: { timeZone: "Europe/Paris" } })).toBe("Europe/Paris");
  });

  it("dit qu'il ne sait pas plutôt que de deviner", () => {
    expect(ga4ReportTimeZone({})).toBeNull();
    expect(ga4ReportTimeZone({ metadata: {} })).toBeNull();
    expect(ga4ReportTimeZone({ metadata: { timeZone: "" } })).toBeNull();
  });
});
