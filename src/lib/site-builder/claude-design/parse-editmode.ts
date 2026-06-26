/**
 * Parses the `/*EDITMODE-BEGIN*\/{ ... }/*EDITMODE-END*\/` block that every
 * Claude Design "*-tweaks.jsx" file uses to declare its theme defaults.
 *
 * The block content is a JSON object literal (quoted keys), e.g.
 *   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*\/{
 *     "fond": "#FAF6EF", "accent": "#5B9BD5", "police": "Éditorial", ...
 *   }/*EDITMODE-END*\/;
 *
 * We extract that object so the importer can seed `sites.tweaks` (and the
 * Tweaks panel) from the design's own defaults. Pure + side-effect free.
 */

export type TweaksDefaults = Record<string, unknown>;

const BEGIN = "/*EDITMODE-BEGIN*/";
const END = "/*EDITMODE-END*/";

/**
 * Returns the parsed EDITMODE object, or `{}` if the markers are missing or the
 * content is not valid JSON. Never throws.
 */
export function parseEditmode(jsxSource: string): TweaksDefaults {
  if (!jsxSource) return {};
  const start = jsxSource.indexOf(BEGIN);
  if (start === -1) return {};
  const from = start + BEGIN.length;
  const end = jsxSource.indexOf(END, from);
  if (end === -1) return {};

  const raw = jsxSource.slice(from, end).trim();
  // The block is `{ ... }`; isolate the first balanced object just in case
  // there is a trailing comma/semicolon after the marker on the same slice.
  const objStart = raw.indexOf("{");
  const objEnd = raw.lastIndexOf("}");
  if (objStart === -1 || objEnd === -1 || objEnd <= objStart) return {};

  try {
    const parsed = JSON.parse(raw.slice(objStart, objEnd + 1));
    return parsed && typeof parsed === "object" ? (parsed as TweaksDefaults) : {};
  } catch {
    return {};
  }
}

/**
 * Merges several EDITMODE blocks (index + per-service tweaks) into one defaults
 * object. Later sources only add keys they introduce (e.g. stepperStyle,
 * proStyle); shared theme keys keep the first (index) value.
 */
export function mergeTweaksDefaults(blocks: TweaksDefaults[]): TweaksDefaults {
  const out: TweaksDefaults = {};
  for (const block of blocks) {
    for (const [k, v] of Object.entries(block)) {
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}
