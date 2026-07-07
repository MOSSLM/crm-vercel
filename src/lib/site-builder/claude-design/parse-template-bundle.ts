/**
 * Parses a multi-file Claude Design export into the pieces the importer needs.
 *
 * Input: the already-extracted files of the export (the ZIP is unpacked by the
 * caller — see import-bundle/route.ts — so this module stays pure + testable).
 *
 * Output (`ParsedBundle`):
 *  - pages:      one entry per `*.html` (body markup with scripts stripped, slug,
 *                title, service tag, the page's font/CDN <link>s, and the design's
 *                own runtime JS refs: local `.js`, inline scripts, remote libs)
 *  - sharedCss:  `styles.css` + `theme-tokens.css` (+ any other .css) concatenated,
 *                theme-tokens LAST so its variable recovery layer wins the cascade
 *  - fontLinks:  deduped remote stylesheet/font/leaflet <link> hrefs across pages
 *  - jsByName:   the design's runtime `.js` files (site.js, service-*.js) by name;
 *                theme-apply.js and the react/babel tweak-panel toolchain excluded
 *  - scriptLinks: deduped remote runtime `<script src>` (leaflet/gsap/…) across pages
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
  /** Basenames of local `.js` files this page references, in document order
   *  (e.g. ["site.js", "service-clim.js"]) — editor-tooling (theme-apply.js) and
   *  `.jsx` babel scripts excluded. Resolved to file contents by the caller. */
  localScriptRefs: string[];
  /** Inline `<script>` bodies on this page (non-babel, non-json), in order. */
  inlineScripts: string[];
  /** Remote runtime `<script src>` hrefs (leaflet / gsap / locomotive …); the
   *  Claude tweak-panel toolchain (react / react-dom / @babel/standalone) is
   *  excluded. */
  scriptLinks: string[];
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
  /** Contents of every runtime `.js` file in the bundle, keyed by lowercased
   *  basename (e.g. "site.js", "service-clim.js"). `theme-apply.js` is excluded
   *  (its job is done by apply-tweaks at render time). The caller splits these
   *  into shared vs per-page JS via the pages' `localScriptRefs`. */
  jsByName: Record<string, string>;
  /** Deduped remote runtime `<script src>` hrefs across all pages (first-seen
   *  order); the tweak-panel toolchain is already excluded. */
  scriptLinks: string[];
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
  localScriptRefs: string[];
  inlineScripts: string[];
  scriptLinks: string[];
}

const SHARED_TWEAKS = new Set(["theme-tweaks.jsx", "tweaks-panel.jsx"]);

/** Remote scripts that make up the Claude Design in-browser TWEAK PANEL toolchain
 *  (React + Babel), NOT the site runtime. We reproduce that panel with our own
 *  Tweaks UI, so these must never run on the imported/deployed site. */
const EDITOR_TOOLING_RE = /(^|\/)(react|react-dom)[@.\-/]|@babel\/standalone|(^|\/)babel(\.min)?\.js/i;

/** Local `.js` files that are editor tooling / re-implemented at render time and
 *  must be dropped rather than executed (theme-apply.js seeds theme vars, which
 *  apply-tweaks already does — running it lets localStorage clobber the tweaks). */
const LOCAL_JS_DENYLIST = new Set(["theme-apply.js"]);

