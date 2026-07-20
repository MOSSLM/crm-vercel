/**
 * Pure port of the template's `theme-apply.js` so the CRM can apply a Claude
 * Design site's saved `tweaks` (the `cvc-theme` shape) at render time WITHOUT
 * shipping the operator script. Produces the same CSS custom properties + data
 * attributes that `applyTheme()` sets on `<html>`, plus the matching Google
 * Fonts link. Shared by the public renderer (server) and the Tweaks panel
 * (client live-preview).
 *
 * Keep the FONT/WEIGHT/CORNER tables in sync with the template's theme-apply.js.
 */

export interface Tweaks {
  fond?: string;
  fondAlt?: string;
  sable?: string;
  sombre?: string;
  accent?: string;
  accentChaud?: string;
  police?: string;
  epaisseur?: string;
  angles?: string;
  /** Per-page extras (stepperStyle, proStyle, …) — not part of the theme vars. */
  [k: string]: unknown;
}

interface FontSet {
  key: string;
  serif?: boolean;
  head: string;
  body: string;
  /** Google Fonts `family=` query payload. */
  g: string;
}

export const FONT_SETS: Record<string, FontSet> = {
  "Éditorial": { key: "editorial", serif: true, head: '"Cormorant Garamond", Georgia, serif', body: '"DM Sans", system-ui, -apple-system, sans-serif', g: "Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700" },
  "Magazine": { key: "magazine", serif: true, head: '"Playfair Display", Georgia, serif', body: '"Source Sans 3", system-ui, sans-serif', g: "Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=Source+Sans+3:wght@300;400;500;600;700" },
  "Élégant": { key: "elegant", serif: true, head: '"Newsreader", Georgia, serif', body: '"Mulish", system-ui, sans-serif', g: "Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=Mulish:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400" },
  "Technique": { key: "technique", serif: true, head: '"IBM Plex Serif", Georgia, serif', body: '"IBM Plex Sans", system-ui, sans-serif', g: "IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Sans:wght@300;400;500;600;700" },
  "Moderne": { key: "moderne", head: '"Schibsted Grotesk", system-ui, sans-serif', body: '"Schibsted Grotesk", system-ui, sans-serif', g: "Schibsted+Grotesk:wght@300;400;500;600;700;800;900" },
  "Géométrique": { key: "geometrique", head: '"Poppins", system-ui, sans-serif', body: '"Poppins", system-ui, sans-serif', g: "Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500" },
  "Humaniste": { key: "humaniste", head: '"Bricolage Grotesque", system-ui, sans-serif', body: '"Mulish", system-ui, sans-serif', g: "Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Mulish:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400" },
  "Arrondi": { key: "arrondi", head: '"Quicksand", system-ui, sans-serif', body: '"Nunito Sans", system-ui, sans-serif', g: "Quicksand:wght@300;400;500;600;700&family=Nunito+Sans:opsz,wght@6..12,300;6..12,400;6..12,600;6..12,700;6..12,800" },
  "Net": { key: "net", head: '"Space Grotesk", system-ui, sans-serif', body: '"DM Sans", system-ui, -apple-system, sans-serif', g: "Space+Grotesk:wght@300;400;500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700" },
};

export const WEIGHT_SETS: Record<string, { key: string; head: string; body: string }> = {
  "Léger": { key: "leger", head: "300", body: "300" },
  "Normal": { key: "normal", head: "500", body: "400" },
  "Semi": { key: "semi", head: "600", body: "500" },
  "Gras": { key: "gras", head: "800", body: "600" },
};

export const CORNER_SETS: Record<string, [string, string, string]> = {
  "Zéro": ["0px", "0px", "0px"],
  "Net": ["4px", "5px", "8px"],
  "Doux": ["22px", "16px", "999px"],
  "Arrondi": ["34px", "24px", "999px"],
};

const GOOGLE = "https://fonts.googleapis.com/css2?family=";

/**
 * Builds the CSS custom properties for a tweaks object — mirrors
 * `theme-apply.js#applyTheme`. Color vars are only set when present (so a
 * partial theme doesn't clobber the stylesheet defaults); corner/weight/font
 * always resolve (with the same fallbacks as the template).
 */
export function tweaksToCssVars(tweaks: Tweaks): Record<string, string> {
  const v = tweaks || {};
  const vars: Record<string, string> = {};
  if (v.fond) vars["--cream"] = v.fond;
  if (v.fondAlt) vars["--cream-2"] = v.fondAlt;
  if (v.sable) vars["--sand"] = v.sable;
  if (v.sombre) vars["--night"] = v.sombre;
  if (v.accent) vars["--azur"] = v.accent;
  if (v.accentChaud) vars["--terra"] = v.accentChaud;

  const c = CORNER_SETS[v.angles as string] || CORNER_SETS["Doux"];
  vars["--r-img"] = c[0];
  vars["--r-card"] = c[1];
  vars["--r-pill"] = c[2];

  const w = WEIGHT_SETS[v.epaisseur as string] || WEIGHT_SETS["Normal"];
  vars["--w-head"] = w.head;
  vars["--w-body"] = w.body;

  const f = FONT_SETS[v.police as string] || FONT_SETS["Éditorial"];
  vars["--serif"] = f.head;
  vars["--sans"] = f.body;
  return vars;
}

