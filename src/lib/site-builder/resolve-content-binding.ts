/**
 * resolveContentBinding — figures out which content key (and where) a clicked
 * iframe element should write to, WITHOUT any dependency on the section schema.
 *
 * Strategies, in priority order:
 *   1. field-id  — element carries an explicit `data-field-id` attribute
 *   2. direct    — content[key] === target value (text/src/href/placeholder)
 *   3. composite — content[key] is an object whose .label/.placeholder/.src matches
 *   4. pair      — legacy schemas store `xxxLabel` + sibling `xxxHref`/`xxx_href`
 *   5. override  — nothing found; the element is hardcoded in the section code
 */

import type { SectionBlockInstance } from "@/types";

export type ElementKind = "text" | "image" | "button" | "link" | "input" | "form";

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

function neighbourHrefKey(labelKey: string): string[] {
  return [
    `${labelKey}Href`,
    `${labelKey}_href`,
    `${labelKey}Url`,
    `${labelKey}_url`,
    labelKey.replace(/([Ll]abel|[Tt]ext)$/, "Href"),
    labelKey.replace(/([Ll]abel|[Tt]ext)$/, "_href"),
    labelKey.replace(/([Ll]abel|[Tt]ext)$/, "Url"),
  ];
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

  // 2. direct — string value match
  for (const key of keys) {
    if (matchesString(content[key], target)) {
      return { strategy: "direct", key, location: scope };
    }
  }

  // 3. composite — object whose subkey matches
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

  // 4. pair — legacy schemas: labelKey holds the text, neighbour holds the href
  if (element.kind === "button" || element.kind === "link") {
    for (const labelKey of keys) {
      if (!matchesString(content[labelKey], element.text)) continue;
      if (isHrefKey(labelKey)) continue;
      const href = element.attrs.href ?? "";
      const candidates = neighbourHrefKey(labelKey).filter((k) => k && k !== labelKey);
      let hrefKey: string | undefined;
      for (const cand of candidates) {
        if (Object.prototype.hasOwnProperty.call(content, cand)) {
          hrefKey = cand;
          if (matchesString(content[cand], href)) break;
        }
      }
      if (hrefKey) {
        return { strategy: "pair", labelKey, hrefKey, location: scope };
      }
      // Even without a matching href key, return pair with the most likely
      // neighbour name so the editor can create it on first edit.
      const fallbackHref = candidates.find((c) => /href$|Href$/.test(c)) ?? `${labelKey}Href`;
      return { strategy: "pair", labelKey, hrefKey: fallbackHref, location: scope };
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