/** Extracts body markup + head styles/font links from a full HTML page. */
function parsePageHtml(rawHtml: string): ParsedPage {
  const root = parse(rawHtml, {
    blockTextElements: { script: true, noscript: true, style: true, pre: true },
  });

  // Before stripping, walk every <script> in document order and (a) note the
  // page-specific *-tweaks.jsx (drives the per-page schema), (b) collect the
  // design's OWN runtime JS so it can be re-injected as real <script> elements
  // at render time — scripts left inside dangerouslySetInnerHTML never execute.
  // The Claude tweak-panel toolchain (react / babel / *.jsx / theme-apply.js) is
  // deliberately excluded: we reproduce that panel with our Tweaks UI.
  let tweaksFile: string | null = null;
  const localScriptRefs: string[] = [];
  const inlineScripts: string[] = [];
  const scriptLinks: string[] = [];
  root.querySelectorAll("script").forEach((s) => {
    const type = (s.getAttribute("type") ?? "").toLowerCase();
    const rawSrc = s.getAttribute("src") ?? "";
    const base = rawSrc.replace(/^.*\//, "").toLowerCase();

    // Babel-transpiled panel scripts (incl. the *-tweaks.jsx) — schema only.
    if (type === "text/babel" || base.endsWith(".jsx")) {
      if (base.endsWith("-tweaks.jsx") && !SHARED_TWEAKS.has(base)) tweaksFile = base;
      return;
    }
    if (rawSrc) {
      if (/^https?:/i.test(rawSrc)) {
        // Remote runtime lib (leaflet/gsap/…): keep unless it's panel tooling.
        if (!EDITOR_TOOLING_RE.test(rawSrc)) scriptLinks.push(rawSrc);
      } else if (base.endsWith(".js") && !LOCAL_JS_DENYLIST.has(base)) {
        localScriptRefs.push(base);
      }
      return;
    }
    // Inline script: keep runtime bodies, skip JSON data islands.
    if (type && type !== "text/javascript" && type !== "module" && type !== "application/javascript") return;
    const body = (s.text ?? "").trim();
    if (body) inlineScripts.push(body);
  });

  // Strip <script>/<noscript> from the markup (their JS is re-injected as real
  // elements) + inline handlers / javascript: URLs.
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
  return { title, html, fontLinks, tweaksFile, localScriptRefs, inlineScripts, scriptLinks };
}

/**
 * Parses the extracted files of a Claude Design export. Order of CSS matters:
 * styles.css (consumers / defaults) is placed BEFORE theme-tokens.css, whose own
 * header says it is "Chargé APRÈS styles.css" — it re-declares many hardcoded
 * colours via CSS variables so the Tweaks can actually recolour them, and must
 * win the cascade.
 */
export function parseTemplateBundle(files: BundleInputFile[]): ParsedBundle {
  const pages: BundlePage[] = [];
  const images: BundleImage[] = [];
  const cssByName = new Map<string, string>();
  const editmodeBlocks: TweaksDefaults[] = [];
  const allFontLinks = new Set<string>();
  const allScriptLinks = new Set<string>();
  const tweaksJsx: Record<string, string> = {};
  const jsByName: Record<string, string> = {};

  for (const file of files) {
    const e = ext(file.path);
    const name = baseName(file.path).toLowerCase();
    if (name.startsWith(".") || name.startsWith("__")) continue; // skip dotfiles / metadata

    if (e === "html" || e === "htm") {
      const parsed = parsePageHtml(decodeText(file.bytes));
      const fileName = baseName(file.path);
      for (const href of parsed.fontLinks) allFontLinks.add(href);
      for (const href of parsed.scriptLinks) allScriptLinks.add(href);
      pages.push({
        fileName,
        slug: fileNameToSlug(fileName),
        title: parsed.title,
        html: parsed.html,
        serviceTag: serviceTagFromFile(fileName),
        fontLinks: parsed.fontLinks,
        tweaksFile: parsed.tweaksFile,
        localScriptRefs: parsed.localScriptRefs,
        inlineScripts: parsed.inlineScripts,
        scriptLinks: parsed.scriptLinks,
      });
    } else if (e === "css") {
      cssByName.set(name, decodeText(file.bytes));
    } else if (e === "jsx") {
      const src = decodeText(file.bytes);
      tweaksJsx[name] = src;
      // Only *-tweaks.jsx carry an EDITMODE defaults block; others return {}.
      editmodeBlocks.push(parseEditmode(src));
    } else if (e === "js") {
      // Keep the design's OWN runtime JS (site.js, service-*.js). theme-apply.js
      // is excluded — apply-tweaks reproduces it, and running it would let
      // localStorage defaults clobber the operator's tweaks.
      if (!LOCAL_JS_DENYLIST.has(name)) jsByName[name] = decodeText(file.bytes);
    } else if (IMAGE_EXT_MIME[e]) {
      images.push({ path: file.path, bytes: file.bytes, mime: file.mime || IMAGE_EXT_MIME[e] });
    }
  }

  // Concatenate CSS: the main stylesheet(s) first, then theme-tokens.css last so
  // its variable-based recovery layer overrides styles.css's hardcoded colours.
  const cssOrder = ["styles.css", "theme-tokens.css"];
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
    jsByName,
    scriptLinks: Array.from(allScriptLinks),
  };
}
