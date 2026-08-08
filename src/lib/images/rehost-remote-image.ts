/**
 * Aspirer une image distante dans notre propre stockage.
 *
 * Un logo saisi sous forme d'URL pointait jusqu'ici vers le site du client :
 * le jour où il refait son site, l'image disparaît de nos démos sans que
 * personne ne s'en aperçoive. Cent dix-neuf logos étaient dans ce cas.
 *
 * Le dépôt savait déjà faire ça pour les favicons (`api/site-builder/fetch-favicon`)
 * et pour les fichiers déposés à la main (`api/media`). Cette brique-ci réunit les
 * deux chemins : elle prend une URL, ramène les octets, les fait passer par la
 * même optimisation que la médiathèque (`optimizeImageUpload` : WebP,
 * redimensionnement) et les range dans le même bucket, avec la même ligne en
 * base. Une URL de logo devient donc une URL à nous, servie par Supabase.
 *
 * Trois pièges du monde réel sont traités ici plutôt que chez les appelants :
 *
 *   - les serveurs mentent sur le `Content-Type` (un PNG annoncé
 *     `application/octet-stream`, ou pire `text/html` pour une page d'erreur
 *     renvoyée en 200). On renifle donc les octets ;
 *   - beaucoup d'hébergeurs refusent un `fetch` sans en-têtes de navigateur ;
 *   - l'URL vient d'une saisie ou d'un enrichissement automatique, donc d'une
 *     source non maîtrisée : les hôtes privés sont refusés (SSRF).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeImageUpload } from "@/lib/images/optimize-image";
import type { MediaImageType } from "@/types";

export const MEDIA_BUCKET = "media-library";

/** Au-delà, ce n'est plus un logo — et le téléchargement est interrompu. */
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/**
 * Sans ces en-têtes, une bonne part des hébergeurs répond 403 : un `fetch` nu
 * ressemble à un aspirateur. Mêmes valeurs que `fetch-page-html`, pour que le
 * comportement soit le même partout où l'on sort du réseau.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

export type RehostOptions = {
  /** Rattache l'image à l'entreprise dans la médiathèque. */
  entrepriseId?: number | null;
  imageType?: MediaImageType;
  tags?: string[];
  altText?: string | null;
  /** Nom lisible en médiathèque ; à défaut, déduit de l'URL. */
  fileName?: string | null;
};

export type RehostResult =
  | {
      ok: true;
      publicUrl: string;
      storagePath: string | null;
      bytes: number;
      /** Vrai quand l'URL était déjà servie par nous : rien n'a été téléchargé. */
      alreadyHosted: boolean;
    }
  | { ok: false; error: string };

/** Hôtes que l'on refuse d'atteindre : une URL saisie ne doit pas viser le réseau interne. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }
  // IPv6 loopback et adresses locales uniques / lien-local.
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // lien-local, dont les métadonnées cloud
  return false;
}

/**
 * Le vrai type d'après les octets. Les serveurs se trompent trop souvent pour
 * qu'on leur fasse confiance, et `optimizeImageUpload` a besoin du bon type
 * pour décider s'il ré-encode ou s'il laisse passer.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    return "image/webp";
  }
  // ....ftypavif — la marque est à l'offset 4.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";

  // SVG et XML : du texte, éventuellement précédé d'un BOM ou de blancs. Les
  // marqueurs cherchés sont de l'ASCII, donc lus octet par octet — `TextDecoder`
  // n'existe pas dans tous les environnements où ce module tourne.
  let start = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) start = 3; // BOM UTF-8
  let head = "";
  for (let i = start; i < Math.min(b.length, start + 512); i++) {
    head += String.fromCharCode(b[i]);
  }
  head = head.trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

/** Nom de fichier lisible depuis l'URL, pour retrouver l'image en médiathèque. */
function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop();
  if (!last) return `${url.hostname}-image`;
  return decodeURIComponent(last).slice(0, 120);
}

/**
 * Vrai si l'URL est déjà servie par notre propre stockage. Sans ce test, une
 * reprise relancée deux fois recopierait chaque image à chaque passage.
 */
