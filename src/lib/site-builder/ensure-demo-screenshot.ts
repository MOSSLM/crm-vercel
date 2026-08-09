import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderViewportShot } from "@/lib/site-builder/render-provider";
import { putOgAsset } from "@/lib/og/storage";
import { imageQuasiVide } from "@/lib/images/image-quasi-vide";

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

/**
 * Le téléphone en superposition sur la carte. Une VRAIE capture mobile, pas la
 * capture ordinateur rétrécie : dans un écran de 150 px de large, un site
 * desktop est illisible — et surtout, ce n'est pas ce que le prospect verra sur
 * son téléphone. Montrer autre chose que la vérité sur une carte de vente est
 * la dernière chose à faire.
 */
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 780;

/** Cap de poids : la carte finale doit tenir sous les limites de WhatsApp. */
const MAX_SHOT_BYTES = 250 * 1024;
const MAX_MOBILE_BYTES = 160 * 1024;

export type EnsureDemoScreenshotResult = {
  url: string | null;
  /** Capture 390 px, pour le téléphone de la carte. */
  mobileUrl?: string | null;
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
  opts: { force?: boolean; existingUrl?: string | null; existingMobileUrl?: string | null } = {},
): Promise<EnsureDemoScreenshotResult> {
  if (!opts.force && opts.existingUrl) {
    return { url: opts.existingUrl, mobileUrl: opts.existingMobileUrl ?? null };
  }

  // LES DEUX CAPTURES EN PARALLÈLE, et c'est le point important : thum.io met
  // une quinzaine de secondes par capture (appel de chauffe + attente). En
  // série, la carte demanderait une demi-minute et l'opérateur abandonnerait.
  // Menées ensemble, elles coûtent le temps de la plus lente.
  const [ordinateur, mobile] = await Promise.all([
    capturer(siteId, demoUrl, SHOT_WIDTH, SHOT_HEIGHT, MAX_SHOT_BYTES, "ordinateur"),
    capturer(siteId, demoUrl, MOBILE_WIDTH, MOBILE_HEIGHT, MAX_MOBILE_BYTES, "mobile"),
  ]);

  // La capture ordinateur commande : sans elle il n'y a pas de mockup, donc la
  // carte bascule sur sa variante centrée et le téléphone n'aurait aucun sens
  // tout seul.
  if (!ordinateur.bytes) {
    return { url: null, mobileUrl: null, warning: ordinateur.warning };
  }

  const depots = await Promise.all([
    putOgAsset(supabase, {
      prefix: siteId,
      name: "shot",
      ext: "jpg",
      contentType: "image/jpeg",
      bytes: ordinateur.bytes,
    }),
    mobile.bytes
      ? putOgAsset(supabase, {
          prefix: siteId,
          name: "shot-mobile",
          ext: "jpg",
          contentType: "image/jpeg",
          bytes: mobile.bytes,
        })
      : Promise.resolve(null),
  ]);

  const [depotOrdi, depotMobile] = depots;
  if (!depotOrdi.ok) {
    console.warn(`[og] dépôt capture ${siteId} échoué : ${depotOrdi.error}`);
    return { url: null, mobileUrl: null, warning: `Capture non enregistrée (${depotOrdi.error}).` };
  }
  const mobileUrl = depotMobile?.ok ? depotMobile.publicUrl : null;

  // L'écriture en base est best-effort : la colonne peut manquer (migration non
  // appliquée). L'image est déjà déposée et l'appelant a son URL — se contenter
  // de journaliser vaut mieux que d'annuler un travail réussi.
  const { error } = await supabase
    .from("sites")
    .update({
      og_shot_url: depotOrdi.publicUrl,
      og_shot_mobile_url: mobileUrl,
      og_shot_at: new Date().toISOString(),
    })
    .eq("id", siteId);
  if (error) console.warn(`[og] og_shot_url non enregistrée (${siteId}) : ${error.message}`);

  return {
    url: depotOrdi.publicUrl,
    mobileUrl,
    // Le téléphone est un bonus : son absence ne mérite qu'une mention, pas un
    // échec — la carte reste complète sans lui.
    warning: mobile.warning,
  };
}

/** Une capture, vérifiée et compressée. Ne lève pas. */
async function capturer(
  siteId: string,
  url: string,
  width: number,
  height: number,
  maxBytes: number,
  quoi: string,
): Promise<{ bytes: Buffer | null; warning?: string }> {
  let raw: ArrayBuffer;
  try {
    const visual = await renderViewportShot(url, { width, height });
    raw = visual.bytes;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "capture impossible";
    console.warn(`[og] capture ${quoi} ${siteId} échouée : ${reason}`);
    return { bytes: null, warning: `Capture ${quoi} indisponible (${reason}).` };
  }

  // Une capture blanche est pire qu'une capture absente : la carte de repli est
  // présentable, un rectangle vide au milieu du mockup laisse croire au prospect
  // que le site qu'on lui propose ne s'affiche pas.
  if (await imageQuasiVide(raw)) {
    console.warn(`[og] capture ${quoi} ${siteId} ignorée : image quasi vide.`);
    return {
      bytes: null,
      warning:
        `Le site démo n'a pas fini de s'afficher au moment de la capture ${quoi} — ` +
        "réessayez dans un instant.",
    };
  }

  try {
    return { bytes: await compressUnder(raw, maxBytes, width) };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "image illisible";
    console.warn(`[og] capture ${quoi} ${siteId} non traitable : ${reason}`);
    return { bytes: null, warning: `Capture ${quoi} illisible (${reason}).` };
  }
}

/**
 * Redimensionne en 1200 de large et descend la qualité JPEG jusqu'à passer sous
 * `maxBytes`. Trois paliers suffisent en pratique ; au-delà on rend quand même,
 * parce qu'une capture un peu lourde vaut mieux que pas de capture.
 */
async function compressUnder(
  input: ArrayBuffer,
  maxBytes: number,
  largeurCible = 1200,
): Promise<Buffer> {
  const source = Buffer.from(input);
  for (const quality of [80, 68, 55]) {
    const out = await sharp(source)
      .resize({ width: largeurCible, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= maxBytes) return out;
  }
  return sharp(source)
    .resize({ width: largeurCible, withoutEnlargement: true })
    .jpeg({ quality: 45, mozjpeg: true })
    .toBuffer();
}
