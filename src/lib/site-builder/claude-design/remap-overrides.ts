/**
 * Moves a page's inline `__overrides` from one version of its markup to another.
 *
 * Overrides are keyed by a POSITIONAL path (`"3.1.0:image"` — element-child
 * indices from the page root), so they only stay correct as long as the markup
 * around them does. Two flows need to carry them across a markup swap:
 *
 *   - re-importing a page from an updated ZIP (`import-pages/route.ts`), which
 *     used to wipe them and lose every photo the operator had placed;
 *   - copying the images of one template onto a sibling template
 *     (`copy-images/route.ts`) — the Claude export ships several variants whose
 *     bodies are identical, so a slot in "Classique" IS the same slot in "Brut".
 *
 * Strategy, per path:
 *   1. Fast path — the element at the SAME path in the target has the same
 *      signature. That is the nominal case (variants share their body markup,
 *      a re-export usually only touches copy/CSS), and it is exact.
 *   2. Fallback — find the element carrying the same signature at the same
 *      occurrence rank, and rewrite the path to it. Survives a section being
 *      inserted or removed ABOVE the slot.
 *   3. Otherwise the slot no longer exists: the key is reported as `dropped`
 *      rather than silently applied to whatever now sits at that position.
 *
 * A SIGNATURE deliberately ignores `src`/`style` (the same photo lives under a
 * different bucket URL in each template) and theme-only classes (`ph--azur`
 * changes between variants). It keeps what identifies the slot: the element and
 * its parent's structural classes, its id, its alt text, its service tag, and
 * the `.ph-label` description the design ships inside empty photo slots.
 *
 * Pure + DOM-free (node-html-parser), so it runs in API routes and unit tests.
 */
import { parse, type HTMLElement } from "node-html-parser";

export interface RemapResult<T> {
  /** The overrides, re-keyed for the target markup. */
  overrides: Record<string, T>;
  /** Keys whose slot could not be located in the target markup. */
  dropped: string[];
}

const ELEMENT_NODE = 1;

function elementChildren(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter((c) => c.nodeType === ELEMENT_NODE) as HTMLElement[];
}

/** Classes that carry no location meaning: theme variants and state flags.
 *  Mirrors `meaningfulClasses` in collect-image-placeholders.ts. */
function structuralClasses(el: HTMLElement): string[] {
  return (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => c !== "has-img" && !c.startsWith("ph--") && !c.startsWith("is-"))
    .sort();
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Identity of one element, stable across template variants and re-exports. */
function signatureOf(el: HTMLElement): string {
  const parent = el.parentNode as HTMLElement | null;
  const label = el.querySelector(".ph-label");
  return [
    el.tagName?.toLowerCase() ?? "",
    structuralClasses(el).join(" "),
    el.getAttribute("id") ?? "",
    collapse(el.getAttribute("alt") ?? ""),
    el.getAttribute("data-svc") ?? el.getAttribute("data-service-tag") ?? "",
    label ? collapse(label.text) : "",
    parent ? `${parent.tagName?.toLowerCase() ?? ""}.${structuralClasses(parent).join(" ")}` : "",
  ].join("|");
}

interface DocIndex {
  /** dotted path → signature */
  sigByPath: Map<string, string>;
  /** signature → dotted paths, in document order */
  pathsBySig: Map<string, string[]>;
}

/** Walks every element of a page body once, indexing it both ways. */
function indexDocument(html: string): DocIndex {
  const sigByPath = new Map<string, string>();
  const pathsBySig = new Map<string, string[]>();
  const root = parse(html) as unknown as HTMLElement;

  const walk = (node: HTMLElement, path: number[]): void => {
    const kids = elementChildren(node);
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      const childPath = [...path, i];
      const key = childPath.join(".");
      const sig = signatureOf(child);
      sigByPath.set(key, sig);
      const list = pathsBySig.get(sig);
      if (list) list.push(key);
      else pathsBySig.set(sig, [key]);
      walk(child, childPath);
    }
  };
  walk(root, []);

  return { sigByPath, pathsBySig };
}

/** Splits `"3.1.0:image"` into its path and kind. */
export function splitOverrideKey(key: string): { path: string; kind: string } {
  const i = key.lastIndexOf(":");
  return i < 0 ? { path: key, kind: "" } : { path: key.slice(0, i), kind: key.slice(i + 1) };
}

/**
 * Re-keys `overrides` (written against `fromHtml`) so they apply to `toHtml`.
 * Entries are carried over untouched — only their path changes.
 */
export function remapOverrides<T>(
  fromHtml: string,
  toHtml: string,
  overrides: Record<string, T>,
): RemapResult<T> {
  const keys = Object.keys(overrides ?? {});
  if (keys.length === 0) return { overrides: {}, dropped: [] };

  const from = indexDocument(fromHtml);
  const to = indexDocument(toHtml);

  // One path can carry several keys (":image" + ":remove"): resolve it once.
  const resolved = new Map<string, string | null>();
  const resolvePath = (path: string): string | null => {
    if (resolved.has(path)) return resolved.get(path)!;

    const sig = from.sigByPath.get(path);
    let next: string | null = null;
    if (sig !== undefined) {
      if (to.sigByPath.get(path) === sig) {
        next = path; // (1) same position, same element.
      } else {
        // (2) same element, moved: match on occurrence rank among twins.
        const rank = (from.pathsBySig.get(sig) ?? []).indexOf(path);
        const candidates = to.pathsBySig.get(sig) ?? [];
        next = rank >= 0 && candidates.length > rank ? candidates[rank] : null;
      }
    }
    resolved.set(path, next);
    return next;
  };

  const out: Record<string, T> = {};
  const dropped: string[] = [];
  for (const key of keys) {
    const { path, kind } = splitOverrideKey(key);
    const next = resolvePath(path);
    if (next === null) dropped.push(key);
    else out[kind ? `${next}:${kind}` : next] = overrides[key];
  }
  return { overrides: out, dropped };
}
