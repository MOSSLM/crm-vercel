/**
 * Server-side image optimisation applied at upload time, to keep demo sites and
 * the media library light and fast to load.
 *
 * Policy (see DEFAULT_OPTIMIZE_CONFIG):
 *  - JPEG and OPAQUE PNG  → WebP (much smaller, universally supported).
 *  - TRANSPARENT PNG      → stays PNG (recompressed) by default, so a universal
 *                           fallback format is preserved. Flip `keepTransparentPng`
 *                           to false to send transparent PNGs to WebP-with-alpha.
 *  - Static GIF           → WebP. Animated GIF/WebP → left untouched.
 *  - SVG / AVIF / unknown → left untouched (never rasterised).
 *  - Any image wider than `maxWidth` is downscaled (never enlarged).
 *  - Metadata is stripped; EXIF orientation is baked in via `.rotate()`.
 *
 * Guard-rail: if the re-encoded output is not actually smaller than the input,
 * the ORIGINAL bytes are returned unchanged — we never inflate an asset that was
 * already well optimised.
 *
 * Pure + server-only: `sharp` ships native binaries and must not reach the
 * client bundle (declared in `serverExternalPackages`). Runs on the Node runtime.
 */
import sharp from "sharp";

export interface OptimizeConfig {
  /** WebP encode quality (0–100). */
  webpQuality: number;
  /** Images wider than this are downscaled to it (never enlarged). */
  maxWidth: number;
  /** true → transparent PNG stays PNG; false → transparent PNG becomes WebP. */
  keepTransparentPng: boolean;
}

export const DEFAULT_OPTIMIZE_CONFIG: OptimizeConfig = {
  webpQuality: 80,
  maxWidth: 2048,
  keepTransparentPng: true,
};

export interface OptimizedImage {
  /** Bytes to upload (optimised, or the untouched original on passthrough). */
  bytes: Buffer;
  /** MIME type matching `bytes`. */
  contentType: string;
  /** File extension (no dot) matching `bytes`, for the storage path. */
  ext: string;
  /** Final pixel width, when known. */
  width: number | null;
  /** Final pixel height, when known. */
  height: number | null;
  /** true when the returned bytes differ from the input (format/size changed). */
  optimized: boolean;
}

/** Raster MIME types we may transcode. Everything else is passed through. */
const RASTER_OPTIMIZABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Canonical extension for a MIME type, or null if unknown. */
function extForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    default:
      return null;
  }
}

function toBuffer(input: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(new Uint8Array(input));
}

/**
 * Optimise an uploaded image. Never throws for image reasons — on any decode
 * problem or unsupported type it returns the original bytes (passthrough).
 *
 * @param input     Raw uploaded bytes.
 * @param mime      Declared MIME type (e.g. "image/png").
 * @param filename  Original filename, used only for the passthrough extension
 *                  fallback when the MIME type is unknown.
 */
export async function optimizeImageUpload(
  input: ArrayBuffer | Uint8Array | Buffer,
  mime: string,
  filename?: string,
  config: OptimizeConfig = DEFAULT_OPTIMIZE_CONFIG,
): Promise<OptimizedImage> {
  const inputBuf = toBuffer(input);
  const m = (mime || "").toLowerCase().trim();

  const fallbackExt =
    extForMime(m) ??
    (filename?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin");

  const passthrough = (): OptimizedImage => ({
    bytes: inputBuf,
    contentType: m || "application/octet-stream",
    ext: fallbackExt,
    width: null,
    height: null,
    optimized: false,
  });

  // Never rasterise SVG; leave AVIF and any unknown type as-is.
  if (!RASTER_OPTIMIZABLE.has(m)) return passthrough();

  let meta: sharp.Metadata;
  try {
    meta = await sharp(inputBuf, { failOn: "none", animated: true }).metadata();
  } catch {
    return passthrough(); // corrupt / unreadable → keep original
  }

  // Leave animated images (animated GIF/WebP) untouched.
  if ((meta.pages ?? 1) > 1) return passthrough();

  // Decide the target format.
  let targetPng = false;
  if (m === "image/png") {
    let opaque = true;
    try {
      opaque = (await sharp(inputBuf, { failOn: "none" }).stats()).isOpaque;
    } catch {
      opaque = false; // be safe: assume it uses transparency
    }
    const reallyTransparent = (meta.hasAlpha ?? false) && !opaque;
    targetPng = config.keepTransparentPng && reallyTransparent;
  }

  try {
    let pipeline = sharp(inputBuf, { failOn: "none" }).rotate();
    if (meta.width && meta.width > config.maxWidth) {
      pipeline = pipeline.resize({ width: config.maxWidth, withoutEnlargement: true });
    }

    const outBuf = targetPng
      ? await pipeline.png({ compressionLevel: 9, palette: true, effort: 8 }).toBuffer()
      : await pipeline.webp({ quality: config.webpQuality, effort: 4 }).toBuffer();

    // Guard-rail: never inflate. If we couldn't beat the original, keep it.
    if (outBuf.length >= inputBuf.length) return passthrough();

    const outMeta = await sharp(outBuf).metadata().catch(() => meta);
    return {
      bytes: outBuf,
      contentType: targetPng ? "image/png" : "image/webp",
      ext: targetPng ? "png" : "webp",
      width: outMeta.width ?? meta.width ?? null,
      height: outMeta.height ?? meta.height ?? null,
      optimized: true,
    };
  } catch {
    return passthrough(); // encode failure → keep original
  }
}
