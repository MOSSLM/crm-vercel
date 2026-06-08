/**
 * Slim a (potentially huge) imported page down to what the AI actually needs to
 * convert it into faithful TSX sections — without blowing the model's token
 * budget. Builder/exported pages (Framer, Webflow, etc.) ship hundreds of KB of
 * inline CSS, triplicated responsive markup, hydration JSON and scripts. None of
 * that is needed for the *structural* HTML→TSX conversion:
 *
 *  - the page stylesheet is captured + re-attached separately (extractPageAssets
 *    + injectStyles), so we drop <style>/<link>/<head> from the AI input;
 *  - imported pages are static snapshots, so <script>/<noscript> are dropped;
 *  - Framer renders one copy per breakpoint inside sibling `.ssr-variant`
 *    wrappers — we keep only the first of each run (one breakpoint is enough to
 *    reproduce the design, and it avoids generating the same section 3×);
 *  - a few large, non-visual attributes (hydration blob, editor labels) are
 *    stripped. Attributes used as CSS selectors (class, style, data-border,
 *    data-framer-component-type, …) are KEPT so the re-attached CSS still hits.
 *
 * This typically cuts a Framer homepage from ~500K chars to a few tens of KB.
 */
import { parse, HTMLElement } from "node-html-parser";

/** Tags removed entirely from the AI input. */
const DROP_TAGS = ["script", "style", "link", "meta", "noscript", "template", "head"];

/**
 * Large, non-visual attributes safe to drop. We deliberately DON'T touch
 * class/style or the data-* attributes that builder CSS targets as selectors
 * (data-border, data-framer-component-type, data-framer-page-link-current, …).
 */
const DROP_ATTRS = new Set([
  "data-framer-hydrate-v2",
  "data-framer-name",
  "data-styles-preset",
  "data-framer-ssr-released-at",
  "data-framer-page-optimized-at",
  "data-framer-search-index",
  "data-framer-search-index-fallback",
  "data-framer-appear-id",
]);

export interface SlimOptions {
  /** Keep <style>/<link> (paste-usable output). Default false (AI input). */
  keepStyles?: boolean;
}

export function slimImportHtml(html: string, opts: SlimOptions = {}): string {
  const root = parse(html, { comment: false });

  const dropTags = opts.keepStyles ? DROP_TAGS.filter((t) => t !== "style" && t !== "link" && t !== "head") : DROP_TAGS;
  for (const tag of dropTags) root.querySelectorAll(tag).forEach((n) => n.remove());

  // Framer's "made with Framer" badge — never part of the design.
  root.querySelectorAll("#__framer-badge-container").forEach((n) => n.remove());

  // Drop bulky non-visual attributes.
  for (const el of root.querySelectorAll("*")) {
    for (const name of Object.keys(el.attributes)) {
      if (DROP_ATTRS.has(name)) el.removeAttribute(name);
    }
  }

  // Collapse runs of sibling `.ssr-variant` wrappers to their first entry.
  for (const el of root.querySelectorAll("*")) {
    let prevWasVariant = false;
    for (const child of [...el.childNodes]) {
      if (!(child instanceof HTMLElement)) continue;
      const isVariant = /(^|\s)ssr-variant(\s|$)/.test(child.getAttribute("class") || "");
      if (isVariant && prevWasVariant) {
        child.remove();
      } else {
        prevWasVariant = isVariant;
      }
    }
  }

  return root.toString();
}

/**
 * Split a (slimmed) page into conversion-sized HTML chunks while preserving
 * section integrity: <section>/<header>/<footer> are kept whole; other
 * containers are recursed into until each block fits, then adjacent blocks are
 * packed into chunks ≤ maxLen. This lets the importer convert a large page in
 * several bounded AI calls instead of one that overflows the token budget.
 */
function collectBlocks(el: HTMLElement, out: HTMLElement[], maxLen: number): void {
  for (const child of el.childNodes) {
    if (!(child instanceof HTMLElement)) continue;
    const tag = (child.rawTagName || "").toLowerCase();
    if (tag === "section" || tag === "header" || tag === "footer") {
      out.push(child);
    } else if (child.toString().length <= maxLen) {
      out.push(child);
    } else {
      collectBlocks(child, out, maxLen);
    }
  }
}

export function splitForConversion(html: string, maxLen = 22000): string[] {
  const root = parse(html, { comment: false });
  const body = root.querySelector("body") ?? root;
  const blocks: HTMLElement[] = [];
  collectBlocks(body, blocks, maxLen);

  // Drop purely-decorative empty wrappers (overlays, spacers).
  const meaningful = blocks.filter((b) => {
    if (/<(img|svg|input|button|use|video|iframe)\b/i.test(b.toString())) return true;
    return (b.textContent || "").trim().length > 0;
  });

  const chunks: string[] = [];
  let cur = "";
  for (const b of meaningful) {
    const s = b.toString();
    if (cur && cur.length + s.length > maxLen) {
      chunks.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks.length > 0 ? chunks : [html];
}
