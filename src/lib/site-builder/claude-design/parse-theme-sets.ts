/**
 * Reads the theme lookup tables out of a template's `theme-apply.js`.
 *
 * `apply-tweaks.ts` is a port of that script: it turns a tweak VALUE
 * (`police: "Chantier"`) into CSS variables (`--serif: "Archivo", …`). Its
 * tables used to be copied by hand, which held as long as there was one design.
 * The export now ships several skins, each with its OWN sets — "Chantier" for
 * Brut, "Agence" for Agency — so a hardcoded table silently falls back to the
 * Classique typeface and overwrites the skin's stylesheet with it. The panel
 * offers the right option, picking it changes nothing.
 *
 * So the tables travel with the design: parsed here at import time, stored in
 * `shared_assets.themeSets`, consulted first by `apply-tweaks`. The script
 * itself stays excluded from execution (`LOCAL_JS_DENYLIST`) — running it would
 * let localStorage clobber the operator's tweaks; only its data is taken.
 *
 * Parsing is done with a small object-literal reader rather than `eval` or a
 * JSON coercion: the values are single-quoted strings that CONTAIN double
 * quotes (`'"Archivo", system-ui, sans-serif'`) and the keys are unquoted, so
 * neither `JSON.parse` nor a regex rewrite survives contact with them.
 */

export interface FontSet {
  key: string;
  serif?: boolean;
  head: string;
  body: string;
  /** Google Fonts `family=` query payload. */
  g: string;
}

export interface WeightSet {
  key: string;
  head: string;
  body: string;
}

/** `[--r-img, --r-card, --r-pill]`. */
export type CornerSet = [string, string, string];

export interface ThemeSets {
  fontSets: Record<string, FontSet>;
  weightSets: Record<string, WeightSet>;
  cornerSets: Record<string, CornerSet>;
  /** `PATTERN_SLUGS` — motif label ("Quadrillé") → `html[data-pattern]` slug
   *  ("quadrille"). Only the skins that ship a patterns.css declare it. */
  patternSlugs?: Record<string, string>;
  /** `PATTERN_SCOPES` — portée label ("Claires") → `html[data-pattern-scope]`
   *  slug ("clair"). */
  patternScopes?: Record<string, string>;
}

type JsValue = string | number | boolean | null | JsValue[] | { [k: string]: JsValue };

/* ── a minimal JS object-literal reader ─────────────────────────────────── */

class Reader {
  private i = 0;
  constructor(private readonly src: string) {}

  private skip(): void {
    for (;;) {
      const c = this.src[this.i];
      if (c === undefined) return;
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { this.i++; continue; }
      if (c === "/" && this.src[this.i + 1] === "/") {
        const nl = this.src.indexOf("\n", this.i);
        this.i = nl < 0 ? this.src.length : nl + 1;
        continue;
      }
      if (c === "/" && this.src[this.i + 1] === "*") {
        const end = this.src.indexOf("*/", this.i + 2);
        this.i = end < 0 ? this.src.length : end + 2;
        continue;
      }
      return;
    }
  }

  private string(quote: string): string {
    this.i++; // opening quote
    let out = "";
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === "\\") {
        const next = this.src[this.i + 1];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next ?? "";
        this.i += 2;
        continue;
      }
      if (c === quote) { this.i++; return out; }
      out += c;
      this.i++;
    }
    throw new Error("chaîne non terminée");
  }

  private key(): string {
    this.skip();
    const c = this.src[this.i];
    if (c === '"' || c === "'") return this.string(c);
    const start = this.i;
    while (this.i < this.src.length && /[A-Za-z0-9_$]/.test(this.src[this.i])) this.i++;
    if (this.i === start) throw new Error("clé attendue");
    return this.src.slice(start, this.i);
  }

  value(): JsValue {
    this.skip();
    const c = this.src[this.i];
    if (c === undefined) throw new Error("valeur attendue");
    if (c === '"' || c === "'") return this.string(c);
    if (c === "{") return this.object();
    if (c === "[") return this.array();

    const start = this.i;
    while (this.i < this.src.length && !/[,}\]\s]/.test(this.src[this.i])) this.i++;
    const raw = this.src.slice(start, this.i);
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null" || raw === "undefined") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }

  private array(): JsValue[] {
    this.i++; // [
    const out: JsValue[] = [];
    for (;;) {
      this.skip();
      if (this.src[this.i] === "]") { this.i++; return out; }
      out.push(this.value());
      this.skip();
      if (this.src[this.i] === ",") { this.i++; continue; }
      if (this.src[this.i] === "]") { this.i++; return out; }
      throw new Error("« , » ou « ] » attendu");
    }
  }

  object(): { [k: string]: JsValue } {
    this.skip();
    if (this.src[this.i] !== "{") throw new Error("« { » attendu");
    this.i++;
    const out: { [k: string]: JsValue } = {};
    for (;;) {
      this.skip();
      if (this.src[this.i] === "}") { this.i++; return out; }
      const k = this.key();
      this.skip();
      if (this.src[this.i] !== ":") throw new Error("« : » attendu");
      this.i++;
      out[k] = this.value();
      this.skip();
      if (this.src[this.i] === ",") { this.i++; continue; }
      if (this.src[this.i] === "}") { this.i++; return out; }
      throw new Error("« , » ou « } » attendu");
    }
  }
}

