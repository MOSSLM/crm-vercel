/**
 * Server-only: applies content.__overrides to the SSR HTML produced by
 * renderSectionToHTML BEFORE it is shipped to the browser.
 *
 * The editor saves DOM-path overrides ("0.1.2.0:text", etc.) on each
 * section instance. The client hydrator already re-applies them after
 * hydration as a safety net, but applying them server-side guarantees:
 *
 * - First paint shows the edited content (no flash of default text).
 * - Crawlers and users with JS disabled see the correct content.
 * - Static export and Search Engine indexes capture the edited text.
 *
 * Path semantics mirror the iframe applicator and the client hydrator:
 * start at the section's root element (root.firstElementChild of the
 * container) and walk children by index.
 */
import "server-only";
import { parse, type HTMLElement } from "node-html-parser";
import { sanitizeRichText } from "@/lib/site-builder/sanitize-html";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";

export interface OverrideEntry {
  kind:
    | "text"
    | "rich_text"
    | "image"
    | "image_mobile"
    | "bg_image"
    | "link_href"
    | "button_href"
    | "attr"
    | "style";
  value: string;
  meta?: { attrName?: string; style?: Record<string, string> };
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

// React 19's react-dom/server emits resource hints (e.g. <link rel="preload">
// for images detected in the render tree) BEFORE the component output. Editor
// overrides reference DOM paths relative to the section's component root, so
// we must skip these head-only tags when locating it — otherwise the walker
// starts from <link>, finds no element children, and every override is silently
// dropped on the deployed site.
const HEAD_ONLY_TAGS = new Set(["link", "meta", "script", "style", "noscript", "title", "base"]);

function findSectionRoot(elements: HTMLElement[]): HTMLElement | null {
  for (const el of elements) {
    const tag = (el.tagName ?? "").toLowerCase();
    if (!HEAD_ONLY_TAGS.has(tag)) return el;
  }
  return null;
}

function setBackgroundImage(el: HTMLElement, url: string): void {
  const current = el.getAttribute("style") ?? "";
  const bg = url ? `url("${url.replace(/"/g, '\\"')}")` : "none";
  const declaration = `background-image: ${bg}`;
  if (!current.trim()) {
    el.setAttribute("style", declaration);
    return;
  }
  const parts = current.split(";").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p) => !/^background-image\s*:/i.test(p));
  filtered.push(declaration);
  el.setAttribute("style", filtered.join("; "));
}

export interface ApplyResult {
  html: string;
  applied: number;
  failed: number;
}

/** Applies overrides to the section HTML and returns the new HTML.
 *  Failures (missing element, malformed entry) are swallowed; the rest
 *  of the overrides still apply. */
export function applyOverridesToHTML(
  html: string,
  overrides: Record<string, OverrideEntry> | undefined,
  variables: Record<string, string>,
): ApplyResult {
  if (!html || !overrides || Object.keys(overrides).length === 0) {
    return { html, applied: 0, failed: 0 };
  }

  let applied = 0;
  let failed = 0;

  try {
    const doc = parse(html);
    // The HTML produced by renderToString for a section has the component's
    // root element as the first child — except React 19 may inject resource
    // hints (<link rel="preload">) ahead of it. findSectionRoot skips those.
    const elementChildren = doc.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    const root = findSectionRoot(elementChildren);
    if (!root) return { html, applied: 0, failed: 0 };

    for (const key of Object.keys(overrides)) {
      const entry = overrides[key];
      if (!entry || typeof entry.value !== "string") {
        failed++;
        continue;
      }
      const colonIdx = key.indexOf(":");
      const pathStr = colonIdx === -1 ? key : key.slice(0, colonIdx);
      const path = pathStr.split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      const el = nodeAtPath(root, path);
      if (!el) {
        failed++;
        continue;
      }
      const value = interpolateVars(entry.value, variables);
      try {
        switch (entry.kind) {
          case "text":
            el.set_content(escapeText(value));
            break;
          case "rich_text": {
            // Variables were already interpolated; sanitize then drop the
            // sanitized HTML straight into the element.
            const safe = sanitizeRichText(value);
            el.set_content(safe);
            break;
          }
          case "image":
            el.setAttribute("src", value);
            break;
          case "image_mobile":
            wrapImgWithMobileSource(el, value);
            break;
          case "bg_image":
            setBackgroundImage(el, value);
            break;
          case "link_href":
          case "button_href":
            el.setAttribute("href", value);
            break;
          case "attr":
            if (entry.meta?.attrName) {
              el.setAttribute(entry.meta.attrName, value);
            } else {
              failed++;
              continue;
            }
            break;
          case "style": {
            const styleMap = entry.meta?.style;
            if (!styleMap || typeof styleMap !== "object") {
              failed++;
              continue;
            }
            mergeStyles(el, styleMap);
            break;
          }
          default:
            failed++;
            continue;
        }
        applied++;
      } catch {
        failed++;
      }
    }

    return { html: doc.toString(), applied, failed };
  } catch {
    return { html, applied: 0, failed: Object.keys(overrides).length };
  }
}

