/**
 * Conversions fuseau horaire ↔ UTC sans dépendance externe, via Intl.
 *
 * Tout le module scheduling stocke en UTC ; les règles de dispo sont des
 * minutes-depuis-minuit dans le fuseau du planning. La conversion se fait
 * DATE PAR DATE, donc « lundi 09:00 Europe/Paris » vaut 08:00 UTC en hiver et
 * 07:00 UTC en été — les créneaux ne bougent jamais au changement d'heure.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

const getDtf = (timeZone: string): Intl.DateTimeFormat => {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
};

export type WallClock = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
};

/** Heure « murale » (locale au fuseau) d'un instant UTC. */
export const wallClockInTz = (utc: Date, timeZone: string): WallClock => {
  const parts = getDtf(timeZone).formatToParts(utc);
  const get = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? "0";
    return Number(raw);
  };
  // Intl renvoie parfois hour "24" pour minuit selon les implémentations.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
};

/** Décalage du fuseau à un instant UTC donné, en minutes (Paris été = +120). */
export const tzOffsetMinutes = (utc: Date, timeZone: string): number => {
  const w = wallClockInTz(utc, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - utc.getTime()) / 60000);
};

/**
 * Instant UTC correspondant à `dateKey` (yyyy-MM-dd) + `minuteOfDay` dans
 * `timeZone`. Double passe pour converger autour des transitions DST ; une
 * heure locale inexistante (avance d'horloge) retombe sur l'instant décalé.
 */
export const zonedTimeToUtc = (
  dateKey: string,
  minuteOfDay: number,
  timeZone: string,
): Date => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, minuteOfDay, 0, 0);
  let utc = wallAsUtc - tzOffsetMinutes(new Date(wallAsUtc), timeZone) * 60000;
  utc = wallAsUtc - tzOffsetMinutes(new Date(utc), timeZone) * 60000;
  return new Date(utc);
};

const pad = (n: number): string => `${n}`.padStart(2, "0");

/** Clé date 'yyyy-MM-dd' d'un instant UTC vue depuis un fuseau. */
export const dateKeyInTz = (utc: Date, timeZone: string): string => {
  const w = wallClockInTz(utc, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
};

/** Minutes depuis minuit d'un instant UTC vues depuis un fuseau. */
export const minuteOfDayInTz = (utc: Date, timeZone: string): number => {
  const w = wallClockInTz(utc, timeZone);
  return w.hour * 60 + w.minute;
};

/** Jour de semaine ISO (1=lun .. 7=dim) d'une clé date (indépendant du fuseau). */
export const isoWeekdayOfDateKey = (dateKey: string): number => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return js === 0 ? 7 : js;
};

/** Clé date suivante (arithmétique calendaire pure, sans fuseau). */
export const nextDateKey = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

/** Clé de semaine ISO 'yyyy-Www' d'une clé date — pour les limites hebdo. */
export const isoWeekKeyOfDateKey = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  // Jeudi de la même semaine ISO détermine l'année ISO.
  const dayNr = (date.getUTCDay() + 6) % 7; // 0=lun
  date.setUTCDate(date.getUTCDate() - dayNr + 3);
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNr);
  const week = 1 + Math.round((date.getTime() - week1Monday.getTime()) / (7 * 24 * 3600 * 1000) - 3 / 7);
  return `${isoYear}-W${pad(week)}`;
};

/** Un identifiant IANA est-il valide ? (« Europe/Paris » oui, « Mars/Base » non) */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    getDtf(timeZone);
    return true;
  } catch {
    dtfCache.delete(timeZone);
    return false;
  }
};

/** Libellé court du décalage, ex. « UTC+2 » — affiché dans le sélecteur de fuseau. */
export const offsetLabel = (timeZone: string, at: Date = new Date()): string => {
  const mins = tzOffsetMinutes(at, timeZone);
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ""}`;
};
