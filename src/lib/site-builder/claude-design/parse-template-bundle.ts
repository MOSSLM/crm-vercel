/**
 * Parses a multi-file Claude Design export into the pieces the importer needs.
 *
 * Input: the already-extracted files of the export (the ZIP is unpacked by the
 * caller — see import-bundle/route.ts — so this module stays pure + testable).
 *
 * Output (`ParsedBundle`):
 *  - pages:      one entry per `*.html` (body markup with scripts stripped, slug,
 *                title, service tag, and the page's font/CDN <link>s)
 *  - sharedCss:  `theme-tokens.css` + `styles.css` (+ any other .css) concatenated
 *  - fontLinks:  deduped remote stylesheet/font/leaflet <link> hrefs across pages
 *  - images:     the binary image files, with their template-relative path
 *  - tweaksDefaults: merged `/*EDITMODE*\/` theme defaults from the *-tweaks.jsx
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { parseEditmode, mergeTweaksDefaults, type TweaksDefaults } from "./parse-editmode";
import { fileNameToSlug } from "./rewrite-asset-paths";

export interface BundleInputFile {
  /** Path inside the export, e.g. "index.html" or "images/hero.jpg". */
  path: string;
  bytes: Uint8Array;
  mime?: string;
}

export interface BundlePage {
  fileName: string;
  slug: string;
  title: string;
  /** Body markup, scripts/handlers stripped, head <style> prepended. */
  html: string;
  /** Service tag derived from the file name (service-<tag>.html), else null. */
  serviceTag: string | null;
  fontLinks: string[];
  /** The page-specific `*-tweaks.jsx` it referenced (e.g. "index-tweaks.jsx"),
   *  excluding the shared theme-tweaks.jsx / tweaks-panel.jsx. Used to build the
   *  per-page Tweaks schema. */
  tweaksFile: string | null;
}

export interface BundleImage {
  path: string;
  bytes: Uint8Array;
  mime: string;
}

export interface ParsedBundle {
  pages: BundlePage[];
  sharedCss: string;
  fontLinks: string[];
  images: BundleImage[];
  tweaksDefaults: TweaksDefaults;
  /** Raw source of every `*.jsx` in the bundle, keyed by lowercased basename
   *  (e.g. "theme-tweaks.jsx", "service-tweaks.jsx"). Feeds parse-tweaks-schema. */
  tweaksJsx: Record<string, string>;
}

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

const FONT_HINTS = ["fonts.googleapis", "fonts.gstatic", "typekit", "use.fontawesome", "leaflet", "unpkg", "cdn"];

