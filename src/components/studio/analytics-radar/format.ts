// format.ts — pure formatting helpers (port of the format section of an-data.jsx)

export const anDur = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`
    : s >= 60
      ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`
      : `${Math.round(s)}s`;

export const anPct = (x: number, d = 0) => `${(x * 100).toFixed(d)} %`;

export const anNum = (x: number) => x.toLocaleString("fr-FR");

export const anIni = (s: string) =>
  s
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const DEVICE_LABELS: Record<string, { n: string; ic: string }> = {
  mobile: { n: "Mobile", ic: "phone" },
  desktop: { n: "Ordinateur", ic: "panel" },
  tablet: { n: "Tablette", ic: "square" },
};
export const anDeviceLabel = (k: string) => DEVICE_LABELS[k.toLowerCase()] ?? { n: k || "Inconnu", ic: "square" };

const SOURCE_ICONS: Array<[RegExp, string]> = [
  [/mail|email/i, "mail"],
  [/sms/i, "sms"],
  [/whatsapp/i, "whatsapp"],
  [/linkedin/i, "linkedin"],
  [/\(direct\)|direct/i, "link"],
];
export const anSourceIcon = (sourceMedium: string) => SOURCE_ICONS.find(([re]) => re.test(sourceMedium))?.[1] ?? "share";
