/**
 * Button style resolver and preset library.
 *
 * The Style Guide stores button settings in a nested shape:
 *   buttons: { borderRadius, padding, style, hoverEffect (legacy primary shorthand),
 *              primary?: Partial<ButtonVariant>, secondary?: Partial<ButtonVariant> }
 *
 * Only `.cta-primary` and `.cta-secondary` elements receive these tokens at runtime —
 * any other button-like element (FAQ toggles, slider arrows, ticker dots, hamburger…)
 * keeps its native section styling. This is the opt-in convention library section
 * authors must follow when marking a CTA.
 */

import type { ButtonShadow, ButtonVariant, StyleGuide } from "@/types";
import { getContrastColor } from "@/lib/color-utils";

// ── Presets ─────────────────────────────────────────────────────────────────

export interface ButtonPresetSpec {
  id: string;
  label: string;
  primary: ButtonVariant;
  secondary: ButtonVariant;
}

export const BUTTON_PRESETS: ButtonPresetSpec[] = [
  {
    id: "modern",
    label: "Modern",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "8px", padding: "12px 24px", shadow: null, hoverEffect: "darken" },
    secondary: { style: "outline", borderWidth: "2px", borderRadius: "8px", padding: "12px 24px", shadow: null, hoverEffect: "lift" },
  },
  {
    id: "minimal",
    label: "Minimal",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "4px", padding: "10px 20px", shadow: null, hoverEffect: "darken" },
    secondary: { style: "ghost", borderWidth: "0px", borderRadius: "4px", padding: "10px 20px", shadow: null, hoverEffect: "darken" },
  },
  {
    id: "pill",
    label: "Pill",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "999px", padding: "14px 28px", shadow: { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0,0,0,0.10)" }, hoverEffect: "lift" },
    secondary: { style: "outline", borderWidth: "2px", borderRadius: "999px", padding: "14px 28px", shadow: null, hoverEffect: "lift" },
  },
  {
    id: "sharp",
    label: "Sharp",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "0px", padding: "14px 28px", shadow: null, hoverEffect: "darken" },
    secondary: { style: "outline", borderWidth: "2px", borderRadius: "0px", padding: "14px 28px", shadow: null, hoverEffect: "darken" },
  },
  {
    id: "bold",
    label: "Bold",
    primary: { style: "filled", borderWidth: "3px", borderRadius: "10px", padding: "14px 28px", shadow: { x: 4, y: 4, blur: 0, spread: 0, color: "#000000" }, hoverEffect: "lift" },
    secondary: { style: "outline", borderWidth: "3px", borderRadius: "10px", padding: "14px 28px", shadow: { x: 4, y: 4, blur: 0, spread: 0, color: "#000000" }, hoverEffect: "lift" },
  },
  {
    id: "soft",
    label: "Soft",
    primary: { style: "soft", borderWidth: "0px", borderRadius: "10px", padding: "12px 24px", shadow: null, hoverEffect: "darken" },
    secondary: { style: "ghost", borderWidth: "0px", borderRadius: "10px", padding: "12px 24px", shadow: null, hoverEffect: "darken" },
  },
  {
    id: "elevated",
    label: "Elevated",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "12px", padding: "14px 28px", shadow: { x: 0, y: 10, blur: 24, spread: -4, color: "rgba(0,0,0,0.18)" }, hoverEffect: "lift" },
    secondary: { style: "filled", borderWidth: "0px", borderRadius: "12px", padding: "14px 28px", shadow: { x: 0, y: 4, blur: 12, spread: -2, color: "rgba(0,0,0,0.10)" }, hoverEffect: "lift" },
  },
  {
    id: "glass",
    label: "Glass",
    primary: { style: "soft", borderWidth: "1px", borderRadius: "12px", padding: "12px 24px", shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(0,0,0,0.06)" }, hoverEffect: "lift" },
    secondary: { style: "outline", borderWidth: "1px", borderRadius: "12px", padding: "12px 24px", shadow: null, hoverEffect: "lift" },
  },
  {
    id: "playful",
    label: "Playful",
    primary: { style: "filled", borderWidth: "0px", borderRadius: "999px", padding: "12px 26px", shadow: { x: 0, y: 6, blur: 18, spread: -2, color: "rgba(0,0,0,0.15)" }, hoverEffect: "scale" },
    secondary: { style: "soft", borderWidth: "0px", borderRadius: "999px", padding: "12px 26px", shadow: null, hoverEffect: "scale" },
  },
];

// ── Resolver ────────────────────────────────────────────────────────────────

function shadowToCSS(s?: ButtonShadow | null): string {
  if (!s) return "none";
  return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
}

/**
 * Resolve the bg/text/border colors for a button variant given its base color.
 * `style` drives the auto-derivation; explicit overrides on the variant win.
 */
function deriveColors(v: ButtonVariant, baseColor: string): { bg: string; text: string; border: string } {
  let bg: string;
  let text: string;
  let border: string;

  switch (v.style) {
    case "outline":
      bg = "transparent";
      text = baseColor;
      border = baseColor;
      break;
    case "soft":
      bg = baseColor + "22"; // 13% alpha
      text = baseColor;
      border = "transparent";
      break;
    case "ghost":
      bg = "transparent";
      text = baseColor;
      border = "transparent";
      break;
    case "filled":
    default:
      bg = baseColor;
      text = getContrastColor(baseColor);
      border = baseColor;
      break;
  }

  return {
    bg: v.bg ?? bg,
    text: v.text ?? text,
    border: v.borderColor ?? border,
  };
}