function ext(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function baseName(path: string): string {
  return path.replace(/^.*\//, "");
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Service tag from a page file name: service-<tag>.html → "<tag>", else null. */
function serviceTagFromFile(fileName: string): string | null {
  const base = baseName(fileName).replace(/\.html?$/i, "");
  const m = base.match(/^service-(.+)$/);
  return m ? m[1] : null;
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

function keepRemoteLink(link: HTMLElement): boolean {
  const rel = (link.getAttribute("rel") ?? "").toLowerCase();
  const href = (link.getAttribute("href") ?? "").toLowerCase();
  if (!href.startsWith("http")) return false; // local stylesheets are dropped (CSS is injected)
  if (rel.includes("stylesheet")) return true;
  if (rel.includes("preconnect") || rel.includes("dns-prefetch") || rel.includes("preload")) return true;
  return FONT_HINTS.some((h) => href.includes(h));
}

interface ParsedPage {
  title: string;
  html: string;
  fontLinks: string[];
  tweaksFile: string | null;
}

const SHARED_TWEAKS = new Set(["theme-tweaks.jsx", "tweaks-panel.jsx"]);

/** Extracts body markup + head styles/font links from a full HTML page. */
function parsePageHtml(rawHtml: string): ParsedPage {
  const root = parse(rawHtml, {
    blockTextElements: { script: true, noscript: true, style: true, pre: true },
  });

  // Before stripping, note the page-specific *-tweaks.jsx referenced (excluding
  // the shared theme-tweaks.jsx / tweaks-panel.jsx) — drives the per-page schema.
  let tweaksFile: string | null = null;
  root.querySelectorAll("script").forEach((s) => {
    const src = (s.getAttribute("src") ?? "").replace(/^.*\//, "").toLowerCase();
    if (src.endsWith("-tweaks.jsx") && !SHARED_TWEAKS.has(src)) tweaksFile = src;
  });

  // Strip scripts + inline handlers / javascript: URLs (the template's own JS is
  // re-implemented by the trusted runtime; nothing operator-authored is kept).
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

  const head = root.querySelector("head");
  const fontLinks: string[] = [];
  const headStyles: string[] = [];
  if (head) {
    head.querySelectorAll("style").forEach((s) => headStyles.push(s.toString()));
    head.querySelectorAll("link").forEach((l) => {
      if (keepRemoteLink(l)) {
        const href = l.getAttribute("href");
        if (href) fontLinks.push(href);
      }
    });
  }

  const body = root.querySelector("body");
  const bodyHtml = body ? body.innerHTML : root.toString();
  const html = [...headStyles, bodyHtml].filter(Boolean).join("\n");
  return { title, html, fontLinks, tweaksFile };
}

/**
 * Parses the extracted files of a Claude Design export. Order of CSS matters:
 * theme-tokens.css (CSS variables) is placed before styles.css (consumers).
 */
export function parseTemplateBundle(files: BundleInputFile[]): ParsedBundle {
  const pages: BundlePage[] = [];
  const images: BundleImage[] = [];
  const cssByName = new Map<string, string>();
  const editmodeBlocks: TweaksDefaults[] = [];
  const allFontLinks = new Set<string>();
  const tweaksJsx: Record<string, string> = {};

  for (const file of files) {
    const e = ext(file.path);
    const name = baseName(file.path).toLowerCase();
    if (name.startsWith(".") || name.startsWith("__")) continue; // skip dotfiles / metadata

    if (e === "html" || e === "htm") {
      const parsed = parsePageHtml(decodeText(file.bytes));
      const fileName = baseName(file.path);
      for (const href of parsed.fontLinks) allFontLinks.add(href);
      pages.push({
        fileName,
        slug: fileNameToSlug(fileName),
        title: parsed.title,
        html: parsed.html,
        serviceTag: serviceTagFromFile(fileName),
        fontLinks: parsed.fontLinks,
        tweaksFile: parsed.tweaksFile,
      });
    } else if (e === "css") {
      cssByName.set(name, decodeText(file.bytes));
    } else if (e === "jsx") {
      const src = decodeText(file.bytes);
      tweaksJsx[name] = src;
      // Only *-tweaks.jsx carry an EDITMODE defaults block; others return {}.
      editmodeBlocks.push(parseEditmode(src));
    } else if (IMAGE_EXT_MIME[e]) {
      images.push({ path: file.path, bytes: file.bytes, mime: file.mime || IMAGE_EXT_MIME[e] });
    }
    // .js (site.js, theme-apply.js, …) intentionally ignored — re-implemented
    // by the trusted CLAUDE_DESIGN_RUNTIME at render time.
  }

  // Concatenate CSS: variables first, then the main stylesheet, then the rest.
  const cssOrder = ["theme-tokens.css", "styles.css"];
  const seen = new Set<string>();
  const cssParts: string[] = [];
  for (const n of cssOrder) {
    if (cssByName.has(n)) { cssParts.push(cssByName.get(n)!); seen.add(n); }
  }
  for (const [n, css] of cssByName) {
    if (!seen.has(n)) cssParts.push(css);
  }

  // index page first, then alphabetical by slug for stable ordering.
  pages.sort((a, b) => (a.slug === "/" ? -1 : b.slug === "/" ? 1 : a.slug.localeCompare(b.slug)));

  return {
    pages,
    sharedCss: cssParts.join("\n"),
    fontLinks: Array.from(allFontLinks),
    images,
    tweaksDefaults: mergeTweaksDefaults(editmodeBlocks),
    tweaksJsx,
  };
}