/** Normalises a boolean-ish tweak value (a TweakToggle). The panel stores real
 *  booleans, but tolerate the string forms in case a value round-trips as text
 *  ("false" must read as OFF, not as a truthy non-empty string). */
export function tweakEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") { const s = value.trim().toLowerCase(); return s === "true" || s === "1" || s === "on"; }
  return false;
}

/** The `data-*` attributes theme-apply.js sets on <html>: the font/weight keys,
 *  plus the section-visibility flags the template's persistSections() toggles
 *  (`data-hide-certifs` / `data-hide-marques`, keyed by masquerCertifications /
 *  masquerMarques). Present-only: a flag is emitted only when ON, so the
 *  `html[data-hide-*]` CSS never matches while the section is shown. */
export function tweaksDataAttrs(tweaks: Tweaks): Record<string, string> {
  const v = tweaks || {};
  const w = WEIGHT_SETS[v.epaisseur as string] || WEIGHT_SETS["Normal"];
  const f = FONT_SETS[v.police as string] || FONT_SETS["Éditorial"];
  const attrs: Record<string, string> = {
    "data-weight": w.key,
    "data-font": f.key,
    "data-font-serif": f.serif ? "1" : "0",
  };
  if (tweakEnabled(v.masquerCertifications)) attrs["data-hide-certifs"] = "";
  if (tweakEnabled(v.masquerMarques)) attrs["data-hide-marques"] = "";
  return attrs;
}

/** The Google Fonts stylesheet href for the tweaks' chosen typeface. */
export function tweaksFontLinkHref(tweaks: Tweaks): string {
  const f = FONT_SETS[(tweaks || {}).police as string] || FONT_SETS["Éditorial"];
  return `${GOOGLE}${f.g}&display=swap`;
}

/** Serialises the CSS vars + data attrs into an inline `style=""`/attrs string. */
export function tweaksInlineStyle(tweaks: Tweaks): string {
  return Object.entries(tweaksToCssVars(tweaks))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/**
 * A tiny, trusted inline-script body that seeds `localStorage["cvc-theme"]`
 * before the runtime, so a returning visitor stays in sync. The visual theme is
 * already applied via CSS vars, so this is parity-only. Returns JS (no tags).
 */
export function seedThemeScript(tweaks: Tweaks): string {
  const json = JSON.stringify(tweaks || {});
  return `try{localStorage.setItem('cvc-theme', ${JSON.stringify(json)});}catch(e){}`;
}

// Per-page section tweaks → the style key + CSS class the template toggles
// (mirrors service-tweaks.jsx applyStepperStyle / applyProStyle).
const STEPPER_STYLE_MAP: Record<string, string> = {
  "Encadré": "framed", "Flottant": "float", "Pile": "deck", "Roue": "wheel", "Roue 2": "wheel2",
};
const PRO_STYLE_MAP: Record<string, string> = { "Deck": "deck", "Slider": "slider" };

/**
 * Trusted inline-script body that applies the per-page section tweaks
 * (stepperStyle / proStyle): seeds the localStorage keys the template reads and
 * toggles the CSS classes on `.solution-stepper` / `.pro-stage`. No-op when the
 * elements or values are absent. Returns JS (no tags).
 */
export function tweaksExtrasScript(tweaks: Tweaks): string {
  const stepper = STEPPER_STYLE_MAP[tweaks?.stepperStyle as string];
  const pro = PRO_STYLE_MAP[tweaks?.proStyle as string];
  const parts: string[] = [];
  if (stepper) {
    parts.push(`try{localStorage.setItem('cvc-stepper-style', ${JSON.stringify(stepper)});}catch(e){}`);
    parts.push(`(function(){var s=document.querySelector('.solution-stepper');if(s){['framed','float','deck','wheel','wheel2'].forEach(function(k){s.classList.toggle('is-'+k, k===${JSON.stringify(stepper)});});}})();`);
  }
  if (pro) {
    parts.push(`try{localStorage.setItem('cvc-pro-style', ${JSON.stringify(pro)});}catch(e){}`);
    parts.push(`(function(){var p=document.querySelector('.pro-stage');if(p){p.classList.toggle('pro-mode-deck', ${JSON.stringify(pro)}==='deck');p.classList.toggle('pro-mode-slider', ${JSON.stringify(pro)}==='slider');}})();`);
  }
  return parts.join("");
}
