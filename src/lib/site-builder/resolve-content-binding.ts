/**
 * resolveContentBinding — figures out which content key (and where) a clicked
 * iframe element should write to, WITHOUT any dependency on the section schema.
 *
 * Strategies, in priority order:
 *   1. field-id  — element carries an explicit `data-field-id` attribute
 *   2. pair      — buttons/links only: legacy schemas store `xxxLabel` + sibling
 *                  `xxxHref`/`xxx_href`. Tried BEFORE `direct` because both match
 *                  the same plain string key: `direct` would bind the label alone
 *                  and silently drop the href on the next edit.
 *   3. direct    — content[key] === target value (text/src/href/placeholder)
 *   4. composite — content[key] is an object whose .label/.placeholder/.src matches
 *   5. override  — nothing found; the element is hardcoded in the section code
 */

import type { SectionBlockInstance } from "@/types";

export type ElementKind = "text" | "image" | "button" | "link" | "input" | "form" | "container";

export interface ElementClickInfo {
  kind: ElementKind;
  tag: string;
  text: string;
  path: number[];
  attrs: {
    src?: string;
    alt?: string;
    href?: string;
    target?: string;
    placeholder?: string;
    name?: string;
    inputType?: string;
    action?: string;
    method?: string;
  };
  fieldId: string | null;
}

export type BindingLocation = { scope: "instance" } | { scope: "block"; blockId: string };

export type BindingResult =
  | { strategy: "field-id"; key: string; location: BindingLocation }
  | { strategy: "direct"; key: string; location: BindingLocation }
  | { strategy: "composite"; key: string; location: BindingLocation }
  | { strategy: "pair"; labelKey: string; hrefKey: string; location: BindingLocation }
  | { strategy: "override"; pathStr: string };

function pickTarget(element: ElementClickInfo): string {
  switch (element.kind) {
    case "image": return element.attrs.src ?? "";
    case "link":
    case "button": return element.text;
    case "input": return element.attrs.placeholder ?? element.attrs.name ?? "";
    case "form": return element.attrs.action ?? "";
    case "text":
    default: return element.text;
  }
}

function isHrefKey(key: string): boolean {
  return /href$|_href$|Href$|url$|_url$|Url$/.test(key);
}

const LABEL_SUFFIX = /^(.*?)([Ll]abel|[Tt]ext)$/;

/**
 * The sibling key a label key pairs with, in the schema's own casing:
 *
 *   label        → href          (bare block shape)
 *   cta_text     → cta_href      (snake_case)
 *   primaryLabel → primaryHref   (camelCase)
 *
 * Casing matters: writing `cta_Href` next to an existing `cta_href` creates a
 * dead key the renderer never reads, so the edit silently does nothing.
 * Returns null when the key isn't named like a label at all.
 */
function canonicalSiblingKey(labelKey: string, kind: "href" | "url"): string | null {
  const match = labelKey.match(LABEL_SUFFIX);
  if (!match) return null;
  const prefix = match[1];
  if (prefix === "") return kind;
  if (prefix.endsWith("_")) return `${prefix}${kind}`;
  return `${prefix}${kind === "href" ? "Href" : "Url"}`;
}

/**
 * Every spelling worth probing for an existing sibling, best guess first. The
 * canonical forms lead; the older replacements and the naive appends follow as
 * a safety net for schemas that don't follow the convention.
 */
function neighbourHrefKey(labelKey: string): string[] {
  const seen = new Set<string>([labelKey]);
  const out: string[] = [];
  const push = (key: string | null) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  push(canonicalSiblingKey(labelKey, "href"));
  push(canonicalSiblingKey(labelKey, "url"));
  push(labelKey.replace(LABEL_SUFFIX, "$1Href"));
  push(labelKey.replace(LABEL_SUFFIX, "$1_href"));
  push(labelKey.replace(LABEL_SUFFIX, "$1Url"));
  push(`${labelKey}Href`);
  push(`${labelKey}_href`);
  push(`${labelKey}Url`);
  push(`${labelKey}_url`);

  return out;
}

