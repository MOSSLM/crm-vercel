import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderViewportShot } from "@/lib/site-builder/render-provider";
import { putOgAsset } from "@/lib/og/storage";
import { imageQuasiVide } from "@/lib/images/image-quasi-vide";
import { urlPourCapture } from "@/lib/site-builder/demo-share-url";
import { updateDroppingMissingColumns } from "@/lib/schema-drift";

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
 * Capture `demoUrl`, normalise, dépose, et écrit `sites.og_shot_*`.
 *
 * Ne refait que ce qui manque : les deux images ont chacune leur condition, donc
 * un appel qui ne trouve que le téléphone absent ne repaie pas la capture
 * ordinateur. Les deux déjà là et pas de `force` : on ressort sans rien faire —
 * c'est ce qui permet au dialogue « Partager » d'appeler à chaque ouverture.
 */
export async function ensureDemoScreenshot(
  supabase: SupabaseClient,
  siteId: string,
  demoUrl: string,
  opts: { force?: boolean; existingUrl?: string | null; existingMobileUrl?: string | null } = {},
): Promise<EnsureDemoScreenshotResult> {
  const ancienneOrdi = opts.existingUrl ?? null;
  const ancienneMobile = opts.existingMobileUrl ?? null;

  // CHAQUE CAPTURE A SON PROPRE VERDICT, et c'est ce qui répare le téléphone
  // manquant à vie. La condition de sortie portait sur la seule capture
  // ordinateur : un échec ponctuel du mobile — un timeout du service, pas même
  // une panne — laissait `og_shot_mobile_url` à `null`, et tout appel suivant
  // ressortait aussitôt sur la foi de l'ordinateur. Le téléphone ne revenait
  // JAMAIS sur cette carte, sauf à forcer à la main sans savoir qu'il manquait.
  const refaireOrdi = Boolean(opts.force) || !ancienneOrdi;
  const refaireMobile = Boolean(opts.force) || !ancienneMobile;
  if (!refaireOrdi && !refaireMobile) return { url: ancienneOrdi, mobileUrl: ancienneMobile };

  // LES CAPTURES EN PARALLÈLE, et c'est le point important : thum.io met une
  // quinzaine de secondes par capture (appel de chauffe + attente). En série, la
  // carte demanderait une demi-minute et l'opérateur abandonnerait. Menées
  // ensemble, elles coûtent le temps de la plus lente.
  // Le marqueur demande à la page de retirer ce qui n'a rien à faire dans une
  // vignette de vente — aujourd'hui la barre « Acheter ce site ».
  const urlCapture = urlPourCapture(demoUrl);

  const [ordinateur, mobile] = await Promise.all([
    refaireOrdi
      ? capturer(siteId, urlCapture, {
          fenetre: SHOT_WIDTH,
          largeurDemandee: SHOT_WIDTH,
          largeurFinale: 1200,
          hauteurFinale: 750,
          maxOctets: MAX_SHOT_BYTES,
          quoi: "ordinateur",
        })
      : RIEN_A_FAIRE,
    refaireMobile
      ? capturer(siteId, urlCapture, {
          fenetre: MOBILE_WIDTH,
          // On demande DEUX FOIS la largeur de la fenêtre : le rendu mobile est
          // en densité 2, et partir d'une source à cette densité donne une
          // réduction nette plutôt qu'un agrandissement flou.
          largeurDemandee: MOBILE_WIDTH * 2,
          largeurFinale: MOBILE_WIDTH,
          hauteurFinale: MOBILE_HEIGHT,
          maxOctets: MAX_MOBILE_BYTES,
          quoi: "mobile",
          // Indispensable : sans `fullpage`, le service rogne la largeur au lieu
          // de la réduire, et on perd la colonne de droite (menu burger compris).
          pleinePage: true,
        })
      : RIEN_A_FAIRE,
  ]);

  const [depotOrdi, depotMobile] = await Promise.all([
    deposer(supabase, siteId, "shot", ordinateur.bytes),
    deposer(supabase, siteId, "shot-mobile", mobile.bytes),
  ]);

  // UNE CAPTURE RATÉE NE DÉTRUIT PAS CELLE QU'ON AVAIT. Sur un « Refaire »,
  // l'échec renvoyait `null`, et la carte se refabriquait sans mockup PAR-DESSUS
  // une carte correcte : un clic censé améliorer la vignette la dégradait. Pire,
  // les anciennes images sortaient alors de la liste des fichiers à conserver et
  // devenaient éligibles au nettoyage. Une capture d'hier vaut mille fois mieux
  // que pas d'image du tout.
  const urlOrdi = depotOrdi?.ok ? depotOrdi.publicUrl : ancienneOrdi;
  const urlMobile = depotMobile?.ok ? depotMobile.publicUrl : ancienneMobile;

  const warning = motif(
    { resultat: ordinateur, depot: depotOrdi, ancienne: ancienneOrdi, quoi: "ordinateur" },
    { resultat: mobile, depot: depotMobile, ancienne: ancienneMobile, quoi: "mobile" },
  );

  // Sans mockup, la carte bascule sur sa variante centrée — et le téléphone
  // n'aurait aucun sens tout seul au milieu du vide.
  if (!urlOrdi) return { url: null, mobileUrl: null, warning };

  // Rien de neuf à écrire : les deux dépôts ont échoué et on repart sur ce qui
  // était déjà en base. Réécrire les mêmes valeurs ne ferait que remettre à zéro
  // `og_shot_at`, donc mentir sur la fraîcheur des images.
  if (depotOrdi?.ok || depotMobile?.ok) {
    // L'écriture est best-effort et tolérante aux colonnes manquantes :
    // `og_shot_mobile_url` vient d'une migration plus tardive que `og_shot_url`,
    // et un `update` qui nomme une colonne absente échoue en bloc — l'URL du
    // mockup aurait été perdue avec celle du téléphone.
    const { error } = await updateDroppingMissingColumns(
      { og_shot_url: urlOrdi, og_shot_mobile_url: urlMobile, og_shot_at: new Date().toISOString() },
      (patch) => supabase.from("sites").update(patch).eq("id", siteId),
      (colonne) => console.warn(`[og] colonne « ${colonne} » absente — capture enregistrée sans elle.`),
    );
    if (error) console.warn(`[og] og_shot_url non enregistrée (${siteId}) : ${error.message}`);
  }

  return { url: urlOrdi, mobileUrl: urlMobile, warning };
}

