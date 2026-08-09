import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { putOgAsset } from "@/lib/og/storage";

/**
 * Un dérivé PNG du logo client, à seule fin de le rendre dans la carte OG.
 *
 * POURQUOI CE FICHIER EXISTE : satori — le moteur derrière `next/og` — ne sait
 * afficher ni le WebP ni le SVG **distant** dans une balise image. Or c'est
 * exactement ce que produit notre chaîne d'images : `optimizeImageUpload`
 * (`src/lib/images/optimize-image.ts`) sort du WebP sauf pour les PNG réellement
 * transparents, et laisse les SVG intacts. Le logo de la médiathèque est donc,
 * dans la majorité des cas, illisible pour la carte.
 *
 * Le symptôme sans ce fichier n'est pas une erreur mais un TROU : satori rend la
 * carte sans le logo, silencieusement. C'est le genre de défaut qu'on ne voit
 * qu'en regardant une vraie conversation WhatsApp.
 *
 * Le logo SAMA, lui, n'a besoin de rien : c'est un `path` SVG *inline*
 * (`LOGO_PATH`), et satori rend très bien les éléments SVG inline. La limitation
 * porte sur les images distantes.
 *
 * Ne lève jamais, même discipline que `ensure-demo-screenshot`.
 */

/** Le logo n'occupe qu'un coin de la carte : 320 px suffisent largement. */
const MAX_LOGO_PX = 320;

export type EnsureOgLogoResult = { url: string | null; warning?: string };

export async function ensureOgLogo(
  supabase: SupabaseClient,
  siteId: string,
  logoUrl: string | null | undefined,
  opts: { force?: boolean; existingUrl?: string | null } = {},
): Promise<EnsureOgLogoResult> {
  const source = (logoUrl ?? "").trim();
  if (!source) return { url: null };
  if (!opts.force && opts.existingUrl) return { url: opts.existingUrl };

  let raw: ArrayBuffer;
  try {
    const res = await fetch(source, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { url: null, warning: `Logo inaccessible (HTTP ${res.status}).` };
    raw = await res.arrayBuffer();
    if (raw.byteLength === 0) return { url: null, warning: "Logo vide." };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "téléchargement impossible";
    console.warn(`[og] logo ${siteId} non téléchargé : ${reason}`);
    return { url: null, warning: `Logo non téléchargé (${reason}).` };
  }

  let png: Buffer;
  try {
    // `sharp` lit le SVG (via librsvg) comme les formats bitmap : c'est ce qui
    // permet de traiter les deux cas problématiques — SVG et WebP — d'un seul
    // geste, sans brancher sur le type d'entrée.
    png = await sharp(Buffer.from(raw))
      .resize({ width: MAX_LOGO_PX, height: MAX_LOGO_PX, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    const reason = e instanceof Error ? e.message : "format non reconnu";
    console.warn(`[og] logo ${siteId} non converti : ${reason}`);
    return { url: null, warning: `Logo non converti (${reason}).` };
  }

  const put = await putOgAsset(supabase, {
    prefix: siteId,
    name: "logo",
    ext: "png",
    contentType: "image/png",
    bytes: png,
  });
  if (!put.ok) return { url: null, warning: `Logo non enregistré (${put.error}).` };

  const { error } = await supabase.from("sites").update({ og_logo_url: put.publicUrl }).eq("id", siteId);
  if (error) console.warn(`[og] og_logo_url non enregistrée (${siteId}) : ${error.message}`);

  return { url: put.publicUrl };
}
