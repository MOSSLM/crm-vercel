import type { CalendarEventModel } from "@/lib/recurrence";

export type OverlayKind = "projet" | "tache" | "sous-tache";

/** Échéances existantes (projets/tâches/sous-tâches) affichées en lecture seule. */
export interface OverlayItem {
  id: string;
  label: string;
  kind: OverlayKind;
  /** Date de référence (due_date / start_at) au format ISO. */
  date: string;
  startAt?: string | null;
  endAt?: string | null;
  /** Couleur héritée (couleur de projet) le cas échéant. */
  color?: string | null;
}

export interface CalendarCategory {
  id: string;
  nom: string;
  color: string;
  position: number;
}

export type { CalendarEventModel };

/** Couleur par défaut d'un bloc sans catégorie. */
export const DEFAULT_EVENT_COLOR = "#2A6FDB";

/** Palette de couleurs proposée pour les catégories (style agenda). */
export const CALENDAR_PALETTE: { name: string; color: string }[] = [
  { name: "Bleu", color: "#2A6FDB" },
  { name: "Orange", color: "#E2552B" },
  { name: "Vert", color: "#1F8A5B" },
  { name: "Violet", color: "#7A5AE0" },
  { name: "Ambre", color: "#C8881F" },
  { name: "Rouge", color: "#B5322F" },
  { name: "Cyan", color: "#0E7490" },
  { name: "Rose", color: "#DB2777" },
  { name: "Ardoise", color: "#475569" },
];
