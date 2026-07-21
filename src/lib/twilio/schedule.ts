/**
 * On/Off scheduling. Pure functions so the cron behaviour is unit-testable.
 *
 * A schedule opts an agent into automatic mode switching:
 *   { autoMode: true, tz: "Europe/Paris", windows: [{ days:[1,2,3,4,5], start:"09:00", end:"18:00" }] }
 * days use ISO weekday numbers (1 = Monday … 7 = Sunday). Inside any window the
 * mode is "on", otherwise "off". Without autoMode the schedule is ignored.
 */
export interface ScheduleWindow {
  days: number[]; // 1=Mon … 7=Sun
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface PhoneSchedule {
  autoMode?: boolean;
  tz?: string;
  windows?: ScheduleWindow[];
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Day-of-week (ISO) and minutes-since-midnight for `now` in `tz`. */
export const partsInTz = (now: Date, tz: string): { dow: number; minutes: number } => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = WEEKDAY_TO_ISO[get("weekday")] ?? 1;
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some environments emit "24" at midnight
  const minute = parseInt(get("minute"), 10);
  return { dow, minutes: hour * 60 + minute };
};

/** Returns the mode the schedule dictates now, or null when autoMode is off. */
export const resolveScheduledMode = (
  schedule: PhoneSchedule | null | undefined,
  now: Date = new Date(),
): "on" | "off" | null => {
  if (!schedule?.autoMode) return null;
  const windows = schedule.windows ?? [];
  if (windows.length === 0) return "off";

  const tz = schedule.tz ?? "Europe/Paris";
  const { dow, minutes } = partsInTz(now, tz);

  for (const w of windows) {
    if (!Array.isArray(w.days) || !w.days.includes(dow)) continue;
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    if (start <= minutes && minutes < end) return "on";
  }
  return "off";
};