const FALLBACK_PRIMARY: ButtonVariant = {
  style: "filled",
  borderWidth: "2px",
  borderRadius: "8px",
  padding: "12px 24px",
  shadow: null,
  hoverEffect: "darken",
};

const FALLBACK_SECONDARY: ButtonVariant = {
  style: "outline",
  borderWidth: "2px",
  borderRadius: "8px",
  padding: "12px 24px",
  shadow: null,
  hoverEffect: "lift",
};

/**
 * Resolve a fully-populated primary ButtonVariant from a StyleGuide, merging
 * (in order): hardcoded fallback < legacy flat buttons.* fields < buttons.primary overrides.
 */
export function resolvePrimaryVariant(sg: StyleGuide): ButtonVariant {
  const b = sg.buttons;
  const fromLegacy: Partial<ButtonVariant> = {
    style: b.style,
    borderRadius: b.borderRadius,
    padding: b.padding,
    hoverEffect: b.hoverEffect,
  };
  return { ...FALLBACK_PRIMARY, ...fromLegacy, ...(b.primary ?? {}) };
}

/**
 * Resolve a fully-populated secondary ButtonVariant. Defaults to outline using
 * the legacy radius/padding, then overlays buttons.secondary overrides.
 */
export function resolveSecondaryVariant(sg: StyleGuide): ButtonVariant {
  const b = sg.buttons;
  const fromLegacy: Partial<ButtonVariant> = {
    borderRadius: b.borderRadius,
    padding: b.padding,
  };
  return { ...FALLBACK_SECONDARY, ...fromLegacy, ...(b.secondary ?? {}) };
}

// ── CSS variable generation ─────────────────────────────────────────────────

/**
 * Build the CSS variable declarations for a single variant under a prefix
 * (e.g. "--btn-primary"). Returns an object keyed by CSS var name.
 */
export function variantToCSSVars(
  v: ButtonVariant,
  baseColor: string,
  prefix: string
): Record<string, string> {
  const { bg, text, border } = deriveColors(v, baseColor);
  return {
    [`${prefix}-bg`]: bg,
    [`${prefix}-text`]: text,
    [`${prefix}-border-color`]: border,
    [`${prefix}-border-width`]: v.borderWidth,
    [`${prefix}-radius`]: v.borderRadius,
    [`${prefix}-padding`]: v.padding,
    [`${prefix}-shadow`]: shadowToCSS(v.shadow ?? null),
  };
}

/**
 * Build the full set of CTA-related CSS variables. Includes both primary and
 * secondary plus legacy `--btn-*` aliases (which mirror primary) so older
 * section code that references `var(--btn-bg)` etc. keeps working.
 */
export function buildCtaCSSVars(sg: StyleGuide): Record<string, string> {
  const primary = resolvePrimaryVariant(sg);
  const secondary = resolveSecondaryVariant(sg);
  const primaryVars = variantToCSSVars(primary, sg.colors.primary, "--btn-primary");
  const secondaryVars = variantToCSSVars(secondary, sg.colors.secondary, "--btn-secondary");

  // Legacy aliases — point to the primary variant
  const legacyAliases: Record<string, string> = {
    "--btn-bg": primaryVars["--btn-primary-bg"],
    "--btn-text": primaryVars["--btn-primary-text"],
    "--btn-border-color": primaryVars["--btn-primary-border-color"],
    "--btn-radius": primaryVars["--btn-primary-radius"],
    "--btn-padding": primaryVars["--btn-primary-padding"],
  };

  return { ...primaryVars, ...secondaryVars, ...legacyAliases };
}

// ── Shared CSS rule block for the iframe + SSR ──────────────────────────────

/**
 * The CSS that applies the resolved tokens to `.cta-primary` / `.cta-secondary`
 * elements (and only those). Use `!important` to win against hardcoded Tailwind.
 */
export const CTA_CSS_RULES = `
  .cta-primary {
    background-color: var(--btn-primary-bg) !important;
    color: var(--btn-primary-text) !important;
    border: var(--btn-primary-border-width) solid var(--btn-primary-border-color) !important;
    border-radius: var(--btn-primary-radius) !important;
    padding: var(--btn-primary-padding) !important;
    box-shadow: var(--btn-primary-shadow) !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }
  .cta-secondary {
    background-color: var(--btn-secondary-bg) !important;
    color: var(--btn-secondary-text) !important;
    border: var(--btn-secondary-border-width) solid var(--btn-secondary-border-color) !important;
    border-radius: var(--btn-secondary-radius) !important;
    padding: var(--btn-secondary-padding) !important;
    box-shadow: var(--btn-secondary-shadow) !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }
  .cta-primary:hover { filter: brightness(0.92); transform: translateY(-1px); }
  .cta-secondary:hover { filter: brightness(0.96); transform: translateY(-1px); }
`;
