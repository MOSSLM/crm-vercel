"use client";

/** URL de base côté client — même logique que getAppUrl(), utilisable en browser. */
export const getAppUrlClient = (): string => {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "samadigitalstudio.fr";
  return `https://app.${domain}`;
};

/** Liste des fuseaux IANA du navigateur (fallback court sinon). */
export const timezoneOptions = (): string[] => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (sv) return sv("timeZone");
  } catch {
    // fallback
  }
  return [
    "Europe/Paris", "Europe/London", "Europe/Brussels", "Africa/Casablanca", "Africa/Dakar",
    "America/New_York", "America/Montreal", "Asia/Dubai", "UTC",
  ];
};

/** '09:30' ↔ 570 minutes. */
export const minutesToTime = (m: number): string =>
  `${`${Math.floor(m / 60)}`.padStart(2, "0")}:${`${m % 60}`.padStart(2, "0")}`;

export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const WEEKDAYS_FR = [
  { iso: 1, label: "Lundi" },
  { iso: 2, label: "Mardi" },
  { iso: 3, label: "Mercredi" },
  { iso: 4, label: "Jeudi" },
  { iso: 5, label: "Vendredi" },
  { iso: 6, label: "Samedi" },
  { iso: 7, label: "Dimanche" },
];
