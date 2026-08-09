/**
 * Browser-rendering provider abstraction for the visual site import.
 *
 * Chromium can't run inside a Vercel function (50 MB limit), and Supabase Edge
 * Functions (Deno) can't bundle it either, so the "render the page like a real
 * browser" step is delegated to an external HTTP API. The provider is selected
 * by env (`RENDER_PROVIDER`, default "screenshotone") and is a drop-in seam:
 * swap to a scriptable/per-section provider later without touching callers.
 *
 * It returns a page-rendered visual (a paginated PDF by default — each page is
 * rasterized at full resolution by Claude, avoiding the "one giant downscaled
 * image" legibility problem) and, when the provider supports it, the rendered
 * (JS-executed) HTML to replace the plain `fetchPageHtml` text path.
 *
 * When no API key is configured, `renderProviderConfigured()` is false and the
 * UI falls back to manual visual upload (e.g. a GoFullPage PDF).
 */
import { RENDER_API_KEY, RENDER_API_URL, RENDER_PROVIDER } from "@/env";

export interface RenderedVisual {
  mime: string;
  bytes: ArrayBuffer;
}

export interface RenderResult {
  /** Rendered HTML after JS execution, when the provider returns it. */
  renderedHtml?: string;
  /** Full-page visual (PDF or image) of the rendered page. */
  visual?: RenderedVisual;
}

export interface RenderOptions {
  signal?: AbortSignal;
}

export class RenderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RenderError";
    this.status = status;
  }
}

/** True when an external render provider is configured. */
export function renderProviderConfigured(): boolean {
  return !!RENDER_API_KEY;
}

/** Render a page via the configured provider. Throws RenderError on failure. */
export async function renderPage(url: string, opts: RenderOptions = {}): Promise<RenderResult> {
  if (!RENDER_API_KEY) throw new RenderError("Rendu automatique non configuré.", 501);
  const provider = (RENDER_PROVIDER || "screenshotone").toLowerCase();

  switch (provider) {
    case "screenshotone":
      return renderScreenshotOne(url, opts);
    default:
      throw new RenderError(`Provider de rendu non supporté : ${provider}.`, 501);
  }
}

/**
 * ScreenshotOne (https://screenshotone.com) — generous no-card free tier,
 * executes JS, returns a full-page **paginated PDF**. Does not return rendered
 * HTML, so `renderedHtml` stays undefined and the caller keeps the plain-fetch
 * HTML. `RENDER_API_URL` overrides the endpoint for self-hosted deployments.
 */
