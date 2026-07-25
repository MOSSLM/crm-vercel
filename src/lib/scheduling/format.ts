/**
 * Formatage français des dates/heures d'un booking dans un fuseau donné.
 * Basé sur Intl (comme le reste du CRM), aucune dépendance.
 */

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « Lundi 12 janvier 2026 » dans le fuseau demandé. */
export const formatDateLongFr = (utc: Date, timeZone: string): string =>
  capitalize(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(utc),
  );

/** « 09:30 » dans le fuseau demandé. */
export const formatTimeFr = (utc: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(utc);

/** « Lundi 12 janvier 2026, 09:30 – 10:00 (Europe/Paris) » */
export const formatSlotRangeFr = (
  startUtc: Date,
  endUtc: Date,
  timeZone: string,
): string =>
  `${formatDateLongFr(startUtc, timeZone)}, ${formatTimeFr(startUtc, timeZone)} – ${formatTimeFr(
    endUtc,
    timeZone,
  )} (${timeZone.replace(/_/g, " ")})`;

/** Durée lisible : 30 min, 1 h, 1 h 30. */
export const formatDurationFr = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m.toString().padStart(2, "0")}` : `${h} h`;
};