/** Wraps the given `<img>` in a `<picture>` with a mobile-only `<source>`.
 *  If the img is already inside a `<picture>` we synthesised, refresh the
 *  source instead of nesting. Idempotent — safe to apply twice. */
function wrapImgWithMobileSource(el: HTMLElement, mobileUrl: string): void {
  if (el.tagName?.toLowerCase() !== "img") return;
  const parent = el.parentNode as HTMLElement | null;
  const isAlreadyPicture =
    parent && parent.tagName?.toLowerCase() === "picture" && parent.getAttribute("data-mobile-src-wrap") === "1";

  if (isAlreadyPicture && parent) {
    // Update existing source element
    const sources = parent.childNodes.filter((c) => c.nodeType === 1 && (c as HTMLElement).tagName?.toLowerCase() === "source") as HTMLElement[];
    const existing = sources.find((s) => s.getAttribute("data-mobile-source") === "1");
    if (existing) {
      if (mobileUrl) existing.setAttribute("srcset", mobileUrl);
      else existing.remove();
    } else if (mobileUrl) {
      const src = `<source media="(max-width: 767px)" srcset="${escapeAttr(mobileUrl)}" data-mobile-source="1">`;
      parent.insertAdjacentHTML?.("afterbegin", src);
    }
    return;
  }

  if (!mobileUrl) return; // nothing to wrap when clearing without an existing wrapper

  const imgHtml = el.outerHTML;
  const source = `<source media="(max-width: 767px)" srcset="${escapeAttr(mobileUrl)}" data-mobile-source="1">`;
  const wrapped = `<picture data-mobile-src-wrap="1">${source}${imgHtml}</picture>`;
  el.replaceWith(wrapped);
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Merge style declarations into the element's inline style attribute,
 *  overwriting existing properties when keys collide.
 *
 *  Override-provided properties are emitted with `!important` so per-element
 *  edits win over the style-guide CTA rules (`.cta-primary` etc. use
 *  `!important`) and hardcoded Tailwind utilities — Framer/Webflow-style.
 *  Pre-existing inline declarations keep their original priority, and the
 *  `!important` flag is parsed/stripped on read so re-applying is idempotent. */
function mergeStyles(el: HTMLElement, styles: Record<string, string>): void {
  const current = el.getAttribute("style") ?? "";
  const map: Record<string, { value: string; important: boolean }> = {};
  for (const decl of current.split(";")) {
    const [k, ...rest] = decl.split(":");
    const key = (k ?? "").trim();
    if (!key) continue;
    let value = rest.join(":").trim();
    let important = false;
    if (/!important\s*$/i.test(value)) {
      value = value.replace(/!important\s*$/i, "").trim();
      important = true;
    }
    map[key] = { value, important };
  }
  for (const [k, v] of Object.entries(styles)) {
    const kebab = camelToKebab(k);
    if (typeof v !== "string" || !v) {
      delete map[kebab];
      continue;
    }
    map[kebab] = { value: v, important: true };
  }
  const merged = Object.entries(map)
    .map(([k, { value, important }]) => `${k}: ${value}${important ? " !important" : ""}`)
    .join("; ");
  el.setAttribute("style", merged);
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
