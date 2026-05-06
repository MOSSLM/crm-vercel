/** Pure color utility functions — no React/DOM dependency */

// ─── HSL ↔ HEX ───────────────────────────────────────────────────────────────

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / delta + 2) / 6; break;
      case b: h = ((r - g) / delta + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Shade Generation ─────────────────────────────────────────────────────────

const SHADE_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ShadeStop = typeof SHADE_STOPS[number];
export type ColorShadeScale = Record<ShadeStop, string>;

/**
 * Generates 11 perceptually-balanced shades (50–950) from a base hex color.
 * Shade 500 is the closest to the input color.
 */
export function generateColorShades(hex: string): ColorShadeScale {
  // Normalize hex
  const normalized = hex.startsWith('#') ? hex : `#${hex}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    // Fallback: return gray shades
    const grays = { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712' };
    return grays as ColorShadeScale;
  }

  const { h, s, l } = hexToHsl(normalized);

  // Target lightness for each shade stop
  const lightnessMap: Record<number, number> = {
    50: 97,
    100: 94,
    200: 87,
    300: 77,
    400: 65,
    500: l, // base color lightness
    600: Math.max(l * 0.82, 5),
    700: Math.max(l * 0.65, 5),
    800: Math.max(l * 0.48, 5),
    900: Math.max(l * 0.33, 5),
    950: Math.max(l * 0.22, 5),
  };

  // Saturation multiplier — reduce at extremes for natural look
  const satMultiplier: Record<number, number> = {
    50: 0.25,
    100: 0.35,
    200: 0.55,
    300: 0.75,
    400: 0.90,
    500: 1.00,
    600: 0.95,
    700: 0.90,
    800: 0.85,
    900: 0.80,
    950: 0.70,
  };

  const result = {} as ColorShadeScale;
  for (const stop of SHADE_STOPS) {
    const targetL = lightnessMap[stop];
    const targetS = Math.min(s * satMultiplier[stop], 100);
    result[stop] = hslToHex(h, targetS, targetL);
  }

  return result;
}

// ─── Color Utilities ──────────────────────────────────────────────────────────

/** Returns true if the color is perceptually light (should use dark text on it) */
export function isLightColor(hex: string): boolean {
  const normalized = hex.startsWith('#') ? hex : `#${hex}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return true;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  // W3C relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/** Returns '#000000' or '#ffffff' for maximum contrast with the given background */
export function getContrastColor(hex: string): string {
  return isLightColor(hex) ? '#111827' : '#ffffff';
}

// ─── Color Scheme Resolution ──────────────────────────────────────────────────

export type ColorSchemePreset =
  | 'default'
  | 'alt'
  | 'primary'
  | 'secondary'
  | 'dark'
  | 'light'
  | 'inverted';

export interface SectionColorScheme {
  preset: ColorSchemePreset;
  customBg?: string;
  customText?: string;
}

export interface StyleGuideColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundAlt: string;
  text: string;
  textMuted: string;
}

export function resolveColorScheme(
  scheme: SectionColorScheme,
  colors: StyleGuideColors,
): { bg: string; text: string; textMuted: string } {
  if (scheme.customBg) {
    const bg = scheme.customBg;
    const text = scheme.customText ?? getContrastColor(bg);
    return { bg, text, textMuted: text + 'aa' };
  }

  switch (scheme.preset) {
    case 'primary':
      return {
        bg: colors.primary,
        text: getContrastColor(colors.primary),
        textMuted: getContrastColor(colors.primary) + 'aa',
      };
    case 'secondary':
      return {
        bg: colors.secondary,
        text: getContrastColor(colors.secondary),
        textMuted: getContrastColor(colors.secondary) + 'aa',
      };
    case 'alt':
      return { bg: colors.backgroundAlt, text: colors.text, textMuted: colors.textMuted };
    case 'dark':
      return { bg: '#111827', text: '#f9fafb', textMuted: '#9ca3af' };
    case 'light':
      return { bg: '#ffffff', text: '#111827', textMuted: '#6b7280' };
    case 'inverted':
      return {
        bg: colors.text,
        text: colors.background,
        textMuted: colors.backgroundAlt,
      };
    default: // 'default'
      return { bg: colors.background, text: colors.text, textMuted: colors.textMuted };
  }
}

/** Generate CSS vars for all shades of primary, secondary, accent */
export function generateShadeCSSVars(colors: StyleGuideColors): Record<string, string> {
  const result: Record<string, string> = {};
  const targets = { primary: colors.primary, secondary: colors.secondary, accent: colors.accent };

  for (const [name, hex] of Object.entries(targets)) {
    const shades = generateColorShades(hex);
    for (const [stop, value] of Object.entries(shades)) {
      result[`--color-${name}-${stop}`] = value;
    }
  }

  return result;
}
