import { parse } from "node-html-parser";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

/** Normalize a user/website URL: add https://, reject non-http(s). */
function normalizeUrl(raw: string): string | null {
  let u = (raw ?? "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

/** Discover the best favicon URL by parsing the site's <head> link tags,
 *  falling back to the origin's /favicon.ico. */
async function discoverFaviconUrl(siteUrl: string): Promise<string> {
  const origin = new URL(siteUrl).origin;
  try {
    const res = await fetchWithTimeout(siteUrl, 6000, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FaviconBot/1.0)" },
    });
    if (res.ok) {
      const root = parse(await res.text());
      let best: { href: string; size: number } | null = null;
      for (const link of root.querySelectorAll("link")) {
        const rel = (link.getAttribute("rel") ?? "").toLowerCase();
        if (!rel.includes("icon")) continue;
        const href = link.getAttribute("href");
        if (!href) continue;
        const sizes = link.getAttribute("sizes") ?? "";
        const size = parseInt(sizes.split(/x/i)[0] ?? "", 10) || (rel.includes("apple") ? 180 : 16);
        if (!best || size > best.size) best = { href, size };
      }
      if (best) {
        try {
          return new URL(best.href, siteUrl).toString();
        } catch {
          /* malformed href — fall through to /favicon.ico */
        }
      }
    }
  } catch {
    /* unreachable site — fall through */
  }
  return `${origin}/favicon.ico`;
}

/**
 * Fetch a company's favicon from its website and re-host it in our own storage
 * (the site-builder-assets bucket), returning a stable public URL. Re-hosting
 * ("aspirer") keeps the favicon available even if the source site later
 * changes or blocks hotlinking. Falls back to Google's s2 favicon service.
 */
export const POST = withAuth({}, async ({ req }) => {
  const body = await req.json().catch(() => null);
  const rawUrl = body && typeof body === "object" ? (body as { url?: unknown }).url : undefined;
  const siteId = body && typeof body === "object" ? (body as { siteId?: unknown }).siteId : undefined;

  const url = typeof rawUrl === "string" ? normalizeUrl(rawUrl) : null;
  if (!url) return jsonError("{ url } valide requis (http/https)", 400);
  if (typeof siteId !== "string" || !siteId) return jsonError("{ siteId } requis", 400);

  const host = new URL(url).host;
  const candidate = await discoverFaviconUrl(url);

  // Download the icon bytes; fall back to Google's s2 favicon service.
  let bytes: ArrayBuffer | null = null;
  let contentType = "image/x-icon";
  for (const src of [candidate, `https://www.google.com/s2/favicons?domain=${host}&sz=64`]) {
    try {
      const r = await fetchWithTimeout(src, 6000);
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength === 0) continue;
      bytes = buf;
      contentType = r.headers.get("content-type") || contentType;
      break;
    } catch {
      /* try next source */
    }
  }
  if (!bytes) return jsonError("Favicon introuvable sur ce site", 404);

  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("svg")
      ? "svg"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "ico";
  const storagePath = `${siteId}/favicon-${Date.now()}.${ext}`;

  const supabase = getServiceClient();
  const { error: upErr } = await supabase.storage
    .from("site-builder-assets")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (upErr) return jsonError(upErr.message, 500);

  const { data: urlData } = supabase.storage.from("site-builder-assets").getPublicUrl(storagePath);

  // Mirror the asset registry (best-effort) so it appears in the site library.
  await supabase.from("site_builder_assets").insert({
    site_id: siteId,
    path: storagePath,
    public_url: urlData.publicUrl,
    filename: `favicon.${ext}`,
    size: bytes.byteLength,
    mime_type: contentType,
  });

  return json({ faviconUrl: urlData.publicUrl, sourceUrl: candidate });
});
