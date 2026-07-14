/**
 * Safety net for the deployed/previewed company site: fill any Claude Design
 * image placeholder (`.ph`) still empty after overrides + image-set resolution
 * with the best-matching image from the company's library, so a demo never
 * ships an empty framed "Photo — …" box.
 *
 * Normal flow fills every slot in the template ahead of time (single image or
 * an image set), so this only ever triggers as a fallback. It runs SSR-only,
 * gated by the caller on a real linked company (never on the template/editor
 * sample preview, where empty placeholders stay visible to guide filling).
 */
import "server-only";
import { parse, type HTMLElement } from "node-html-parser";
import { formatServiceTag } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";

export interface CompanyImage {
  url: string;
  tags: string[];
  alt?: string | null;
}

function hasClass(el: HTMLElement, cls: string): boolean {
  return (el.getAttribute("class") ?? "").split(/\s+/).includes(cls);
}

function fillNode(el: HTMLElement, url: string, alt?: string | null): void {
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
  if (!/(^|\s)has-img(\s|$)/.test(cls)) el.setAttribute("class", `${cls} has-img`.trim());
  if (alt) el.setAttribute("aria-label", alt);
  const label = el.querySelector(".ph-label");
  if (label) {
    const ls = label.getAttribute("style") ?? "";
    label.setAttribute("style", `${ls ? ls.replace(/;\s*$/, "") + "; " : ""}display: none`);
  }
}

/** Ranks the company images best-first for these tags (matching count desc,
 *  universal images after real matches). Stable within equal scores. */
function rankImages(images: CompanyImage[], enterpriseTags: string[]): CompanyImage[] {
  const companyTags = new Set(enterpriseTags.map(formatServiceTag).filter(Boolean));
  return images
    .map((img, i) => {
      const tags = img.tags.map(formatServiceTag);
      const match = tags.filter((t) => t !== MEDIA_LIBRARY_UNIVERSAL_TAG && companyTags.has(t)).length;
      const universal = tags.length === 0 || tags.includes(MEDIA_LIBRARY_UNIVERSAL_TAG);
      // Score: real matches first, then universal, then the rest.
      const score = match > 0 ? 100 + match : universal ? 1 : 0;
      return { img, i, score };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.img);
}

/**
 * Fills empty `.ph` placeholders in `html` with company images. Empty slots are
 * filled in document order with distinct images best-first; if there are more
 * slots than images the list cycles so no slot is left empty. Returns the new
 * HTML (unchanged when there is nothing to fill).
 */
export function fillEmptyPlaceholders(
  html: string,
  images: CompanyImage[],
  enterpriseTags: string[],
): string {
  if (!html || images.length === 0) return html;
  try {
    const doc = parse(html);
    const placeholders = doc.querySelectorAll(".ph").filter((ph) => !hasClass(ph, "has-img"));
    if (placeholders.length === 0) return html;

    const ranked = rankImages(images, enterpriseTags);
    let changed = false;
    placeholders.forEach((ph, idx) => {
      const img = ranked[idx % ranked.length];
      if (!img?.url) return;
      fillNode(ph, img.url, img.alt);
      changed = true;
    });

    return changed ? doc.toString() : html;
  } catch {
    return html;
  }
}
