/**
 * Génération de fichiers iCalendar (.ics) pour les invitations de RDV —
 * METHOD:REQUEST à la confirmation, METHOD:CANCEL à l'annulation.
 * Pur string-building, conforme RFC 5545 (échappement + pliage de lignes).
 */

export interface IcsEventInput {
  uid: string;
  /** Incrémenté à chaque modification (reprogrammation → +1). */
  sequence: number;
  startUtc: Date;
  endUtc: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: { name: string; email: string };
  attendees: { name?: string; email: string }[];
  method: "REQUEST" | "CANCEL";
}

const pad = (n: number): string => `${n}`.padStart(2, "0");

/** Instant UTC au format iCal basique : 20260131T090000Z */
const icsUtc = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Échappement RFC 5545 : backslash, point-virgule, virgule, retours ligne. */
const esc = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

/** Pliage des lignes > 75 octets (continuation par espace, RFC 5545 §3.1). */
const fold = (line: string): string => {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // 74 pour laisser la place à l'espace de continuation.
    let len = Math.min(start === 0 ? 75 : 74, bytes.length - start);
    // Ne pas couper au milieu d'un caractère UTF-8 (octets de continuation 10xxxxxx).
    while (len > 1 && start + len < bytes.length && (bytes[start + len] & 0xc0) === 0x80) {
      len -= 1;
    }
    const chunk = bytes.subarray(start, start + len).toString("utf8");
    out.push(start === 0 ? chunk : ` ${chunk}`);
    start += len;
  }
  return out.join("\r\n");
};

export function buildIcs(event: IcsEventInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SAMA Digital Studio//CRM Rendez-vous//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${esc(event.uid)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(event.startUtc)}`,
    `DTEND:${icsUtc(event.endUtc)}`,
    `SUMMARY:${esc(event.summary)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.url) lines.push(`URL:${esc(event.url)}`);

  lines.push(
    `ORGANIZER;CN=${esc(event.organizer.name)}:mailto:${event.organizer.email}`,
  );
  for (const a of event.attendees) {
    lines.push(
      `ATTENDEE;CN=${esc(a.name ?? a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=` +
        `${event.method === "CANCEL" ? "DECLINED" : "ACCEPTED"};RSVP=FALSE:mailto:${a.email}`,
    );
  }

  lines.push(
    `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(fold).join("\r\n") + "\r\n";
}
