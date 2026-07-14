/**
 * Shared, isomorphic helpers for "image sets" — a Claude Design image slot that
 * holds SEVERAL candidate images (fallbacks) instead of one, each carrying the
 * service tags it represents. At render time, exactly ONE candidate is picked
 * for the linked company (best match against its `service_tags`) and applied
 * like a normal `:image` / `:bg_image` override — so the deployed page shows
 * only the adapted image, never a residue of the other candidates.
 *
 * This module is intentionally DOM-free and server-free so it can be imported
 * from three call sites that all resolve a set identically:
 *   - `resolve-image-sets.ts`  (server SSR, node-html-parser)
 *   - `LibrarySectionHydrator` (client DOM, safety-net re-apply)
 *   - `InlinePreview` iframe    (editor preview — inlines the same ranking)
 *
 * A set is stored inside the usual `content.__overrides` map under the key
 * `"<dotted-path>:image_set"`, with the JSON-encoded shape below as its `value`.
 */
import { formatServiceTag } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";

export interface ImageSetCandidate {
  /** Public image URL. */
  url: string;
  /** Service tags this image represents (may include the universal tag "all").
   *  Inherited from the media-library item's `service_tags`. */
  tags: string[];
  /** Optional accessibility text / description carried from the library item. */
  alt?: string;
}

export interface ImageSet {
  candidates: ImageSetCandidate[];
}

/** Parses the JSON `value` of an `:image_set` override. Tolerant: returns an
 *  empty set on any malformed input so a bad entry never breaks the render. */
export function parseImageSet(value: string): ImageSet {
  if (!value) return { candidates: [] };
  try {
    const parsed = JSON.parse(value) as unknown;
    const raw = (parsed as { candidates?: unknown })?.candidates;
    if (!Array.isArray(raw)) return { candidates: [] };
    const candidates: ImageSetCandidate[] = [];
    for (const c of raw) {
      const url = typeof (c as ImageSetCandidate)?.url === "string" ? (c as ImageSetCandidate).url.trim() : "";
      if (!url) continue;
      const tagsRaw = (c as ImageSetCandidate)?.tags;
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((t): t is string => typeof t === "string") : [];
      const alt = typeof (c as ImageSetCandidate)?.alt === "string" ? (c as ImageSetCandidate).alt : undefined;
      candidates.push({ url, tags, alt });
    }
    return { candidates };
  } catch {
    return { candidates: [] };
  }
}

/** Serializes candidates back into an override `value`. */
export function serializeImageSet(candidates: ImageSetCandidate[]): string {
  return JSON.stringify({ candidates });
}

function isUniversal(c: ImageSetCandidate): boolean {
  if (!c.tags || c.tags.length === 0) return true;
  return c.tags.map(formatServiceTag).includes(MEDIA_LIBRARY_UNIVERSAL_TAG);
}

/**
 * Picks the single best candidate for a company's service tags.
 *
 * Ranking (mirrors `media_library_by_company`, but a real service match beats a
 * generic universal image here — resolution, not suggestion):
 *   1. Highest number of tags shared with the company (universal tag excluded
 *      from the count); first candidate wins ties.
 *   2. If nothing matches, the first UNIVERSAL candidate ("all" / untagged).
 *   3. Otherwise the FIRST candidate — a home hero is never left empty.
 */
export function pickCandidate(
  candidates: ImageSetCandidate[],
  enterpriseTags: string[],
): ImageSetCandidate | null {
  if (!candidates || candidates.length === 0) return null;
  const companyTags = new Set(enterpriseTags.map(formatServiceTag).filter(Boolean));

  let best: ImageSetCandidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = c.tags
      .map(formatServiceTag)
      .filter((t) => t !== MEDIA_LIBRARY_UNIVERSAL_TAG && companyTags.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best && bestScore > 0) return best;

  const universal = candidates.find(isUniversal);
  if (universal) return universal;

  return candidates[0];
}
