/**
 * Les fenêtres de temps du globe.
 *
 * POURQUOI LE GLOBE A SA PROPRE PLAGE
 * Le reste de l'écran (KPI, tableaux, frise) répond à « qu'est-ce qui s'est
 * passé sur les N derniers jours ». La carte, elle, sert à une autre question :
 * « qui est en train de regarder sa démo, là, maintenant ». Les deux plages
 * n'ont aucune raison d'être la même — regarder le direct sur la carte ne doit
 * pas remettre à zéro les moyennes d'engagement du mois juste au-dessus.
 *
 * TROIS RÉGIMES DE MESURE, PAS UN
 *   · `live` — GA4 Realtime seul (30 dernières minutes). C'est la seule source
 *     sans latence, et la seule qui sait dire « en ce moment ». En revanche
 *     l'API temps réel n'expose pas `hostName` : le périmètre y est déduit du
 *     titre de la page, donc approximatif (cf. `realtimeScopeIsApproximate`).
 *   · `hour` / `24h` — rapport standard à la MINUTE (`dateHourMinute`), coupé à
 *     la fenêtre glissante. Le rapport standard traîne de quelques minutes
 *     derrière le direct : les villes que seul le temps réel voit encore sont
 *     ajoutées par-dessus, comme ailleurs sur cet écran.
 *   · `today` et au-delà — rapport standard à la journée, tel quel.
 *
 * Ce module est PUR et partagé par la route API et l'écran : les libellés
 * affichés et la fenêtre réellement interrogée viennent de la même table, donc
 * la carte ne peut pas annoncer « dernière heure » et montrer autre chose.
 */

export type RadarMapRange = "live" | "hour" | "24h" | "today" | "7d" | "30d" | "90d";

export interface RadarMapWindow {
  /** Largeur de la fenêtre glissante, en minutes. `null` = fenêtre en jours. */
  minutes: number | null;
  /**
   * Nombre de jours du rapport standard. `0` = la journée en cours seulement.
   * `null` quand la fenêtre est en minutes.
   */
  days: number | null;
  /** Ce que le bouton affiche. */
  short: string;
  /** Ce que l'en-tête du globe affiche. */
  label: string;
}

export const MAP_RANGES: Record<RadarMapRange, RadarMapWindow> = {
  // 30 minutes : ce n'est pas un choix de confort, c'est la fenêtre que GA4
  // Realtime expose pour une propriété standard.
  live: { minutes: 30, days: null, short: "Direct", label: "En direct · 30 dernières minutes" },
  hour: { minutes: 60, days: null, short: "1 h", label: "Dernière heure" },
  "24h": { minutes: 1440, days: null, short: "24 h", label: "Dernières 24 heures" },
  today: { minutes: null, days: 0, short: "Auj.", label: "Aujourd'hui" },
  "7d": { minutes: null, days: 7, short: "7 j", label: "7 derniers jours" },
  "30d": { minutes: null, days: 30, short: "30 j", label: "30 derniers jours" },
  "90d": { minutes: null, days: 90, short: "90 j", label: "90 derniers jours" },
};

/** L'ordre des boutons : du plus frais au plus large. */
export const MAP_RANGE_ORDER: readonly RadarMapRange[] = [
  "live",
  "hour",
  "24h",
  "today",
  "7d",
  "30d",
  "90d",
] as const;

const isRange = (v: string): v is RadarMapRange => v in MAP_RANGES;

/**
 * La plage demandée, ou celle qui correspond le mieux à la plage de la page.
 *
 * Le repli sur `days` garde compatibles les appels qui ne connaissent pas
 * encore `mapRange` : la carte continue d'afficher ce qu'elle affichait.
 */
export function parseMapRange(raw: string | null, days: number): RadarMapRange {
  if (raw && isRange(raw)) return raw;
  if (days <= 1) return "24h";
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "90d";
}
