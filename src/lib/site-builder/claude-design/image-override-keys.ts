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

/** Removes every image kind of `path` from `overrides` (mutates the map). */
export function clearImageKeys(overrides: Record<string, unknown>, path: string): void {
  for (const kind of IMAGE_OVERRIDE_KINDS) delete overrides[`${path}:${kind}`];
}
