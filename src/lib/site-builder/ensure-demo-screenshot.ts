import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderViewportShot } from "@/lib/site-builder/render-provider";
import { putOgAsset } from "@/lib/og/storage";

/**
 * Capturer le site démo pour l'intégrer à la carte de partage.
 *
 * La vignette WhatsApp fait ~250 px de large dans la conversation : ce que le
 * prospect y voit décide s'il clique. Une capture du site qu'on lui a construit
 * y vaut n'importe quel texte.
 *
 * DEUX RÈGLES, toutes les deux apprises sur ce dépôt.
 *
 * 1. **N'échoue jamais.** Même discipline que `ensure-hosted-logo` : un service
 *    de capture lent ou en panne ne doit pas rendre une démo impartageable.
 *    Toute erreur est journalisée et renvoyée en `null` — la carte se rend alors
 *    dans sa variante sans mockup, qui est présentable.
 *
 * 2. **Jamais dans `publishSite`.** Une capture prend plusieurs secondes et
 *    `publishSite` est appelé en boucle par `deploy-batch` : un déploiement de
 *    50 sites partirait en timeout. La publication se contente d'invalider ; la
 *    capture est déclenchée par l'action humaine qui précède l'envoi (le
 *    dialogue « Partager »), ou par le filet du cron.
 */

/** Le rapport d'aspect du mockup navigateur de la carte OG. */
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 800;

/** Cap de poids : la carte finale doit tenir sous les limites de WhatsApp. */
const MAX_SHOT_BYTES = 250 * 1024;

export type EnsureDemoScreenshotResult = {
  url: string | null;
  /** Motif d'échec, pour l'éditeur du CRM. Jamais montré au prospect. */
  warning?: string;
};

/**
 * Capture `demoUrl`, normalise, dépose, et écrit `sites.og_shot_url`.
 * Renvoie l'URL existante sans rien faire si elle est déjà présente et que
 * `force` n'est pas demandé — c'est ce qui rend l'appel idempotent et permet au
 * dialogue « Partager » de l'appeler à chaque ouverture sans coût.
 */
export async function ensureDemoScreenshot(
  supabase: SupabaseClient,
  siteId: string,
  demoUrl: string,
  opts: { force?: boolean; existingUrl?: string | null } = {},
): Promise<EnsureDemoScreenshotResult> {
  if (!opts.force && opts.existingUrl) return { url: opts.existingUrl };

  let raw: ArrayBuffer;
  try {
    const visual = await renderViewportShot(demoUrl, { width: SHOT_WIDTH, height: SHOT_HEIGHT });
    raw = visual.bytes;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "capture impossible";
    console.warn(`[og] capture démo ${siteId} échouée : ${reason}`);
    return { url: null, warning: `Capture du site démo indisponible (${reason}).` };
  }

  let optimized: Buffer;
  try {
    optimized = await compressUnder(raw, MAX_SHOT_BYTES);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "image illisible";
    console.warn(`[og] capture démo ${siteId} non traitable : ${reason}`);
    return { url: null, warning: `Capture du site démo illisible (${reason}).` };
  }

  const put = await putOgAsset(supabase, {
    prefix: siteId,
    name: "shot",
    ext: "jpg",
    contentType: "image/jpeg",
    bytes: optimized,
  });
  if (!put.ok) {
    console.warn(`[og] dépôt capture ${siteId} échoué : ${put.error}`);
    return { url: null, warning: `Capture non enregistrée (${put.error}).` };
  }

  // L'écriture en base est best-effort : la colonne peut manquer (migration non
  // appliquée). L'image est déjà déposée et l'appelant a son URL — se contenter
  // de journaliser vaut mieux que d'annuler un travail réussi.
  const { error } = await supabase
    .from("sites")
    .update({ og_shot_url: put.publicUrl, og_shot_at: new Date().toISOString() })
    .eq("id", siteId);
  if (error) console.warn(`[og] og_shot_url non enregistrée (${siteId}) : ${error.message}`);

  return { url: put.publicUrl };
}

/**
 * Redimensionne en 1200 de large et descend la qualité JPEG jusqu'à passer sous
 * `maxBytes`. Trois paliers suffisent en pratique ; au-delà on rend quand même,
 * parce qu'une capture un peu lourde vaut mieux que pas de capture.
 */
async function compressUnder(input: ArrayBuffer, maxBytes: number): Promise<Buffer> {
  const base = sharp(Buffer.from(input)).resize({ width: 1200, withoutEnlargement: true });
  for (const quality of [80, 68, 55]) {
    const out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  return base.clone().jpeg({ quality: 45, mozjpeg: true }).toBuffer();
}
