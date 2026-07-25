/**
 * Liens « Ajouter à mon agenda » (Google / Outlook web) pour l'invité —
 * complément du fichier .ics joint aux emails.
 */

const icsBasic = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export interface CalendarLinkInput {
  title: string;
  startIso: string;
  endIso: string;
  details?: string;
  location?: string;
}

export const googleCalendarUrl = (input: CalendarLinkInput): string => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${icsBasic(input.startIso)}/${icsBasic(input.endIso)}`,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const outlookCalendarUrl = (input: CalendarLinkInput): string => {
  const params = new URLSearchParams({
    rru: "addevent",
    subject: input.title,
    startdt: new Date(input.startIso).toISOString(),
    enddt: new Date(input.endIso).toISOString(),
  });
  if (input.details) params.set("body", input.details);
  if (input.location) params.set("location", input.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
};
