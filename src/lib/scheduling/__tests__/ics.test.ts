import { buildIcs } from "../ics";

const baseEvent = {
  uid: "booking-123@app.samadigitalstudio.fr",
  sequence: 0,
  startUtc: new Date("2026-01-12T08:00:00.000Z"),
  endUtc: new Date("2026-01-12T08:30:00.000Z"),
  summary: "Appel découverte — Jean Dupont",
  description: "Notes; avec, des\ncaractères spéciaux",
  location: "Google Meet",
  url: "https://meet.google.com/abc-defg-hij",
  organizer: { name: "Sama Studio", email: "contact@samadigitalstudio.fr" },
  attendees: [{ name: "Jean Dupont", email: "jean@exemple.fr" }],
  method: "REQUEST" as const,
};

/** Déplie les lignes repliées RFC 5545 (CRLF + espace) pour comparer le contenu. */
const unfold = (ics: string): string => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  it("génère un VEVENT REQUEST valide en UTC", () => {
    const ics = unfold(buildIcs(baseEvent));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20260112T080000Z");
    expect(ics).toContain("DTEND:20260112T083000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("UID:booking-123@app.samadigitalstudio.fr");
    expect(ics).toContain("ORGANIZER;CN=Sama Studio:mailto:contact@samadigitalstudio.fr");
    expect(ics).toContain("mailto:jean@exemple.fr");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("échappe virgules, points-virgules et retours à la ligne", () => {
    const ics = unfold(buildIcs(baseEvent));
    expect(ics).toContain("Notes\\; avec\\, des\\ncaractères spéciaux");
  });

  it("génère une annulation avec SEQUENCE incrémentée", () => {
    const ics = buildIcs({ ...baseEvent, method: "CANCEL", sequence: 1 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
  });

  it("plie les lignes longues à 75 octets max", () => {
    const ics = buildIcs({
      ...baseEvent,
      description: "x".repeat(400),
    });
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
});
