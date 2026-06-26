/**
 * Extracts the Tweaks control schema from a Claude Design template's
 * `*-tweaks.jsx` files so the CRM panel reproduces EXACTLY the template's
 * controls (preset color swatches + selects + per-page radios) instead of a
 * generic color picker.
 *
 *  - theme controls come from `theme-tweaks.jsx` (the 6 TweakColor with their
 *    `*_OPTS` palettes + the 3 TweakSelect police/épaisseur/angles)
 *  - per-page extras come from each page's own `*-tweaks.jsx` (e.g.
 *    `service-tweaks.jsx` → the stepper/pro TweakRadio)
 *
 * Pure + side-effect free; regex-based (the files follow a regular shape).
 */

export type TweakControlType = "color" | "select" | "radio";

export interface TweakControl {
  key: string;
  type: TweakControlType;
  label: string;
  options: string[];
  /** Preceding <TweakSection label> header, for grouping in the panel. */
  group?: string;
}

export interface TweaksSchema {
  theme: TweakControl[];
  /** Per page slug → extra controls (stepper/pro…). */
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

/** Parses the Tweak* controls of one JSX source into an ordered control list. */
export function parseTweakControls(src: string): TweakControl[] {
  if (!src) return [];
  const arrays = namedArrays(src);
  const controls: TweakControl[] = [];
  let group: string | undefined;

  const re = /<Tweak(Section|Color|Select|Radio)\b([\s\S]*?)\/>/g;
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

    controls.push({ key, type: tag.toLowerCase() as TweakControlType, label, options, group });
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