async function renderScreenshotOne(url: string, opts: RenderOptions): Promise<RenderResult> {
  const base = RENDER_API_URL || "https://api.screenshotone.com/take";
  const params = new URLSearchParams({
    access_key: RENDER_API_KEY as string,
    url,
    full_page: "true",
    format: "pdf",
    block_cookie_banners: "true",
    block_ads: "true",
    cache: "true",
  });

  let res: Response;
  try {
    res = await fetch(`${base}?${params.toString()}`, {
      signal: opts.signal ?? AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new RenderError(aborted ? "Le rendu de la page a expiré." : "Service de rendu injoignable.", 504);
  }
  if (!res.ok) {
    throw new RenderError(`Le service de rendu a répondu ${res.status}.`, res.status === 429 ? 429 : 502);
  }
  const bytes = await res.arrayBuffer();
  return { visual: { mime: "application/pdf", bytes } };
}

// ---------------------------------------------------------------------------
// Mode « vignette » : une capture d'écran unique, au format image
// ---------------------------------------------------------------------------
// `renderPage` ci-dessus rend un PDF paginé pleine page pour l'import IA. La
// carte OpenGraph et le rapport d'audit ont un besoin différent : UNE image du
// premier écran, légère, dans un rapport d'aspect donné.
//
// Deux fournisseurs, et la présence du second n'est pas un luxe : sans lui, la
// preview sociale ne fonctionnerait que chez qui a posé `RENDER_API_KEY`.
// thum.io ne demande aucune clé et est déjà utilisé dans le dépôt
// (`AuditPage1.tsx`, `htmlPage1.ts`) — à ceci près qu'il y est appelé depuis un
// `<img>` du NAVIGATEUR, avec l'URL du prospect en clair et sans le moindre
// cache. Ici l'appel est serveur, le résultat atterrit dans notre bucket, et
// c'est notre URL que le deck et le rapport servent ensuite.

export interface ViewportShotOptions extends RenderOptions {
  /** Largeur de l'IMAGE produite. */
  width?: number;
  height?: number;
  /**
   * Largeur de la FENÊTRE du navigateur — c'est elle qui décide de la mise en
   * page rendue. À défaut, `width`.
   *
   * LA DISTINCTION N'EST PAS UN DÉTAIL, c'est la différence entre montrer un
   * site mobile et montrer un site desktop rétréci. Chez thum.io, `width` ne
   * règle que la taille du fichier de sortie : la page est rendue dans une
   * fenêtre desktop puis redimensionnée. Demander une image de 390 px de large
   * sans toucher à la fenêtre produit donc un site desktop miniature et
   * illisible — exactement ce qu'on ne veut pas mettre dans un cadre de
   * téléphone sur une carte de vente.
   */
  viewportWidth?: number;
  /** Qualité JPEG (ScreenshotOne uniquement). */
  quality?: number;
}

const SHOT_TIMEOUT_MS = 30_000;

/** True quand une capture est possible — toujours vrai, thum.io ne demande rien. */
export function viewportShotAvailable(): boolean {
  return true;
}

/**
 * Capture le premier écran de `url` et renvoie une image.
 *
 * Ne suit PAS la discipline « throw » de `renderPage` par accident : elle jette
 * bien, mais tous ses appelants (`ensure-demo-screenshot`, l'analyseur) rattrapent
 * et continuent sans image. Une capture manquante dégrade la carte OG, elle ne
 * doit jamais empêcher une publication ni une analyse.
 */
export async function renderViewportShot(
  url: string,
  opts: ViewportShotOptions = {},
): Promise<RenderedVisual> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 800;
  // La fenêtre suit la largeur demandée par défaut : c'est le cas courant, et
  // c'est ce qui rend une capture « mobile » réellement mobile.
  const viewportWidth = opts.viewportWidth ?? width;
  return RENDER_API_KEY
    ? shotScreenshotOne(url, width, height, viewportWidth, opts)
    : shotThumIo(url, width, height, viewportWidth, opts);
}

async function shotScreenshotOne(
  url: string,
  width: number,
  height: number,
  viewportWidth: number,
  opts: ViewportShotOptions,
): Promise<RenderedVisual> {
  const base = RENDER_API_URL || "https://api.screenshotone.com/take";
  const params = new URLSearchParams({
    access_key: RENDER_API_KEY as string,
    url,
    format: "jpg",
    full_page: "false",
    viewport_width: String(viewportWidth),
    viewport_height: String(height),
    // Émulation mobile complète en dessous de 500 px : sans elle, un site peut
    // servir sa version desktop malgré une fenêtre étroite, en se fiant à
    // l'agent utilisateur ou au type de pointeur.
    ...(viewportWidth <= 500 ? { device_scale_factor: "2", is_mobile: "true", has_touch: "true" } : {}),
    image_quality: String(opts.quality ?? 82),
    block_cookie_banners: "true",
    block_ads: "true",
    cache: "true",
    // Attendre que le réseau se calme AVANT de déclencher l'obturateur : les
    // sites du parc sont des Claude Designs qui chargent Tailwind depuis un CDN
    // en script synchrone, plus leurs propres polices. Photographiés « au
    // chargement », ils rendent une page nue.
    wait_until: "networkidle2",
    // Marge après le calme réseau, le temps que la peinture se fasse.
    delay: "3",
    timeout: "30",
  });
  return fetchShot(`${base}?${params.toString()}`, "image/jpeg", opts.signal);
}

/**
 * thum.io — pas de clé, pas de compte. Deux pièges, tous les deux constatés en
 * production.
 *
 * 1. L'URL cible est encodée dans le CHEMIN, pas dans un paramètre :
 *    `…/get/width/1200/crop/800/https://exemple.fr`. Elle ne doit donc surtout
 *    pas être `encodeURIComponent`ée, sinon le service reçoit une URL littérale
 *    avec des `%3A` et renvoie une image d'erreur en 200.
 *
 * 2. **LE PREMIER APPEL NE RENVOIE PAS LA CAPTURE.** thum.io répond
 *    immédiatement par une image d'attente — un fond blanc avec une roue et son
 *    logo — et lance la capture en arrière-plan. C'est cette image d'attente qui
 *    se retrouvait intégrée à la carte de partage, ce qui donnait une vignette
 *    parfaite… avec une page blanche dedans.
 *
 * D'où le déroulé ci-dessous : un appel de chauffe qu'on JETTE, une pause, puis
 * l'appel qui compte. Et une vérification derrière, parce qu'un site lent peut
 * ne pas être prêt même après la pause.
 */

/** Pause avant l'appel utile — le temps que thum.io ait rendu la page. */
const THUMIO_CHAUFFE_MS = 7_000;
/** Rallonge quand la première tentative rend encore une image d'attente. */
const THUMIO_RALLONGE_MS = 9_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shotThumIo(
  url: string,
  width: number,
  height: number,
  viewportWidth: number,
  opts: ViewportShotOptions,
): Promise<RenderedVisual> {
  // `wait` demande à thum.io d'attendre le chargement AVANT de déclencher son
  // obturateur. Le paramètre n'est pas garanti par leur documentation publique :
  // s'il fait échouer l'appel, on retombe sur la forme sans lui plutôt que de
  // perdre la capture.
  // `viewportWidth` AVANT `width` : le premier fixe la fenêtre du navigateur —
  // donc la mise en page — le second la taille du fichier rendu. Les confondre
  // produit un site desktop rétréci (voir `ViewportShotOptions.viewportWidth`).
  const fenetre = `viewportWidth/${viewportWidth}/width/${width}/crop/${height}`;
  const avecAttente = (secondes: number) =>
    `https://image.thum.io/get/${fenetre}/wait/${secondes}/noanimate/${url}`;
  // Repli sans `viewportWidth` ni `wait` : si thum.io ne reconnaît pas une de
  // ces options, mieux vaut une capture desktop qu'aucune capture. L'appelant
  // écarte ensuite le téléphone si les deux images se ressemblent trop.
  const sansAttente = `https://image.thum.io/get/width/${width}/crop/${height}/${url}`;

  const tenter = async (endpoint: string, repli: string): Promise<RenderedVisual> => {
    try {
      return await fetchShot(endpoint, "image/jpeg", opts.signal);
    } catch {
      return fetchShot(repli, "image/jpeg", opts.signal);
    }
  };

  // Appel de chauffe : son résultat est l'image d'attente, on ne le garde pas.
  // Il sert uniquement à déclencher la génération côté thum.io.
  const chauffe = await tenter(avecAttente(8), sansAttente).catch(() => null);
  await dormir(THUMIO_CHAUFFE_MS);

  const premier = await tenter(avecAttente(8), sansAttente);

  // Identique à l'appel de chauffe ⇒ rien n'a bougé, c'est encore l'image
  // d'attente. On laisse une seconde chance, plus longue.
  //
  // La comparaison d'octets est plus fiable qu'un seuil sur le contenu :
  // l'image d'attente est rigoureusement la même à chaque appel, alors que deux
  // captures d'une vraie page diffèrent dès que quelque chose a fini de charger.
  if (chauffe && memesOctets(chauffe.bytes, premier.bytes)) {
    await dormir(THUMIO_RALLONGE_MS);
    return tenter(avecAttente(12), sansAttente);
  }
  return premier;
}

function memesOctets(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}

async function fetchShot(
  endpoint: string,
  mime: string,
  signal: AbortSignal | undefined,
): Promise<RenderedVisual> {
  let res: Response;
  try {
    res = await fetch(endpoint, { signal: signal ?? AbortSignal.timeout(SHOT_TIMEOUT_MS) });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new RenderError(aborted ? "La capture a expiré." : "Service de capture injoignable.", 504);
  }
  if (!res.ok) {
    throw new RenderError(`Le service de capture a répondu ${res.status}.`, res.status === 429 ? 429 : 502);
  }
  const bytes = await res.arrayBuffer();
  // Un service de capture qui échoue répond parfois 200 avec quelques octets de
  // texte. Sans ce garde-fou on déposerait ça dans le bucket comme une image.
  if (bytes.byteLength < 1024) {
    throw new RenderError("Capture vide ou tronquée.", 502);
  }
  return { mime, bytes };
}
