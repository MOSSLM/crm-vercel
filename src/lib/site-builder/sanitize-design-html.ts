/**
 * Sanitises a full HTML page exported from "Claude design" (or any
 * hand-authored design) so it can be hosted as a single faithful "raw"
 * whole-page section — WITHOUT the site builder decomposing it into sections
 * or imposing its managed coherence layer.
 *
 * What it does:
 *  - Strips <script>/<noscript> and inline event handlers (on*) + javascript:
 *    URLs. The design is operator-provided but still ends up in
 *    dangerouslySetInnerHTML on the public site, so we keep it script-free.
 *  - Preserves the design's own look: <style> blocks and font/stylesheet
 *    <link>s from <head> are kept (prepended), and the <body> markup is kept
 *    verbatim. Tailwind utility classes still resolve via the page's Tailwind
 *    CDN fallback (see DynamicPageRenderer) and the editor iframe.
 *  - Collects referenced <img> URLs (for optional re-hosting later).
 *
 * The result is a single HTML fragment string, ready to be wrapped by
 * wrap-raw-html.ts into a one-component "raw" library section.
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";

export interface SanitizedDesign {
  /** Combined `<style>/<link>` (from head) + body markup, scripts removed. */
  html: string;
  /** Best-effort page title (from <title>), for the site name default. */
  title: string;
  /** Distinct image URLs referenced by <img src> (for optional re-hosting). */
  imageUrls: string[];
}

const FONT_HINTS = ["fonts.googleapis", "fonts.gstatic", "typekit", "use.fontawesome"];

function keepLink(link: HTMLElement): boolean {
  const rel = (link.getAttribute("rel") ?? "").toLowerCase();
  const href = (link.getAttribute("href") ?? "").toLowerCase();
  if (rel.includes("stylesheet")) return true;
  if (rel.includes("preconnect") || rel.includes("dns-prefetch") || rel.includes("preload")) return true;
  return FONT_HINTS.some((h) => href.includes(h));
}

/** Depth-first walk over element nodes (nodeType === 1). */
function walkElements(node: Node, visit: (el: HTMLElement) => void): void {
  for (const child of node.childNodes) {
    if (child.nodeType === 1) {
      const el = child as HTMLElement;
      visit(el);
      walkElements(el, visit);
    }
  }
}

export function sanitizeDesignHtml(rawHtml: string): SanitizedDesign {
  const root = parse(rawHtml, {
    // Keep script/style/pre content opaque so JS/CSS isn't misparsed as HTML.
    blockTextElements: { script: true, noscript: true, style: true, pre: true },
  });

  // 1) Remove scripts + neutralise inline handlers / javascript: URLs.
  root.querySelectorAll("script, noscript").forEach((el) => el.remove());
  walkElements(root, (el) => {
    for (const name of Object.keys(el.attributes)) {
      if (/^on/i.test(name)) el.removeAttribute(name);
    }
    const href = el.getAttribute("href");
    if (href && /^\s*javascript:/i.test(href)) el.setAttribute("href", "#");
    const src = el.getAttribute("src");
    if (src && /^\s*javascript:/i.test(src)) el.removeAttribute("src");
  });

  const title = root.querySelector("title")?.text?.trim() || "Design Claude";

  // 2) Preserve head <style>/<link> (the design's own CSS + fonts).
  const head = root.querySelector("head");
  const headBits: string[] = [];
  if (head) {
    head.querySelectorAll("style").forEach((s) => headBits.push(s.toString()));
    head.querySelectorAll("link").forEach((l) => {
      if (keepLink(l)) headBits.push(l.toString());
    });
  }

  // 3) Body markup verbatim (styles inside body are already part of it).
  const body = root.querySelector("body");
  const bodyHtml = body ? body.innerHTML : root.toString();

  // 4) Collect referenced images.
  const imageUrls = Array.from(
    new Set(
      root
        .querySelectorAll("img")
        .map((img) => img.getAttribute("src") ?? "")
        .filter((s) => s && !s.startsWith("data:")),
    ),
  );

  const html = [...headBits, bodyHtml].filter(Boolean).join("\n");
  return { html, title, imageUrls };
}
