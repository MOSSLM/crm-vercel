// Colour palette + icon set ported from the SAMA board design (board-data.jsx).

export const CARD_COLORS = [
  { id: "slate", hex: "#697586" },
  { id: "red", hex: "#E2552B" },
  { id: "amber", hex: "#E0A82E" },
  { id: "yellow", hex: "#D9C40A" },
  { id: "lime", hex: "#6BA82E" },
  { id: "green", hex: "#1F8A5B" },
  { id: "teal", hex: "#0E938A" },
  { id: "cyan", hex: "#0EA5C9" },
  { id: "blue", hex: "#2A6FDB" },
  { id: "indigo", hex: "#5457D6" },
  { id: "violet", hex: "#7A5AE0" },
  { id: "fuchsia", hex: "#B5419E" },
  { id: "pink", hex: "#DB5A8A" },
] as const;

export const CARD_HEX: Record<string, string> = Object.fromEntries(
  CARD_COLORS.map((c) => [c.id, c.hex]),
);

export const NOTE_COLORS = [
  { id: "paper", bg: "#FFFFFF", bar: "#D9D5CC" },
  { id: "butter", bg: "#FBF3D0", bar: "#E3CE72" },
  { id: "mint", bg: "#DDF1E4", bar: "#8FCBA6" },
  { id: "sky", bg: "#DCEAFB", bar: "#8DB6EC" },
  { id: "lavender", bg: "#E8E1FB", bar: "#B4A2EC" },
  { id: "blush", bg: "#FBE2E8", bar: "#EC9FB1" },
  { id: "stone", bg: "#F0EEE8", bar: "#C9C5BB" },
] as const;

export const NOTE_BG: Record<string, string> = Object.fromEntries(
  NOTE_COLORS.map((c) => [c.id, c.bg]),
);
export const NOTE_BAR: Record<string, string> = Object.fromEntries(
  NOTE_COLORS.map((c) => [c.id, c.bar]),
);

export const PICK_ICONS = [
  "doc", "folder", "board", "target", "star", "rocket", "camera", "layers",
  "calendar", "megaphone", "bulb", "code", "pen", "palette", "globe", "file",
  "clock", "pin", "comment", "zap",
];

export type ColorOption = { id: string; hex?: string; bg?: string };
