/**
 * Finds the "twin" image slots of a Claude Design page — the duplicate copies a
 * scrolling logo strip ("marque partenaire" marquee) ships so its CSS loop can
 * translate the track by -50% seamlessly. The strip repeats the WHOLE set of
 * logos, so one visible logo maps to 2+ `<img>` slots at different positions.
 *
 * The inline editor keys every image edit to a positional path, so without this
 * an operator has to upload the same logo once per copy. `findLinkedSlots` maps
 * a slot to the sibling slots that should mirror its edits, so a single upload
 * fills them all.
 *
 * This is the isomorphic, testable twin of the `linkedSlots` helper inlined in
 * `InlinePreview`'s EDIT_SCRIPT (which does the same on the live iframe DOM) —
 * same relationship as `image-set.ts` ↔ the inline `__cdPickCandidate`. Keep the
 * two rules in sync.
 *
 * Pairing rule (order matters):
 *   1. Class identity — a twin is a sibling whose class list equals the target's
 *      EXACTLY, but only when that class carries a per-item token (e.g. `b1`)
 *      that isn't shared by every sibling. This nails the logo strip (each brand
 *      is `brand-logo bN`, present twice) while never syncing a plain grid of
 *      identically-classed `<img>` (every sibling shares the same tokens → no
 *      distinguishing token → no match).
 *   2. Positional halves — an even, doubled track (child i mirrors i + half),
 *      used only when the container reads as a marquee (its class or its parent's
 *      mentions marquee/ticker/track/…), so ordinary grids are left alone.
 */
import { parse, type HTMLElement } from "node-html-parser";

const ELEMENT_NODE = 1;
const MARQUEE_CTX = /marquee|ticker|defil|scroll|track/i;

function elementChildren(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter((c) => c.nodeType === ELEMENT_NODE) as HTMLElement[];
}

function classTokens(el: HTMLElement): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function classKey(el: HTMLElement): string {
  return classTokens(el).slice().sort().join(" ");
}

/** Element-child index path from `root` to `el` (matches the runtime + overrides). */
export function pathOf(el: HTMLElement, root: HTMLElement): number[] {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    const parent = cur.parentNode as HTMLElement | null;
    if (!parent) break;
    path.unshift(elementChildren(parent).indexOf(cur));
    cur = parent;
  }
  return path;
}

/** Walks element children by index from `root`. Returns null on any miss. */
export function nodeAt(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: HTMLElement | null = root;
  for (const idx of path) {
    if (!node) return null;
    node = elementChildren(node)[idx] ?? null;
  }
  return node;
}

/** Returns the sibling slots that mirror `el` (excluding `el` itself). */
export function findLinkedSlots(el: HTMLElement): HTMLElement[] {
  const par = el.parentNode as HTMLElement | null;
  if (!par) return [];
  const kids = elementChildren(par);
  if (kids.length < 4) return [];

  // (1) Class identity with a per-item distinguishing token.
  const myTokens = classTokens(el);
  if (myTokens.length > 0) {
    const counts: Record<string, number> = {};
    for (const k of kids) {
      const seen = new Set<string>();
      for (const tok of classTokens(k)) {
        if (!seen.has(tok)) {
          seen.add(tok);
          counts[tok] = (counts[tok] ?? 0) + 1;
        }
      }
    }
    const distinguishing = myTokens.some((tok) => counts[tok] > 0 && counts[tok] < kids.length);
    if (distinguishing) {
      const myKey = classKey(el);
      const twins = kids.filter((k) => k !== el && classKey(k) === myKey);
      if (twins.length > 0) return twins;
    }
  }

  // (2) Positional halves inside a marquee-ish track.
  const ctx = `${par.getAttribute("class") ?? ""} ${(par.parentNode as HTMLElement | null)?.getAttribute?.("class") ?? ""}`;
  if (MARQUEE_CTX.test(ctx) && kids.length % 2 === 0) {
    const idx = kids.indexOf(el);
    if (idx >= 0) {
      const twin = kids[(idx + kids.length / 2) % kids.length];
      if (twin && twin !== el && twin.tagName === el.tagName) return [twin];
    }
  }
  return [];
}

/** Convenience for tests / server code: resolve the target by path, return the
 *  paths of its linked slots (empty if the path misses or the slot has no twin). */
export function findLinkedSlotPaths(html: string, targetPath: number[]): number[][] {
  const root = parse(html);
  const el = nodeAt(root as unknown as HTMLElement, targetPath);
  if (!el) return [];
  return findLinkedSlots(el).map((s) => pathOf(s, root as unknown as HTMLElement));
}
