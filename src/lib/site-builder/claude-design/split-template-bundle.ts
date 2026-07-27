/**
 * Splits a Claude Design export ZIP into the ONE-OR-MORE templates it contains.
 *
 * The export used to be a single template (a flat ZIP, or a ZIP with one
 * wrapping folder). It now ships several variants side by side, sharing one
 * asset folder at the root:
 *
 *   images/…                         ← shared by every template
 *   uploads/…  screenshots/…         ← authoring leftovers, not part of a site
 *   template CVC - Classique/index.html  styles.css  patterns.css  site.js  …
 *   template CVC - Brut/index.html       styles.css  brut.css      site.js  …
 *   template CVC - Agency/…
 *
 * `parseTemplateBundle` indexes non-image files by BASENAME, so handing it such
 * a ZIP whole collapses the three variants into one broken template (three
 * `index.html` fight over slug `/`, the last `styles.css` wins). This module
 * runs first and hands the parser one coherent file list per template.
 *
 * Pure + framework-free (runs in the browser importer and in unit tests).
 */
import type { BundleInputFile } from "./parse-template-bundle";

export interface DetectedTemplate {
  /** Folder holding the template's HTML — "" for a flat ZIP. Stable id for the UI. */
  key: string;
  /** Display name: the folder's basename, or the ZIP's own name for a flat export. */
  name: string;
  /** This template's own files PLUS the assets shared at the root. */
  files: BundleInputFile[];
  pageCount: number;
  imageCount: number;
}

/** Top-level folders that are authoring leftovers, never part of a site. */
const NOISE_SEGMENTS = new Set(["uploads", "screenshots", "__macosx"]);

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

function baseName(path: string): string {
  return path.replace(/^.*\//, "");
}

/**
 * True for paths that must never reach the parser: the authoring folders above,
 * dotfiles/dot-folders (`.thumbnail`, `.DS_Store`) and `__MACOSX` metadata.
 * Matched on EVERY segment, so a nested `template X/screenshots/…` is excluded too.
 */
function isNoise(path: string): boolean {
  return path.split("/").some((seg) => {
    if (!seg) return false;
    if (seg.startsWith(".") || seg.startsWith("__")) return true;
    return NOISE_SEGMENTS.has(seg.toLowerCase());
  });
}

/**
 * Detects the templates in an extracted export.
 *
 * A TEMPLATE ROOT is any folder that directly contains an `*.html` file (the
 * ZIP root counts, which is why a flat or single-folder export still yields
 * exactly one template and goes through the unchanged pipeline).
 *
 * Every template gets its own files plus the files that live OUTSIDE all
 * template roots — the shared `images/`. Paths are handed through untouched:
 * `refPath()` already slices from `images/`, so both `images/x.png` and
 * `tpl/images/x.png` map to the same ref the markup uses.
 *
 * Returned in the ZIP's own folder order, so the list matches what the operator
 * sees in Finder.
 */
export function splitTemplateBundle(files: BundleInputFile[]): DetectedTemplate[] {
  const clean = files.filter((f) => !isNoise(f.path));

  // Template roots, in first-seen order.
  const roots: string[] = [];
  for (const f of clean) {
    if (!/\.html?$/i.test(f.path)) continue;
    const dir = dirOf(f.path);
    if (!roots.includes(dir)) roots.push(dir);
  }
  if (roots.length === 0) return [];

  // A file belongs to a root when it sits inside it; the deepest matching root
  // wins so `tpl/sub/asset.css` goes to `tpl`, not to the ZIP root.
  const ownerOf = (path: string): string | null => {
    let best: string | null = null;
    for (const root of roots) {
      if (root === "") { if (best === null) best = ""; continue; }
      if (path.startsWith(`${root}/`) && (best === null || root.length > best.length)) best = root;
    }
    return best;
  };

  const byRoot = new Map<string, BundleInputFile[]>(roots.map((r) => [r, []]));
  const shared: BundleInputFile[] = [];
  for (const f of clean) {
    const owner = ownerOf(f.path);
    if (owner === null) shared.push(f);
    else byRoot.get(owner)!.push(f);
  }

  return roots.map((root) => {
    const own = byRoot.get(root) ?? [];
    const all = [...own, ...shared];
    return {
      key: root,
      name: root ? baseName(root) : "Template",
      files: all,
      pageCount: own.filter((f) => /\.html?$/i.test(f.path) && dirOf(f.path) === root).length,
      imageCount: all.filter((f) => IMAGE_EXT.test(f.path)).length,
    };
  });
}

/**
 * Normalised form used to pair a ZIP folder with an already-imported template
 * ("Template CVC — Classique" ≡ "template cvc - classique"): lowercased,
 * accent-free, punctuation collapsed to single spaces.
 */
export function normalizeTemplateName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
