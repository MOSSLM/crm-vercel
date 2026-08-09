import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderViewportShot } from "@/lib/site-builder/render-provider";
import { putOgAsset } from "@/lib/og/storage";
import { imageQuasiVide } from "@/lib/images/image-quasi-vide";
import { collecter } from "./collect";
import { analyser } from "./analyze";
import { scorer } from "./score";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";

/**
 * Les deux compléments « chers » de l'analyse : la capture du site actuel et la
 * mesure du démo.
 *
 * POURQUOI ILS SONT SÉPARÉS DU PASSAGE EN MASSE. Une capture coûte plusieurs
 * secondes et un appel à un service tiers ; analyser le démo coûte un second
 * aller-retour. Les faire sur les 2 800 entreprises du parc serait absurde :
 * l'immense majorité ne sera jamais démarchée. On ne les fait donc que pour les
 * entreprises réellement travaillées — bouton « Analyser », ouverture du
 * dialogue de partage, préparation d'un rapport.
 *
 * LA CAPTURE 390 PX REND DEUX SERVICES POUR UN COÛT :
 *   - c'est la seule mesure de rendu mobile RÉELLE dont on dispose sans
 *     navigateur (le reste se déduit du HTML) ;
 *   - c'est l'image « avant » de l'écran comparatif du rapport, celui qui vend.
 *
 * LA MESURE DU DÉMO est l'argument commercial le plus fort du chantier : le même
 * analyseur, les mêmes seuils, appliqués au site actuel et à celui qu'on
 * propose. Personne ne peut contester une comparaison faite avec un seul
 * instrument.
 *
 * Aucune des deux ne lève : ce sont des bonus, et leur absence dégrade le
 * rapport sans l'empêcher.
 */

/** Largeur d'un téléphone courant — la même que le rendu mobile du rapport. */
const LARGEUR_MOBILE = 390;
const HAUTEUR_MOBILE = 780;
const MAX_BYTES = 220 * 1024;

export interface EnrichirResult {
  captureUrl: string | null;
  noteDemo: number | null;
  avertissements: string[];
}

/**
 * Capture le site actuel et, si un démo publié existe, le mesure lui aussi.
 * Écrit les colonnes correspondantes. Best-effort de bout en bout.
 */
export async function enrichirAnalyse(
  sb: SupabaseClient,
  entrepriseId: number,
  opts: { urlActuelle?: string | null; force?: boolean } = {},
): Promise<EnrichirResult> {
  const avertissements: string[] = [];

  const { data } = await sb
    .from("entreprises_audit_site")
    .select("capture_url, url_finale, url_analysee, injoignable")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  const ligne = data as {
    capture_url: string | null;
    url_finale: string | null;
    url_analysee: string | null;
    injoignable: boolean | null;
  } | null;

  const url = opts.urlActuelle ?? ligne?.url_finale ?? ligne?.url_analysee ?? null;

  const [capture, demo] = await Promise.all([
    // Capturer un site injoignable produirait une page d'erreur du service de
    // capture, affichée comme si c'était le site du prospect. On s'abstient.
    ligne?.injoignable || !url
      ? Promise.resolve<{ url: string | null; avertissement?: string }>({ url: null })
      : capturerSite(sb, entrepriseId, url, { force: opts.force, existante: ligne?.capture_url }),
    mesurerDemo(sb, entrepriseId),
  ]);

  if (capture.avertissement) avertissements.push(capture.avertissement);
  if (demo.avertissement) avertissements.push(demo.avertissement);

  return { captureUrl: capture.url, noteDemo: demo.note, avertissements };
}

async function capturerSite(
  sb: SupabaseClient,
  entrepriseId: number,
  url: string,
  opts: { force?: boolean; existante?: string | null },
): Promise<{ url: string | null; avertissement?: string }> {
  if (!opts.force && opts.existante) return { url: opts.existante };

  let brut: ArrayBuffer;
  try {
    const visuel = await renderViewportShot(url, { width: LARGEUR_MOBILE, height: HAUTEUR_MOBILE });
    brut = visuel.bytes;
  } catch (e) {
    const motif = e instanceof Error ? e.message : "capture impossible";
    console.warn(`[audit-site] capture ${entrepriseId} échouée : ${motif}`);
    return { url: null, avertissement: `Capture du site actuel indisponible (${motif}).` };
  }

  // Même filet que pour le démo : une capture blanche du site du prospect
  // apparaîtrait dans l'écran « avant / après » du rapport, et donnerait
  // l'impression qu'on truque la comparaison.
  if (await imageQuasiVide(brut)) {
    return {
      url: null,
      avertissement: "Le site n'a pas fini de s'afficher au moment de la capture.",
    };
  }

  let image: Buffer;
  try {
    image = await compresser(brut);
  } catch (e) {
    return { url: null, avertissement: `Capture illisible (${e instanceof Error ? e.message : "?"}).` };
  }

  const put = await putOgAsset(sb, {
    prefix: `audit/${entrepriseId}`,
    name: "actuel",
    ext: "jpg",
    contentType: "image/jpeg",
    bytes: image,
  });
  if (!put.ok) return { url: null, avertissement: `Capture non enregistrée (${put.error}).` };

  const { error } = await sb
    .from("entreprises_audit_site")
    .update({ capture_url: put.publicUrl, capture_le: new Date().toISOString() })
    .eq("entreprise_id", entrepriseId);
  if (error) console.warn(`[audit-site] capture_url non enregistrée : ${error.message}`);

  return { url: put.publicUrl };
}

/**
 * Fait tourner l'analyseur sur NOTRE démo, avec les mêmes seuils.
 *
 * Aucun contexte d'entreprise n'est passé au scoreur (`nombreAvis` notamment) :
 * la comparaison doit porter sur ce que le site fait, pas sur ce que
 * l'entreprise possède par ailleurs. Sinon le démo serait avantagé ou pénalisé
 * par une donnée qui n'est pas dans la page.
 */
async function mesurerDemo(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<{ note: number | null; avertissement?: string }> {
  const { data } = await sb
    .from("sites")
    .select("id, published_subdomain, is_published")
    .eq("enterprise_id", entrepriseId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const site = data as { id: string; published_subdomain: string | null; is_published: boolean } | null;
  if (!site) return { note: null };

  const url = demoShareUrl(site);
  try {
    const collecte = await collecter(url);
    const signaux = analyser(collecte);
    const score = scorer(signaux);

    await sb
      .from("entreprises_audit_site")
      .update({
        note_globale_demo: score.noteGlobale,
        notes_demo: Object.fromEntries(
          Object.entries(score.axes).map(([id, a]) => [id, a.note]),
        ),
        demo_site_id: site.id,
        demo_analyse_le: new Date().toISOString(),
      })
      .eq("entreprise_id", entrepriseId);

    return { note: score.noteGlobale };
  } catch (e) {
    const motif = e instanceof Error ? e.message : "analyse impossible";
    console.warn(`[audit-site] mesure du démo ${entrepriseId} échouée : ${motif}`);
    return { note: null, avertissement: `Comparaison indisponible (${motif}).` };
  }
}

async function compresser(input: ArrayBuffer): Promise<Buffer> {
  const base = sharp(Buffer.from(input)).resize({ width: 780, withoutEnlargement: true });
  for (const quality of [80, 68, 55]) {
    const out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  return base.clone().jpeg({ quality: 45, mozjpeg: true }).toBuffer();
}
