/**
 * Storage + retrieval for "visual" import references — the screenshot/PDF of a
 * page's rendered look that we hand to Claude alongside the HTML during a site
 * import.
 *
 * Both entry points (the automatic render via `render-provider` and the manual
 * upload route) store the bytes in Supabase Storage and return a lightweight
 * reference. The import route later downloads the bytes server-side and
 * base64-encodes them for the Anthropic message — keeping large PDFs off the
 * client request body (Vercel caps inbound bodies at ~4.5 MB), and out of the
 * editor textarea.
 *
 * Server-only: uses the service-role Supabase client.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";

/** Reuses the existing public bucket; visuals live under their own prefix. */
const BUCKET = "site-builder-assets";
const PREFIX = "import-visuals";

/** Per-visual byte ceilings before base64 (Anthropic: images ≤5MB, PDFs ≤32MB). */
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_PDF_BYTES = 20_000_000;

export type ImportVisualKind = "image" | "pdf";

/** Lightweight handle passed UI → import route (no bytes inline). */
export interface ImportVisualRef {
  type: ImportVisualKind;
  media_type: string;
  storage_path: string;
}

/** base64-encoded visual ready to drop into an Anthropic content block. */
export interface ImportVisualData {
  type: ImportVisualKind;
  media_type: string;
  /** base64, no data: prefix. */
  data: string;
}

/** Map a MIME type to a supported visual kind, or null if unsupported. */
export function visualKindForMime(mime: string): ImportVisualKind | null {
  const m = (mime || "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (/^image\/(png|jpe?g|gif|webp)$/.test(m)) return "image";
  return null;
}

function extForMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  return mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
}

/** Validate size for the visual's kind; throws a user-facing message if over. */
function assertWithinLimit(bytes: number, kind: ImportVisualKind): void {
  const limit = kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (bytes > limit) {
    const mb = (limit / 1_000_000).toFixed(0);
    throw new Error(`Visuel trop volumineux (max ${mb} Mo pour ${kind === "pdf" ? "un PDF" : "une image"}).`);
  }
}

/** Upload visual bytes to storage and return a reference. */
export async function storeImportVisual(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<ImportVisualRef> {
  const kind = visualKindForMime(mime);
  if (!kind) throw new Error(`Type de visuel non supporté : ${mime || "inconnu"}.`);
  assertWithinLimit(bytes.byteLength, kind);

  const path = `${PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extForMime(mime)}`;
  const supabase = getServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);

  return { type: kind, media_type: mime, storage_path: path };
}

/** Download a stored visual and base64-encode it for an Anthropic content block. */
export async function loadImportVisual(ref: ImportVisualRef): Promise<ImportVisualData> {
  const kind = visualKindForMime(ref.media_type) ?? ref.type;
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(ref.storage_path);
  if (error || !data) throw new Error(error?.message || "Visuel introuvable.");
  const buf = Buffer.from(await data.arrayBuffer());
  assertWithinLimit(buf.byteLength, kind);
  return { type: kind, media_type: ref.media_type, data: buf.toString("base64") };
}
