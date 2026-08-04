/**
 * Extracts the Tweaks control schema from a Claude Design template's
 * `*-tweaks.jsx` files so the CRM panel reproduces EXACTLY the template's
 * controls (preset color swatches + selects + sliders + per-page radios)
 * instead of a generic color picker.
 *
 *  - theme controls come from `theme-tweaks.jsx` (the 6 TweakColor with their
 *    `*_OPTS` palettes, the 3 TweakSelect police/épaisseur/angles, the motif /
 *    flottement sliders + toggles, the navbar radio)
 *  - per-page extras come from each page's own `*-tweaks.jsx` (e.g.
 *    `service-tweaks.jsx` → the stepper/pro TweakRadio, the zone TweakSlider)
 *
 * Pure + side-effect free; regex-based (the files follow a regular shape).
 *
 * The tag matcher is deliberately OPEN: it takes every `<TweakXxx …/>` and only
 * then decides what it is. A closed whitelist silently dropped `<TweakSlider>`
 * — the four sliders the CVC export ships (intensité du motif, amplitude et
 * durée du flottement, rayon de la zone) never reached the panel, and neither
 * would any control type a future export introduces.
 */

export type TweakControlType = "color" | "select" | "radio" | "toggle" | "slider";

export interface TweakControl {
  key: string;
  type: TweakControlType;
  label: string;
  options: string[];
  /** Preceding <TweakSection label> header, for grouping in the panel. */
  group?: string;
  /** Slider bounds, from the JSX `min`/`max`/`step` props. */
  min?: number;
  max?: number;
  step?: number;
  /** Suffix printed after a slider's value ("px", "s", " km"). */
  unit?: string;
  /** Numeric fallback read from the control's own `value={…}` expression
   *  (`t.flotAmp != null ? t.flotAmp : 9`), used when the site has no value
   *  stored for the key yet. */
  defaultValue?: number;
}

export interface TweaksSchema {
  theme: TweakControl[];
  /** Per page slug → extra controls (stepper/pro/rayon…). */
  pageExtras: Record<string, TweakControl[]>;
}

/** Resolves `const NAME = [ "...", ... ];` array literals declared in the source. */
function namedArrays(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /const\s+(\w+)\s*=\s*(\[[\s\S]*?\])\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    try {
      const arr = JSON.parse(m[2]);
      if (Array.isArray(arr) && arr.every((v) => typeof v === "string")) out[m[1]] = arr;
    } catch { /* not a string array literal */ }
  }
  return out;
}

function attr(body: string, name: string): string | null {
  const m = body.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Reads a numeric JSX prop (`min={0}`, `step={0.5}`). */
function numProp(body: string, name: string): number | undefined {
  const m = body.match(new RegExp(`${name}=\\{\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\}`));
  return m ? Number(m[1]) : undefined;
}

/**
 * Numeric fallback baked into a slider's `value={…}` expression. Both shapes the
 * export uses end with a literal:
 *   value={t.motifIntensite == null ? 55 : t.motifIntensite}   → 55
 *   value={t.flotAmp != null ? t.flotAmp : 9}                  → 9
 *   value={t.rayonKm}                                          → undefined
 */
function defaultFromValueExpr(body: string): number | undefined {
  const m = body.match(/value=\{([\s\S]*?)\}/);
  if (!m) return undefined;
  const literals = m[1].match(/(?<![\w.])-?\d+(?:\.\d+)?/g);
  return literals && literals.length > 0 ? Number(literals[literals.length - 1]) : undefined;
}

const KNOWN_TYPES: Record<string, TweakControlType> = {
  Color: "color",
  Select: "select",
  Radio: "radio",
  Toggle: "toggle",
  Slider: "slider",
};

/** Best guess for a `<TweakXxx>` this parser has never seen, from its props. */
function inferType(body: string, hasOptions: boolean): TweakControlType {
  if (/\bmin=\{/.test(body) && /\bmax=\{/.test(body)) return "slider";
  if (hasOptions) return "radio";
  return "toggle";
}

/** Parses the Tweak* controls of one JSX source into an ordered control list. */
export function parseTweakControls(src: string): TweakControl[] {
  if (!src) return [];
  const arrays = namedArrays(src);
  const controls: TweakControl[] = [];
  let group: string | undefined;

  // `<Tweak` + an UPPERCASE letter: matches every control (TweakColor, …) while
  // leaving the panel components alone (`<TweaksPanel>`, lowercase "s").
  const re = /<Tweak([A-Z][A-Za-z]*)\b([\s\S]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const body = m[2];
    if (tag === "Section") {
      group = attr(body, "label") ?? group;
      continue;
    }
    const label = attr(body, "label") ?? "";
    const keyMatch = body.match(/setTweak\(\s*["'](\w+)["']/);
    const key = keyMatch ? keyMatch[1] : "";
    if (!key) continue;

    // options={IDENT} (resolve named array) OR options={["a","b"]} (inline)
    let options: string[] = [];
    const optMatch = body.match(/options=\{(\[[\s\S]*?\]|\w+)\}/);
    if (optMatch) {
      const expr = optMatch[1].trim();
      if (expr.startsWith("[")) {
        try { const arr = JSON.parse(expr); if (Array.isArray(arr)) options = arr.map(String); } catch { /* ignore */ }
      } else if (arrays[expr]) {
        options = arrays[expr];
      }
    }

    const type = KNOWN_TYPES[tag] ?? inferType(body, !!optMatch);
    const control: TweakControl = { key, type, label, options, group };
    if (type === "slider") {
      const min = numProp(body, "min");
      const max = numProp(body, "max");
      const step = numProp(body, "step");
      const unit = attr(body, "unit");
      const fallback = defaultFromValueExpr(body);
      if (min !== undefined) control.min = min;
      if (max !== undefined) control.max = max;
      if (step !== undefined) control.step = step;
      if (unit !== null) control.unit = unit;
      if (fallback !== undefined) control.defaultValue = fallback;
    }
    controls.push(control);
  }
  return controls;
}

/**
 * Builds the full schema from the bundle's jsx sources.
 * @param themeJsx        source of `theme-tweaks.jsx`
 * @param pageTweaksBySlug page slug → source of that page's `*-tweaks.jsx`
 */
export function buildTweaksSchema(
  themeJsx: string,
  pageTweaksBySlug: Record<string, string>,
): TweaksSchema {
  const theme = parseTweakControls(themeJsx);
  const themeKeys = new Set(theme.map((c) => c.key));
  const pageExtras: Record<string, TweakControl[]> = {};
  for (const [slug, src] of Object.entries(pageTweaksBySlug)) {
    // A page's own file references <ThemeControls/> (not the theme controls
    // themselves), so its Tweak* tags are only the extras. Filter defensively.
    const extras = parseTweakControls(src).filter((c) => !themeKeys.has(c.key));
    if (extras.length > 0) pageExtras[slug] = extras;
  }
  return { theme, pageExtras };
}

/** The numeric value a slider should show: the site's own, else the schema's
 *  baked-in fallback, else the low bound. Tolerates a value round-tripped as a
 *  string (a tweaks JSONB read back through an older writer). */
export function sliderValue(control: TweakControl, stored: unknown): number {
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  if (typeof stored === "string" && stored.trim() !== "") {
    const n = Number(stored);
    if (Number.isFinite(n)) return n;
  }
  if (control.defaultValue !== undefined) return control.defaultValue;
  return control.min ?? 0;
}
