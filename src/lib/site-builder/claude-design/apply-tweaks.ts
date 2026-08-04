/**
 * Pure port of the template's `theme-apply.js` so the CRM can apply a Claude
 * Design site's saved `tweaks` (the `cvc-theme` shape) at render time WITHOUT
 * shipping the operator script. Produces the same CSS custom properties + data
 * attributes that `applyTheme()` sets on `<html>`, plus the matching Google
 * Fonts link. Shared by the public renderer (server) and the Tweaks panel
 * (client live-preview).
 *
 * The FONT/WEIGHT/CORNER tables below are the ones the FIRST Claude design
 * shipped. They are only a fallback: the export now ships several skins, each
 * with its own sets ("Chantier" for Brut, "Agence" for Agency), so the real
 * tables are parsed from the design's `theme-apply.js` at import time and stored
 * in `shared_assets.themeSets` (see parse-theme-sets.ts). Every function here
 * takes those `sets` as an optional argument and prefers them — without it, a
 * skin's own typeface resolves to nothing and gets overwritten by Classique's.
 */
import type { ThemeSets, FontSet, WeightSet, CornerSet } from "./parse-theme-sets";

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

export const WEIGHT_SETS: Record<string, WeightSet> = {
  "Léger": { key: "leger", head: "300", body: "300" },
  "Normal": { key: "normal", head: "500", body: "400" },
  "Semi": { key: "semi", head: "600", body: "500" },
  "Gras": { key: "gras", head: "800", body: "600" },
};

export const CORNER_SETS: Record<string, CornerSet> = {
  "Zéro": ["0px", "0px", "0px"],
  "Net": ["4px", "5px", "8px"],
  "Doux": ["22px", "16px", "999px"],
  "Arrondi": ["34px", "24px", "999px"],
};

/** `theme-apply.js#PATTERN_SLUGS` — motif label → `html[data-pattern]` slug. */
export const PATTERN_SLUGS: Record<string, string> = {
  "Aucun": "aucun", "Quadrillé": "quadrille", "Millimétré": "millimetre",
  "Lignes": "lignes", "Lignes + croix": "lignes-croix", "Croix": "croix",
  "Points": "points", "Diagonales": "diagonales", "Mixte": "mixte",
};

/** `theme-apply.js#PATTERN_SCOPES` — portée label → `html[data-pattern-scope]`. */
export const PATTERN_SCOPES: Record<string, string> = {
  "Alternées": "alt", "Claires": "clair", "Tout": "tout",
};

/** Defaults `applyPatterns()` falls back to when the tweak is unset. */
const PATTERN_DEFAULT = "quadrille";
const PATTERN_SCOPE_DEFAULT = "clair";
const PATTERN_ALPHA_DEFAULT = 55;

const GOOGLE = "https://fonts.googleapis.com/css2?family=";

/* ── set resolution ─────────────────────────────────────────────────────────
 * A design's own tables win; the built-ins fill the gaps so a template imported
 * before `themeSets` existed keeps working, and so a skin that only redefines
 * some entries still resolves the shared ones. The final fallback is the first
 * entry of the design's own table rather than a hardcoded name — "Éditorial"
 * simply does not exist in the Agency skin.
 */

function pickSet<T>(
  table: Record<string, T> | undefined,
  builtin: Record<string, T>,
  name: unknown,
  builtinFallback: string,
): T {
  const merged = table && Object.keys(table).length > 0 ? { ...builtin, ...table } : builtin;
  const hit = typeof name === "string" ? merged[name] : undefined;
  if (hit) return hit;
  if (table && Object.keys(table).length > 0) return Object.values(table)[0];
  return merged[builtinFallback];
}

function fontSet(tweaks: Tweaks, sets?: ThemeSets | null): FontSet {
  return pickSet(sets?.fontSets, FONT_SETS, (tweaks || {}).police, "Éditorial");
}

function weightSet(tweaks: Tweaks, sets?: ThemeSets | null): WeightSet {
  return pickSet(sets?.weightSets, WEIGHT_SETS, (tweaks || {}).epaisseur, "Normal");
}

function cornerSet(tweaks: Tweaks, sets?: ThemeSets | null): CornerSet {
  return pickSet(sets?.cornerSets, CORNER_SETS, (tweaks || {}).angles, "Doux");
}

/** A numeric tweak (a TweakSlider), tolerating the string form a JSONB
 *  round-trip can produce. `null` when absent or unusable. */
export function tweakNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A TweakToggle whose CSS hook is PRESENCE-based, with the template's own
 *  default when the key is absent (`v.filets !== false` → ON by default). */
function flagOn(value: unknown, whenMissing: boolean): boolean {
  if (value === undefined || value === null || value === "") return whenMissing;
  return tweakEnabled(value);
}

