/**
 * The override kinds that carry a PHOTO, shared by everything that reasons about
 * "the images of a page" rather than its copy: the editor's "reset the images of
 * this page" button, and the cross-template image copy.
 *
 * A slot holds either a single image (`image` / `bg_image`, plus an optional
 * `image_mobile` art-direction variant) or a tagged `image_set` — never both, so
 * writing one kind onto a slot means clearing the others (see InlinePreview's
 * save path). `clearImageKeys` centralises that rule.
 */
import { splitOverrideKey } from "./remap-overrides";

export const IMAGE_OVERRIDE_KINDS = ["image", "bg_image", "image_set", "image_mobile"] as const;

const IMAGE_KEY_RE = /:(image|bg_image|image_set|image_mobile)$/;

/** True for an override key that sets a photo on a slot. */
export function isImageOverrideKey(key: string): boolean {
  return IMAGE_KEY_RE.test(key);
}

/** The paths of every slot that already carries a photo in `overrides`. */
export function imageSlotPaths(overrides: Record<string, unknown>): Set<string> {
  const paths = new Set<string>();
  for (const key of Object.keys(overrides)) {
    if (isImageOverrideKey(key)) paths.add(splitOverrideKey(key).path);
  }
  return paths;
}

/** How many photo overrides a page carries. */
export function countImageOverrides(overrides: Record<string, unknown>): number {
  return Object.keys(overrides).filter(isImageOverrideKey).length;
}

/**
 * Pages the SOURCE design carries photos on that the TARGET design does not have
 * at all — the cross-template copy can only match slug to slug, so those pages
 * have nowhere to land.
 *
 * The CVC export grows: a new service page (rénovation générale…) lands in every
 * skin of the ZIP at once, but a template imported before it simply has no such
 * page until it is re-imported. The copy then quietly skipped it, which reads as
 * "the import forgot my new page". Naming them turns that silence into a next
 * step, for this page and for every one added later.
 *
 * Ordered by slug; pages with no photo to copy are left out — there is nothing
 * to act on there.
 */
export function pagesMissingFromTarget(
  sourceOverridesBySlug: ReadonlyMap<string, Record<string, unknown>>,
  /** The target's page slugs — a Set, or any slug-keyed Map (both expose `has`). */
  targetSlugs: { has(slug: string): boolean },
): Array<{ slug: string; images: number }> {
  return [...sourceOverridesBySlug.entries()]
    .filter(([slug]) => !targetSlugs.has(slug))
    .map(([slug, overrides]) => ({ slug, images: countImageOverrides(overrides) }))
    .filter((p) => p.images > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Clears the image kinds of `path` that the incoming write does NOT replace —
 * so a slot never ends up holding two contradictory settings, and never loses a
 * variant nobody was going to rewrite.
 *
 * `incomingKinds` are the kinds about to be written. `image_mobile` is only an
 * art-direction companion to `image`, so it survives a plain `image` write;
 * everything else is mutually exclusive with the incoming kind and goes.
 * Clearing all four unconditionally used to drop a target's `image_mobile` when
 * the source only carried an `image`.
 */
export function clearImageKeys(
  overrides: Record<string, unknown>,
  path: string,
  incomingKinds: readonly string[] = IMAGE_OVERRIDE_KINDS,
): void {
  const incoming = new Set(incomingKinds);
  const keepsMobile = !incoming.has("image_set") && incoming.has("image");
  for (const kind of IMAGE_OVERRIDE_KINDS) {
    if (incoming.has(kind)) continue;
    if (kind === "image_mobile" && keepsMobile) continue;
    delete overrides[`${path}:${kind}`];
  }
}

/**
 * The kind that actually applies to a slot in the TARGET markup.
 *
 * `image` sets `src`, `bg_image` sets a background — the renderer picks by kind,
 * not by element. Copying an `image` onto a `.ph` placeholder therefore writes
 * `src` on a `<div>`: the key exists, the photo never shows. `bg_image` works on
 * any element, so it is the safe landing kind for anything that is not an `<img>`.
 */
export function kindForElement(kind: string, isImgElement: boolean): string {
  if (kind === "image_set" || kind === "image_mobile") return kind;
  if (kind === "image" && !isImgElement) return "bg_image";
  if (kind === "bg_image" && isImgElement) return "image";
  return kind;
}
