/**
 * Normalize a page fetched from a remote URL into self-contained HTML that the
 * import pipeline (`convertHtmlToSections`) can render faithfully.
 *
 * A live page is full of *relative* URLs (images, stylesheets, fonts) and
 * JS-driven lazy-loading — none of which survive when the markup is detached
 * from its origin and rendered as a static snapshot. This module rewrites every
 * reference to an absolute URL (against the page's base), promotes common
 * lazy-load attributes to real `src`/`srcset`, strips scripts, and absolutizes
 * `url(...)` inside inline styles and `<style>` blocks.
 *
 * It deliberately keeps external stylesheets as absolute `<link>` tags: CSS is
 * not CORS-restricted via `<link>`, and relative `url()` inside a stylesheet
 * resolves against the stylesheet's own origin — so the original design renders
 * without us having to fetch and inline every asset. (`extractPageAssets` in the
 * AI import step only keeps *absolute* links, so this absolutization is what
 * makes a URL import render with its real fonts and layout.)
 */
import { parse, type HTMLElement } from "node-html-parser";

export interface NormalizeResult {
  /** Normalized HTML, ready to feed to convertHtmlToSections. */
  html: string;
  /** Page <title>, if any (used to prefill the import form). */
  title: string | null;
  /** Human-readable notes about the snapshot (shown in the UI). */
  warnings: string[];
}

/** Attributes holding a single URL, per tag, that must be absolutized. */
const URL_ATTRS_BY_TAG: Record<string, string[]> = {
  img: ["src", "poster"],
  source: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  iframe: ["src"],
  embed: ["src"],
  track: ["src"],
  a: ["href"],
  link: ["href"],
  use: ["href", "xlink:href"],
  image: ["href", "xlink:href"],
  form: ["action"],
};

/** Lazy-load attributes that hide the real image until JS runs. */
const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url"];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset"];
const LAZY_BG_ATTRS = ["data-bg", "data-background", "data-background-image"];

/** Turn a possibly-relative URL into an absolute one against `base`. */
function absolutize(raw: string | undefined, base: string): string | undefined {
  if (raw == null) return raw;
  const s = raw.trim();
  if (!s) return raw;
  if (/^(data:|blob:|mailto:|tel:|javascript:|about:|#)/i.test(s)) return raw;
  try {
    return new URL(s, base).href;
  } catch {
    return raw;
  }
}

/** Absolutize each candidate in a `srcset` ("url 1x, url 640w, ..."). */
function absolutizeSrcset(value: string, base: string): string {
  return value
    .split(",")
    .map((part) => {
      const seg = part.trim();
      if (!seg) return "";
      const sp = seg.indexOf(" ");
      const url = sp === -1 ? seg : seg.slice(0, sp);
      const descriptor = sp === -1 ? "" : seg.slice(sp);
      return (absolutize(url, base) ?? url) + descriptor;
    })
    .filter(Boolean)
    .join(", ");
}

/** A src that is empty or an obvious placeholder (real image is in data-*). */
function isPlaceholderSrc(s: string | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  if (/^data:image\/(gif|svg\+xml)/i.test(t)) return true;
  if (/(placeholder|blank|spacer|lazy|1x1|pixel\.)/i.test(t)) return true;
  return false;
}

export function normalizeImportedHtml(rawHtml: string, pageUrl: string): NormalizeResult {
  const warnings: string[] = [];
  const root = parse(rawHtml, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true, pre: true },
  });

  // Resolve the effective base URL (page URL, overridden by <base href>).
  let base = pageUrl;
  const baseEl = root.querySelector("base[href]");
  if (baseEl) {
    const bh = baseEl.getAttribute("href");
    const abs = absolutize(bh, pageUrl);
    if (abs) base = abs;
  }

  // Strip elements that can't run in a static snapshot.
  root.querySelectorAll("script").forEach((n) => n.remove());
  root.querySelectorAll("noscript").forEach((n) => n.remove());
  root.querySelectorAll("base").forEach((n) => n.remove());

  let imgCount = 0;
  let cssLinks = 0;
  const styleBlocks = root.querySelectorAll("style").length;

  for (const el of root.querySelectorAll("*") as HTMLElement[]) {
    const tag = (el.rawTagName || "").toLowerCase();

    // Drop inline event handlers (onclick, onload, …).
    for (const name of Object.keys(el.attributes)) {
      if (/^on/i.test(name)) el.removeAttribute(name);
    }

    // Promote lazy-loaded media to real src/srcset before absolutizing.
    if (tag === "img" || tag === "source" || tag === "iframe") {
      const currentSrc = el.getAttribute("src");
      if (isPlaceholderSrc(currentSrc)) {
        for (const a of LAZY_SRC_ATTRS) {
          const v = el.getAttribute(a);
          if (v) {
            el.setAttribute("src", v);
            break;
          }
        }
      }
      if (!el.getAttribute("srcset")) {
        for (const a of LAZY_SRCSET_ATTRS) {
          const v = el.getAttribute(a);
          if (v) {
            el.setAttribute("srcset", v);
            break;
          }
        }
      }
      for (const a of LAZY_BG_ATTRS) {
        const v = el.getAttribute(a);
        if (v) {
          const prev = el.getAttribute("style") || "";
          el.setAttribute("style", `${prev}${prev ? ";" : ""}background-image:url(${v})`);
          break;
        }
      }
    }

    // Absolutize single-URL attributes for this tag.
    const attrs = URL_ATTRS_BY_TAG[tag];
    if (attrs) {
      for (const name of attrs) {
        const v = el.getAttribute(name);
        if (v != null) {
          const abs = absolutize(v, base);
          if (abs != null && abs !== v) el.setAttribute(name, abs);
        }
      }
    }

    // Absolutize srcset (img/source).
    const srcset = el.getAttribute("srcset");
    if (srcset) el.setAttribute("srcset", absolutizeSrcset(srcset, base));

    if (tag === "img") imgCount++;
    if (tag === "link" && /stylesheet/i.test(el.getAttribute("rel") || "")) cssLinks++;
  }

  // Absolutize url(...) and @import inside inline styles and <style> blocks, in
  // one pass over the serialized markup (covers both at once).
  let html = root.toString();
  html = html.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, u: string) => {
    const abs = absolutize(u, base);
    return `url(${q}${abs ?? u}${q})`;
  });
  html = html.replace(/@import\s+(['"])([^'"]+)\1/gi, (_m, q: string, u: string) => {
    const abs = absolutize(u, base);
    return `@import ${q}${abs ?? u}${q}`;
  });

  const titleRaw = root.querySelector("title")?.textContent?.trim();
  const title = titleRaw ? titleRaw.slice(0, 200) : null;

  if (imgCount > 0) {
    warnings.push(`${imgCount} image(s) liée(s) directement au site source (hotlink).`);
  }
  if (cssLinks === 0 && styleBlocks === 0) {
    warnings.push("Aucune feuille de style détectée — le rendu peut différer de l'original.");
  }

  return { html, title, warnings };
}
