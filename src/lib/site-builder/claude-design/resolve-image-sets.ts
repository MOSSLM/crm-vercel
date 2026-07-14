/**
 * Server-side resolution of "image set" overrides for raw Claude Design markup.
 *
 * An `:image_set` override holds several candidate images (fallbacks) tagged by
 * service. For the linked company we pick exactly ONE (best match against its
 * `service_tags`) and apply it to the target node like a normal image — an
 * `<img src>` or a background image on a `.ph` placeholder / bg element. The
 * other candidates only ever live in the override JSON, so the emitted HTML
 * contains a single image and **no residue** of the alternatives.
 *
 * Runs AFTER `applyOverridesToHTML` and BEFORE `conditionServiceMarkup`
 * (removals shift the positional child indices override paths are keyed to), so
 * this only ever changes attributes/inline style — never the tree shape.
 *
 * Path + root semantics mirror `apply-overrides-html.ts` exactly.
 */
import "server-only";
import { parse, type HTMLElement } from "node-html-parser";
import { parseImageSet, pickCandidate } from "./image-set";

const HEAD_ONLY_TAGS = new Set(["link", "meta", "script", "style", "noscript", "title", "base"]);

function findSectionRoot(elements: HTMLElement[]): HTMLElement | null {
  for (const el of elements) {
    const tag = (el.tagName ?? "").toLowerCase();
    if (!HEAD_ONLY_TAGS.has(tag)) return el;
  }
  return null;
}

function nodeAtPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: HTMLElement | null = root;
  for (const idx of path) {
    if (!node) return null;
    const children = node.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    if (!children[idx]) return null;
    node = children[idx];
  }
  return node;
}

/** Sets a cover/centered background image and marks a `.ph` placeholder filled
 *  (hide its dashed frame + waiting label). Mirrors `setBackgroundImage` in
 *  apply-overrides-html.ts. */
function applyBackground(el: HTMLElement, url: string): void {
  const current = el.getAttribute("style") ?? "";
  const declarations = [
    `background-image: url("${url.replace(/"/g, '\\"')}")`,
    "background-size: cover",
    "background-position: center",
    "background-repeat: no-repeat",
  ];
  const skip = /^background-(image|size|position|repeat)\s*:/i;
  const parts = current.split(";").map((s) => s.trim()).filter(Boolean).filter((p) => !skip.test(p));
  el.setAttribute("style", [...parts, ...declarations].join("; "));

  const cls = el.getAttribute("class") ?? "";
  if (/(^|\s)ph(\s|$)/.test(cls)) {
    if (!/(^|\s)has-img(\s|$)/.test(cls)) el.setAttribute("class", `${cls} has-img`.trim());
    const label = el.querySelector(".ph-label");
    if (label) {
      const ls = label.getAttribute("style") ?? "";
      label.setAttribute("style", `${ls ? ls.replace(/;\s*$/, "") + "; " : ""}display: none`);
    }
  }
}

/** Applies the chosen candidate url to a node: `<img>` → src, else background. */
function applyUrl(el: HTMLElement, url: string): void {
  if ((el.tagName ?? "").toLowerCase() === "img") {
    el.setAttribute("src", url);
  } else {
    applyBackground(el, url);
  }
}

/**
 * Resolves every `:image_set` override in `overrides` against the company's
 * service tags and applies the winning image to `html`. Returns the new HTML
 * (unchanged when there are no image sets). Pure + side-effect free.
 */
export function resolveImageSets(
  html: string,
  overrides: Record<string, { kind?: string; value?: string }> | undefined,
  enterpriseTags: string[],
): string {
  if (!html || !overrides) return html;
  const setKeys = Object.keys(overrides).filter((k) => k.endsWith(":image_set"));
  if (setKeys.length === 0) return html;

  try {
    const doc = parse(html);
    const elementChildren = doc.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    const root = findSectionRoot(elementChildren);
    if (!root) return html;

    for (const key of setKeys) {
      const entry = overrides[key];
      if (!entry || typeof entry.value !== "string") continue;
      const pathStr = key.slice(0, key.indexOf(":"));
      const path = pathStr.split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      const el = nodeAtPath(root, path);
      if (!el) continue;
      const { candidates } = parseImageSet(entry.value);
      const chosen = pickCandidate(candidates, enterpriseTags);
      if (chosen?.url) applyUrl(el, chosen.url);
    }

    return doc.toString();
  } catch {
    return html;
  }
}