/** Capture non demandée : celle en base est encore bonne. */
const RIEN_A_FAIRE: ResultatCapture = { bytes: null };

/** Dépose une capture fraîche. `null` quand il n'y en a pas à déposer. */
async function deposer(
  supabase: SupabaseClient,
  siteId: string,
  name: string,
  bytes: Buffer | null,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string } | null> {
  if (!bytes) return null;
  const put = await putOgAsset(supabase, {
    prefix: siteId,
    name,
    ext: "jpg",
    contentType: "image/jpeg",
    bytes,
  });
  if (!put.ok) console.warn(`[og] dépôt ${name} ${siteId} échoué : ${put.error}`);
  return put.ok ? { ok: true, publicUrl: put.publicUrl } : { ok: false, error: put.error };
}

interface Volet {
  resultat: ResultatCapture;
  depot: { ok: boolean; error?: string } | null;
  ancienne: string | null;
  quoi: string;
}

/**
 * Le motif à afficher à l'opérateur, une fois les replis pris en compte.
 *
 * La nuance qui compte pour lui : une capture ratée dont on a gardé l'ancienne
 * image donne une carte présentable mais DATÉE, alors qu'une capture ratée sans
 * repli donne une carte amputée. Les deux méritent d'être signalées, pas de la
 * même façon — et une image simplement conservée ne mérite pas l'alarme d'un
 * échec sec.
 */
function motif(...volets: Volet[]): string | undefined {
  const messages = volets.flatMap((v) => {
    const echec = v.resultat.warning ?? (v.depot && !v.depot.ok ? `Capture ${v.quoi} non enregistrée (${v.depot.error}).` : null);
    if (!echec) return [];
    return [v.ancienne ? `${echec} L'image ${v.quoi} précédente a été conservée.` : echec];
  });
  return messages.length ? messages.join(" ") : undefined;
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

interface ResultatCapture {
  bytes: Buffer | null;
  warning?: string;
}

/** Une capture, vérifiée, recadrée et compressée. Ne lève pas. */
async function capturer(
  siteId: string,
  url: string,
  { fenetre, largeurDemandee, largeurFinale, hauteurFinale, maxOctets, quoi, pleinePage }: OptionsCapture,
): Promise<ResultatCapture> {
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