/** Reads the object literal assigned to `NAME` (`var NAME = { … }`). */
function readTable(source: string, name: string): { [k: string]: JsValue } | null {
  const decl = new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*\\{`).exec(source);
  if (!decl) return null;
  try {
    return new Reader(source.slice(decl.index + decl[0].length - 1)).object();
  } catch {
    return null;
  }
}

function str(v: JsValue | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function toFontSets(raw: { [k: string]: JsValue } | null): Record<string, FontSet> {
  const out: Record<string, FontSet> = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as { [k: string]: JsValue };
    const head = str(v.head);
    const body = str(v.body);
    if (!head || !body) continue;
    out[name] = { key: str(v.key) ?? name.toLowerCase(), head, body, g: str(v.g) ?? "", serif: v.serif === true };
  }
  return out;
}

function toWeightSets(raw: { [k: string]: JsValue } | null): Record<string, WeightSet> {
  const out: Record<string, WeightSet> = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as { [k: string]: JsValue };
    const head = str(v.head) ?? (typeof v.head === "number" ? String(v.head) : null);
    const body = str(v.body) ?? (typeof v.body === "number" ? String(v.body) : null);
    if (!head || !body) continue;
    out[name] = { key: str(v.key) ?? name.toLowerCase(), head, body };
  }
  return out;
}

function toCornerSets(raw: { [k: string]: JsValue } | null): Record<string, CornerSet> {
  const out: Record<string, CornerSet> = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    if (!Array.isArray(value) || value.length < 3) continue;
    const [a, b, c] = value.map((x) => (typeof x === "string" ? x : String(x)));
    out[name] = [a, b, c];
  }
  return out;
}

/** `{ "Quadrillé": "quadrille", … }` — a flat label → slug map. */
function toSlugMap(raw: { [k: string]: JsValue } | null): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    const s = str(value);
    if (s) out[name] = s;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Extracts `FONT_SETS` / `WEIGHT_SETS` / `CORNER_SETS` (+ the optional
 * `PATTERN_SLUGS` / `PATTERN_SCOPES` of the skins that ship a patterns.css)
 * from a `theme-apply.js` source. Returns `null` when none of them is usable, so
 * the caller can keep the built-in fallbacks rather than store an empty table.
 */
export function parseThemeSets(source: string): ThemeSets | null {
  if (!source) return null;
  const sets: ThemeSets = {
    fontSets: toFontSets(readTable(source, "FONT_SETS")),
    weightSets: toWeightSets(readTable(source, "WEIGHT_SETS")),
    cornerSets: toCornerSets(readTable(source, "CORNER_SETS")),
  };
  const patternSlugs = toSlugMap(readTable(source, "PATTERN_SLUGS"));
  const patternScopes = toSlugMap(readTable(source, "PATTERN_SCOPES"));
  if (patternSlugs) sets.patternSlugs = patternSlugs;
  if (patternScopes) sets.patternScopes = patternScopes;
  const total =
    Object.keys(sets.fontSets).length + Object.keys(sets.weightSets).length + Object.keys(sets.cornerSets).length;
  return total > 0 ? sets : null;
}

/** Narrows an untrusted `shared_assets.themeSets` back into usable tables. */
export function coerceThemeSets(value: unknown): ThemeSets | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ThemeSets>;
  const sets: ThemeSets = {
    fontSets: toFontSets((v.fontSets ?? null) as { [k: string]: JsValue } | null),
    weightSets: toWeightSets((v.weightSets ?? null) as { [k: string]: JsValue } | null),
    cornerSets: toCornerSets((v.cornerSets ?? null) as { [k: string]: JsValue } | null),
  };
  const patternSlugs = toSlugMap((v.patternSlugs ?? null) as { [k: string]: JsValue } | null);
  const patternScopes = toSlugMap((v.patternScopes ?? null) as { [k: string]: JsValue } | null);
  if (patternSlugs) sets.patternSlugs = patternSlugs;
  if (patternScopes) sets.patternScopes = patternScopes;
  const total =
    Object.keys(sets.fontSets).length + Object.keys(sets.weightSets).length + Object.keys(sets.cornerSets).length;
  return total > 0 ? sets : null;
}