function matchesString(value: unknown, target: string): boolean {
  if (typeof value !== "string" || !target) return false;
  if (value === target) return true;
  return value.trim() === target.trim();
}

function compositeSubkeyForKind(kind: ElementKind): string {
  switch (kind) {
    case "button":
    case "link": return "label";
    case "image": return "src";
    case "input": return "placeholder";
    case "form": return "action";
    default: return "label";
  }
}

function scan(
  scope: BindingLocation,
  content: Record<string, unknown>,
  element: ElementClickInfo,
): BindingResult | null {
  const target = pickTarget(element);
  const compositeKey = compositeSubkeyForKind(element.kind);
  const keys = Object.keys(content).filter((k) => !k.startsWith("__"));

  // 2. pair — legacy schemas: labelKey holds the text, neighbour holds the href.
  // Must run before `direct`, which would match the same label key and bind the
  // text only, losing the href.
  const pair = scanPair(scope, content, keys, element);
  if (pair) return pair;

  // 3. direct — string value match
  for (const key of keys) {
    if (matchesString(content[key], target)) {
      return { strategy: "direct", key, location: scope };
    }
  }

  // 4. composite — object whose subkey matches
  for (const key of keys) {
    const value = content[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sub = (value as Record<string, unknown>)[compositeKey];
      if (matchesString(sub, target)) {
        return { strategy: "composite", key, location: scope };
      }
      if (element.kind === "button" || element.kind === "link") {
        if (matchesString((value as Record<string, unknown>).href, element.attrs.href ?? "")) {
          return { strategy: "composite", key, location: scope };
        }
      }
    }
  }

  return null;
}

/**
 * Legacy `xxxLabel` + `xxxHref` pair, for buttons and links only. Returns null
 * for every other element kind, and for composite (object) values — those are
 * handled by the `composite` strategy.
 */
function scanPair(
  scope: BindingLocation,
  content: Record<string, unknown>,
  keys: string[],
  element: ElementClickInfo,
): BindingResult | null {
  if (element.kind !== "button" && element.kind !== "link") return null;

  for (const labelKey of keys) {
    if (!matchesString(content[labelKey], element.text)) continue;
    if (isHrefKey(labelKey)) continue;
    const href = element.attrs.href ?? "";

    // An existing key whose value IS the element's href is a certain match.
    // Otherwise fall back to the best-guess key that already exists — the first
    // one, not the last, since `candidates` is ordered best guess first.
    let hrefKey: string | undefined;
    for (const cand of neighbourHrefKey(labelKey)) {
      if (!Object.prototype.hasOwnProperty.call(content, cand)) continue;
      if (matchesString(content[cand], href)) {
        hrefKey = cand;
        break;
      }
      hrefKey ??= cand;
    }
    if (hrefKey) {
      return { strategy: "pair", labelKey, hrefKey, location: scope };
    }

    // No sibling exists yet. Naming one so the editor can create it on first
    // edit is only safe when the key is itself named like a button label —
    // `primaryLabel` implies a `primaryHref`. A plain text key that merely
    // happens to equal the button's caption (a `heading` reused as a CTA
    // label) implies nothing: inventing `headingHref` there would write to a
    // key no template reads, so leave those to `direct`.
    const canonical = canonicalSiblingKey(labelKey, "href");
    if (canonical) {
      return { strategy: "pair", labelKey, hrefKey: canonical, location: scope };
    }
  }

  return null;
}

export function resolveContentBinding(
  element: ElementClickInfo,
  content: Record<string, unknown>,
  blocks: SectionBlockInstance[] = [],
): BindingResult {
  // 1. field-id wins
  if (element.fieldId) {
    return { strategy: "field-id", key: element.fieldId, location: { scope: "instance" } };
  }

  const fromInstance = scan({ scope: "instance" }, content, element);
  if (fromInstance) return fromInstance;

  for (const block of blocks) {
    const fromBlock = scan({ scope: "block", blockId: block.id }, block.settings, element);
    if (fromBlock) return fromBlock;
  }

  return { strategy: "override", pathStr: element.path.join(".") };
}
