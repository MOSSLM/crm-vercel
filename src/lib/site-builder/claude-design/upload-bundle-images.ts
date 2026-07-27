/**
 * Uploads a parsed bundle's images to a site's asset bucket and returns the
 * `refPath → public URL` map the rewrite pass needs.
 *
 * Shared by the full importer and the partial page updater, which used to hold
 * a copy each. It also replaces their sequential `for … await` loop with a small
 * concurrency pool: a multi-template ZIP means uploading the same ~60 images
 * once per selected template, and each POST re-encodes the file server-side.
 *
 * Failures are surfaced (`failed`) instead of being swallowed — an image whose
 * upload silently dropped leaves its relative path in the markup and 404s on
 * the deployed site.
 */
import type { BundleImage } from "./parse-template-bundle";
import { refPath } from "./build-import-pages";

/** Parallel uploads in flight. Enough to hide latency, small enough not to
 *  starve the browser's connection pool or the image-optimisation route. */
const CONCURRENCY = 6;

export interface UploadImagesResult {
  urlByPath: Map<string, string>;
  /** Ref paths whose upload failed, in bundle order. */
  failed: string[];
}

export async function uploadBundleImages(
  images: BundleImage[],
  siteId: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadImagesResult> {
  const urlByPath = new Map<string, string>();
  const failed: string[] = [];
  const total = images.length;
  let done = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= total) return;
      const img = images[index];
      const ref = refPath(img.path);
      try {
        const fd = new FormData();
        fd.append("file", new Blob([img.bytes as BlobPart], { type: img.mime }), ref.replace(/^.*\//, ""));
        fd.append("original_path", ref);
        const res = await fetcher(`/api/site-builder/assets?site=${siteId}`, { method: "POST", body: fd });
        if (res.ok) {
          const { public_url } = (await res.json()) as { public_url?: string };
          if (public_url) urlByPath.set(ref, public_url);
          else failed.push(ref);
        } else {
          failed.push(ref);
        }
      } catch {
        failed.push(ref);
      }
      onProgress?.(++done, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  return { urlByPath, failed };
}
