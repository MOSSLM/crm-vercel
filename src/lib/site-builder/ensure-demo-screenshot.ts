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
    capturer(siteId, demoUrl, {
      fenetre: SHOT_WIDTH,
      largeurDemandee: SHOT_WIDTH,
      largeurFinale: 1200,
      hauteurFinale: 750,
      maxOctets: MAX_SHOT_BYTES,
      quoi: "ordinateur",
    }),
    capturer(siteId, demoUrl, {
      fenetre: MOBILE_WIDTH,
      // On demande DEUX FOIS la largeur de la fenêtre : le rendu mobile est en
      // densité 2, et partir d'une source à cette densité donne une réduction
      // nette plutôt qu'un agrandissement flou.
      largeurDemandee: MOBILE_WIDTH * 2,
      largeurFinale: MOBILE_WIDTH,
      hauteurFinale: MOBILE_HEIGHT,
      maxOctets: MAX_MOBILE_BYTES,
      quoi: "mobile",
      // Indispensable : sans `fullpage`, le service rogne la largeur au lieu de
      // la réduire, et on perd la colonne de droite (menu burger compris).
      pleinePage: true,
    }),
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

interface OptionsCapture {
  /** Largeur de la fenêtre du navigateur — décide de la mise en page rendue. */
  fenetre: number;
  /** Largeur demandée au service de capture. */
  largeurDemandee: number;
  /** Largeur de l'image finalement stockée. */
  largeurFinale: number;
  hauteurFinale: number;
  maxOctets: number;
  quoi: string;
  pleinePage?: boolean;
}

/** Une capture, vérifiée, recadrée et compressée. Ne lève pas. */
async function capturer(
  siteId: string,
  url: string,
  { fenetre, largeurDemandee, largeurFinale, hauteurFinale, maxOctets, quoi, pleinePage }: OptionsCapture,
): Promise<{ bytes: Buffer | null; warning?: string }> {
  let raw: ArrayBuffer;
  try {
    const visual = await renderViewportShot(url, {
      width: largeurDemandee,
      height: hauteurFinale,
      viewportWidth: fenetre,
      pleinePage,
    });
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
    return { bytes: await normaliser(raw, largeurFinale, hauteurFinale, maxOctets) };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "image illisible";
    console.warn(`[og] capture ${quoi} ${siteId} non traitable : ${reason}`);
    return { bytes: null, warning: `Capture ${quoi} illisible (${reason}).` };
  }
}

/**
 * Met la capture aux dimensions exactes attendues par la carte, puis compresse.
 *
 * `fit: "cover"` avec `position: "top"` fait les deux choses qui comptent :
 * l'image occupe toute la largeur — donc plus rien n'est coupé sur les côtés —
 * et c'est le HAUT de la page qui est conservé quand elle est trop longue.
 * C'est le seul cadrage défendable : le haut d'un site, c'est son identité et
 * son appel à l'action, pas son pied de page.
 *
 * Le redimensionnement se fait ICI plutôt que chez le service de capture parce
 * que celui-ci rogne au lieu de réduire hors mode `fullpage` (voir
 * `ViewportShotOptions.pleinePage`). En mode page entière, l'image reçue fait
 * plusieurs milliers de pixels de haut : c'est ce cadrage qui n'en garde que
 * le premier écran.
 */
async function normaliser(
  input: ArrayBuffer,
  largeur: number,
  hauteur: number,
  maxOctets: number,
): Promise<Buffer> {
  const source = Buffer.from(input);
  const cadrer = () =>
    sharp(source).resize({ width: largeur, height: hauteur, fit: "cover", position: "top" });

  for (const quality of [80, 68, 55]) {
    const out = await cadrer().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxOctets) return out;
  }
  return cadrer().jpeg({ quality: 45, mozjpeg: true }).toBuffer();
}