export function isAlreadyHosted(supabase: SupabaseClient, rawUrl: string): boolean {
  try {
    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl("probe.png");
    const ourHost = new URL(data.publicUrl).host;
    return new URL(rawUrl).host === ourHost;
  } catch {
    return false;
  }
}

/**
 * Télécharge `rawUrl` et la range dans la médiathèque. Ne lève jamais : toute
 * cause d'échec revient en `{ ok: false, error }`, parce que l'appelant traite
 * des lots et qu'une image morte ne doit pas arrêter les suivantes.
 */
export async function rehostRemoteImage(
  supabase: SupabaseClient,
  rawUrl: string,
  opts: RehostOptions = {},
): Promise<RehostResult> {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return { ok: false, error: "URL vide" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL invalide" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Protocole non supporté (${url.protocol})` };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, error: "Hôte privé refusé" };
  }

  // Déjà chez nous : c'est ce qui rend la reprise rejouable sans dupliquer.
  if (isAlreadyHosted(supabase, trimmed)) {
    return { ok: true, publicUrl: trimmed, storagePath: null, bytes: 0, alreadyHosted: true };
  }

  const imageType: MediaImageType = opts.imageType ?? (opts.entrepriseId != null ? "company" : "stock");
  if (imageType === "company" && (opts.entrepriseId == null || !Number.isFinite(opts.entrepriseId))) {
    return { ok: false, error: "entreprise_id requis pour image_type='company'" };
  }

  let raw: Uint8Array;
  let declaredMime: string;
  // `AbortController` plutôt que `AbortSignal.timeout` : le second manque encore
  // à certains environnements. Même façon de faire que `utils/supabase/client`.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    // Le serveur annonce parfois la taille : inutile de tout télécharger pour
    // découvrir ensuite que c'est trop lourd.
    const declaredLength = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      return { ok: false, error: "Image > 15 Mo" };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return { ok: false, error: "Réponse vide" };
    if (buf.byteLength > MAX_BYTES) return { ok: false, error: "Image > 15 Mo" };

    raw = new Uint8Array(buf);
    declaredMime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return { ok: false, error: aborted ? "Délai dépassé" : "Téléchargement impossible" };
  } finally {
    clearTimeout(timer);
  }

  // Les octets font foi ; le `Content-Type` ne sert que de repli pour les
  // formats que le reniflage ne couvre pas.
  const sniffed = sniffImageMime(raw);
  const mime = sniffed ?? (declaredMime.startsWith("image/") ? declaredMime : null);
  if (!mime) {
    // Cas courant : le site répond 200 avec une page d'erreur HTML.
    return { ok: false, error: "Le contenu n'est pas une image" };
  }

  const fileName = (opts.fileName ?? "").trim() || fileNameFromUrl(url);
  const opt = await optimizeImageUpload(raw, mime, fileName);

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${opt.ext}`;
  const storagePath = `${imageType}/${unique}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, opt.bytes, {
      contentType: opt.contentType,
      upsert: false,
      // Le chemin est unique à chaque envoi, donc les octets ne changent jamais.
      cacheControl: "31536000, immutable",
    });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

  const { error: dbError } = await supabase.from("media_library").insert({
    file_name: fileName,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
    mime_type: opt.contentType,
    size_bytes: opt.bytes.length,
    width: opt.width,
    height: opt.height,
    alt_text: opts.altText ?? null,
    description: `Aspiré depuis ${url.origin}${url.pathname}`,
    service_tags: opts.tags ?? [],
    image_type: imageType,
    entreprise_id: imageType === "company" ? opts.entrepriseId : null,
  });

  if (dbError) {
    // Sans ce retrait, un échec en base laisserait un objet orphelin dans le
    // bucket — c'est ce que fait déjà `POST /api/media`.
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    return { ok: false, error: dbError.message };
  }

  return {
    ok: true,
    publicUrl: urlData.publicUrl,
    storagePath,
    bytes: opt.bytes.length,
    alreadyHosted: false,
  };
}