/** Motif label → slug, preferring this skin's own table (patterns.css names). */
function patternSlug(name: unknown, sets?: ThemeSets | null): string {
  const table = { ...PATTERN_SLUGS, ...(sets?.patternSlugs ?? {}) };
  return (typeof name === "string" ? table[name] : undefined) ?? PATTERN_DEFAULT;
}

function patternScope(name: unknown, sets?: ThemeSets | null): string {
  const table = { ...PATTERN_SCOPES, ...(sets?.patternScopes ?? {}) };
  return (typeof name === "string" ? table[name] : undefined) ?? PATTERN_SCOPE_DEFAULT;
}

/**
 * Builds the CSS custom properties for a tweaks object — mirrors
 * `theme-apply.js#applyTheme`. Color vars are only set when present (so a
 * partial theme doesn't clobber the stylesheet defaults); corner/weight/font
 * always resolve (with the same fallbacks as the template).
 */
export function tweaksToCssVars(tweaks: Tweaks, sets?: ThemeSets | null): Record<string, string> {
  const v = tweaks || {};
  const vars: Record<string, string> = {};
  if (v.fond) vars["--cream"] = v.fond;
  if (v.fondAlt) vars["--cream-2"] = v.fondAlt;
  if (v.sable) vars["--sand"] = v.sable;
  if (v.sombre) vars["--night"] = v.sombre;
  if (v.accent) vars["--azur"] = v.accent;
  if (v.accentChaud) vars["--terra"] = v.accentChaud;

  const c = cornerSet(v, sets);
  vars["--r-img"] = c[0];
  vars["--r-card"] = c[1];
  vars["--r-pill"] = c[2];

  const w = weightSet(v, sets);
  vars["--w-head"] = w.head;
  vars["--w-body"] = w.body;

  const f = fontSet(v, sets);
  vars["--serif"] = f.head;
  vars["--sans"] = f.body;

  // Flottement des cartes — the two sliders styles.css animates `.float-cert` /
  // `.float-stat` with. Present-only, like the template: no value keeps the
  // stylesheet's own `:root{--fc-amp:9px;--fc-dur:6.5s}`.
  const amp = tweakNumber(v.flotAmp);
  if (amp !== null) vars["--fc-amp"] = `${amp}px`;
  const dur = tweakNumber(v.flotDur);
  if (dur !== null) vars["--fc-dur"] = `${dur}s`;

  // Motif de fond — `applyPatterns()` sets --pat-a unconditionally (0 → 1), so
  // the slider works from the very first paint. Skins with no patterns.css just
  // carry an unused variable.
  const alpha = tweakNumber(v.motifIntensite) ?? PATTERN_ALPHA_DEFAULT;
  vars["--pat-a"] = String(Math.round((alpha / 100) * 1000) / 1000);
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
 *  the navbar style, the motif/artefact hooks patterns.css gates on, plus the
 *  section-visibility flags the template's persistSections() toggles
 *  (`data-hide-certifs` / `data-hide-marques`, keyed by masquerCertifications /
 *  masquerMarques). Present-only: a flag is emitted only when ON, so the
 *  `html[data-hide-*]` CSS never matches while the section is shown. */
export function tweaksDataAttrs(tweaks: Tweaks, sets?: ThemeSets | null): Record<string, string> {
  const v = tweaks || {};
  const w = weightSet(v, sets);
  const f = fontSet(v, sets);
  const attrs: Record<string, string> = {
    "data-weight": w.key,
    "data-font": f.key,
    "data-font-serif": f.serif ? "1" : "0",
    // Barre de navigation (TweakRadio "Style de barre") — every skin ships the
    // `html[data-nav="flottante"]` rules; the attribute is always written, with
    // "classique" as the template's own fallback.
    "data-nav": v.navbar === "Flottante" ? "flottante" : "classique",
    // Motif de fond — `applyPatterns()` runs on every load, saved theme or not.
    "data-pattern": patternSlug(v.motif, sets),
    "data-pattern-scope": patternScope(v.motifPortee, sets),
  };
  // Artefacts: presence-based, ON by default (the template reads `!== false`),
  // except the column rules which are opt-in.
  if (flagOn(v.motifHero, true)) attrs["data-pattern-hero"] = "";
  if (flagOn(v.filets, true)) attrs["data-filets"] = "";
  if (flagOn(v.croixAngles, true)) attrs["data-croix"] = "";
  if (flagOn(v.colonnes, false)) attrs["data-colonnes"] = "";
  if (tweakEnabled(v.masquerCertifications)) attrs["data-hide-certifs"] = "";
  if (tweakEnabled(v.masquerMarques)) attrs["data-hide-marques"] = "";
  return attrs;
}

/** The Google Fonts stylesheet href for the tweaks' chosen typeface, or "" when
 *  the set carries no Google payload (a system stack needs no request). */
export function tweaksFontLinkHref(tweaks: Tweaks, sets?: ThemeSets | null): string {
  const f = fontSet(tweaks || {}, sets);
  return f.g ? `${GOOGLE}${f.g}&display=swap` : "";
}

/** Serialises the CSS vars + data attrs into an inline `style=""`/attrs string. */
export function tweaksInlineStyle(tweaks: Tweaks, sets?: ThemeSets | null): string {
  return Object.entries(tweaksToCssVars(tweaks, sets))
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
// Mobile "Affichage" of the solution stepper: a foldable card deck vs the
// default slides. Unlike stepperStyle/proStyle, the deck is BUILT by site.js
// (mdBuild) rather than toggled by a class, so we drive it through the runtime's
// __cvcStepperMobile hook (and seed the key it reads at init).
const STEPPER_MOBILE_MAP: Record<string, string> = { "Deck": "deck", "Slides": "slides" };

/**
 * Trusted inline-script body that applies the per-page section tweaks
 * (stepperStyle / stepperMobile / proStyle) and the zone-d'intervention radius
 * (rayonKm): seeds the localStorage keys the template reads and toggles the CSS
 * classes on `.solution-stepper` / `.pro-stage` (or calls the runtime hook, for
 * the mobile deck and the Leaflet circle, which JS builds).
 *
 * Emitted in TWO layers, because site.js reads those localStorage keys while it
 * initialises: the seeds run IMMEDIATELY (they touch no DOM), the element work
 * waits for DOMContentLoaded. Seeding inside the deferred half meant the stepper
 * and the map were first built with the wrong value and only corrected after.
 * No-op when the elements or values are absent. Returns JS (no tags).
 */
export function tweaksExtrasScript(tweaks: Tweaks): string {
  const stepper = STEPPER_STYLE_MAP[tweaks?.stepperStyle as string];
  const stepperMobile = STEPPER_MOBILE_MAP[tweaks?.stepperMobile as string];
  const pro = PRO_STYLE_MAP[tweaks?.proStyle as string];
  const rayonKm = tweakNumber(tweaks?.rayonKm);
  const seeds: string[] = [];
  const dom: string[] = [];
  if (stepper) {
    seeds.push(`try{localStorage.setItem('cvc-stepper-style', ${JSON.stringify(stepper)});}catch(e){}`);
    dom.push(`(function(){var s=document.querySelector('.solution-stepper');if(s){['framed','float','deck','wheel','wheel2'].forEach(function(k){s.classList.toggle('is-'+k, k===${JSON.stringify(stepper)});});}})();`);
  }
  if (stepperMobile) {
    seeds.push(`try{localStorage.setItem('cvc-stepper-mobile', ${JSON.stringify(stepperMobile)});}catch(e){}`);
    dom.push(`(function(){if(window.__cvcStepperMobile)window.__cvcStepperMobile(${JSON.stringify(stepperMobile)});})();`);
  }
  if (pro) {
    seeds.push(`try{localStorage.setItem('cvc-pro-style', ${JSON.stringify(pro)});}catch(e){}`);
    dom.push(`(function(){var p=document.querySelector('.pro-stage');if(p){p.classList.toggle('pro-mode-deck', ${JSON.stringify(pro)}==='deck');p.classList.toggle('pro-mode-slider', ${JSON.stringify(pro)}==='slider');}})();`);
  }
  if (rayonKm !== null && rayonKm > 0) {
    // site.js reads `cvc-zone-rayon` when it builds the Leaflet map, so the seed
    // alone is usually enough; the DOM half covers the map built before us and
    // the `{{ rayon }} km` labels, which exist with or without Leaflet.
    const km = JSON.stringify(rayonKm);
    seeds.push(`try{localStorage.setItem('cvc-zone-rayon', ${JSON.stringify(String(rayonKm))});}catch(e){}`);
    dom.push(
      `(function(){var e=document.getElementById('zone-leaflet');if(e)e.setAttribute('data-radius-km', ${km});` +
        `var l=document.querySelectorAll('[data-zone-km]');for(var i=0;i<l.length;i++)l[i].textContent=${km}+' km';` +
        `if(window.setZoneRadiusKm)window.setZoneRadiusKm(${km});})();`,
    );
  }
  if (seeds.length === 0 && dom.length === 0) return "";
  const deferred = dom.length
    ? `(function(){function r(){${dom.join("")}}` +
      `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',r);else r();})();`
    : "";
  return seeds.join("") + deferred;
}
