import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { putOgAsset, contentHash } from "@/lib/og/storage";
import { updateDroppingMissingColumns } from "@/lib/schema-drift";

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

/** Le logo est posé nu sur la carte, en grand : 480 px de côté au maximum. */
const MAX_LOGO_PX = 480;

/**
 * En dessous de cette clarté moyenne, un logo posé nu sur le dégradé bleu nuit
 * de la carte devient illisible.
 *
 * Le cas est loin d'être marginal : la plupart des logos d'artisan sont du texte
 * noir ou bordeaux sur fond transparent, dessinés pour un papier blanc. Sur ces
 * logos-là, et sur eux seuls, la carte pose une plaque claire — sinon on ne
 * montrerait au prospect qu'un rectangle vide à la place de sa marque.
 *
 * Mesuré sur les pixels VISIBLES uniquement (voir plus bas) : la transparence
 * majoritaire d'un PNG de logo tirerait sinon toute moyenne vers le noir.
 */
const SEUIL_CLARTE = 118;

export type EnsureOgLogoResult = {
  url: string | null;
  /** Vrai quand le logo a besoin d'une plaque claire pour rester lisible. */
  sombre?: boolean;
  warning?: string;
};

/**
 * Le nom du dérivé porte l'empreinte de sa SOURCE, en plus de celle de son
 * contenu — `logo-{source}-{contenu}.png`.
 *
 * LE DÉFAUT QUE ÇA CORRIGE : le dérivé était réutilisé dès qu'il existait, sans
 * jamais regarder d'où il venait. Un client envoie son vrai logo, l'opérateur
 * remplace celui de la fiche, refabrique la carte — et la carte ressort avec
 * l'ANCIEN logo, indéfiniment. Le seul recours était de forcer, donc de savoir
 * qu'il fallait forcer.
 *
 * Comparer les empreintes de source coûte zéro appel réseau et répond à la seule
 * question qui compte : « ce fichier vient-il bien du logo d'aujourd'hui ? ».
 * Invalider à la publication, l'autre piste, ne couvrait pas le cas le plus
 * courant — corriger un logo sans republier — et repayait un téléchargement à
 * chaque republication d'un logo inchangé.
 */
function jetonSource(source: string): string {
  return contentHash(Buffer.from(source, "utf8")).slice(0, 8);
}

/** Ce dérivé a-t-il bien été fabriqué à partir de CETTE source ? */
function vientDe(existingUrl: string, source: string): boolean {
  return existingUrl.includes(`/logo-${jetonSource(source)}-`);
}

export async function ensureOgLogo(
  supabase: SupabaseClient,
  siteId: string,
  logoUrl: string | null | undefined,
  opts: { force?: boolean; existingUrl?: string | null; existingSombre?: boolean | null } = {},
): Promise<EnsureOgLogoResult> {
  const source = (logoUrl ?? "").trim();
  if (!source) return { url: null };
  if (
    !opts.force &&
    opts.existingUrl &&
    opts.existingSombre != null &&
    vientDe(opts.existingUrl, source)
  ) {
    return { url: opts.existingUrl, sombre: opts.existingSombre };
  }

  /**
   * Un échec passager ne fait pas disparaître la marque de la carte.
   *
   * Le dérivé précédent est un PNG déjà normalisé, déposé chez nous : il reste
   * parfaitement affichable. Renvoyer `null` refabriquait une carte SANS logo
   * par-dessus une carte qui en avait un — un serveur d'images momentanément
   * indisponible suffisait à dégrader la vignette d'un client.
   */
  const repli = (raison: string): EnsureOgLogoResult =>
    opts.existingUrl
      ? {
          url: opts.existingUrl,
          sombre: opts.existingSombre ?? undefined,
          warning: `${raison} Le logo précédent a été conservé.`,
        }
      : { url: null, warning: raison };

  let raw: ArrayBuffer;
  try {
    const res = await fetch(source, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return repli(`Logo inaccessible (HTTP ${res.status}).`);
    raw = await res.arrayBuffer();
    if (raw.byteLength === 0) return repli("Logo vide.");
  } catch (e) {
    const reason = e instanceof Error ? e.message : "téléchargement impossible";
    console.warn(`[og] logo ${siteId} non téléchargé : ${reason}`);
    return repli(`Logo non téléchargé (${reason}).`);
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
    return repli(`Logo non converti (${reason}).`);
  }

  const sombre = await logoTropSombre(png);

  const put = await putOgAsset(supabase, {
    prefix: siteId,
    name: `logo-${jetonSource(source)}`,
    ext: "png",
    contentType: "image/png",
    bytes: png,
  });
  if (!put.ok) return repli(`Logo non enregistré (${put.error}).`);

  // `og_logo_sombre` vient d'une migration plus tardive que `og_logo_url` : sans
  // cette tolérance, son absence ferait échouer l'écriture des DEUX colonnes.
  const { error } = await updateDroppingMissingColumns(
    { og_logo_url: put.publicUrl, og_logo_sombre: sombre },
    (patch) => supabase.from("sites").update(patch).eq("id", siteId),
    (colonne) => console.warn(`[og] colonne « ${colonne} » absente — logo enregistré sans elle.`),
  );
  if (error) console.warn(`[og] og_logo_url non enregistrée (${siteId}) : ${error.message}`);

  return { url: put.publicUrl, sombre };
}

/**
 * Le logo est-il trop sombre pour être posé nu sur le fond de la carte ?
 *
 * LA MESURE NE PORTE QUE SUR LES PIXELS VISIBLES, et c'est tout l'enjeu. Un PNG
 * de logo est majoritairement TRANSPARENT : une moyenne naïve sur l'image
 * entière est dominée par le vide, pas par le dessin.
 *
 * Aplatir sur blanc avant de mesurer donnerait même l'inverse de la bonne
 * réponse : un logo « texte noir sur transparent » — le cas exact qu'on veut
 * protéger — ressort à 230 de clarté, donc jugé clair, donc posé nu et invisible.
 *
 * D'où la pondération par le canal alpha : chaque pixel compte à hauteur de son
 * opacité. Le résultat est la clarté du DESSIN, indépendante de sa surface.
 *
 * Une image sans canal alpha (logo déjà aplati sur son propre fond) est mesurée
 * telle quelle : elle s'affichera avec ce fond, ce qui la rend lisible de toute
 * façon.
 */
export async function logoTropSombre(png: Buffer | Uint8Array): Promise<boolean> {
  try {
    const { data, info } = await sharp(Buffer.from(png))
      // Miniature : la statistique n'a pas besoin de la pleine résolution.
      .resize({ width: 120, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const canaux = info.channels;
    let sommeClarte = 0;
    let sommeAlpha = 0;

    for (let i = 0; i < data.length; i += canaux) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.15) continue; // quasi transparent : ne se voit pas
      // Luminance perçue : l'œil est bien plus sensible au vert qu'au bleu, et
      // une moyenne arithmétique jugerait un bleu marine plus clair qu'il n'est.
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sommeClarte += luminance * alpha;
      sommeAlpha += alpha;
    }

    // Aucun pixel visible : rien à protéger, et rien à afficher non plus.
    if (sommeAlpha === 0) return false;
    return sommeClarte / sommeAlpha < SEUIL_CLARTE;
  } catch {
    // Dans le doute, on considère le logo sombre : une plaque inutile est
    // discrète, un logo invisible ne l'est pas.
    return true;
  }
}
