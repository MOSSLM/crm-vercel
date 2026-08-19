/**
 * Reconnaître la technologie d'un site à partir du HTML déjà collecté.
 *
 * AUCUN APPEL RÉSEAU ICI. `collect.ts` a déjà tout ce qu'il faut sous la main —
 * le HTML de la page — donc cette reconnaissance ne coûte rien de plus que ce
 * qui est déjà payé pour le reste de l'audit. C'est la même logique que
 * `analyze.ts` : des faits comptés, pas un jugement.
 *
 * WORDPRESS D'ABORD, ET EN PROFONDEUR, parce que c'est de loin le plus commun
 * chez les artisans (le vivier « plateforme » de `domaines_classes.sql` le
 * confirme : wordpress y figure aux côtés de wixsite, jimdo, e-monsite) et
 * parce que trois preuves indépendantes y survivent même quand Yoast SEO —
 * réglage par défaut — retire la balise `<meta name="generator">` :
 *   1. les chemins d'assets (`/wp-content/`, `/wp-includes/`, `/wp-json`)
 *   2. le numéro de version en requête sur un fichier du cœur
 *      (`wp-includes/js/wp-embed.min.js?ver=6.4.3`)
 *   3. le thème, lisible dans `/wp-content/themes/<slug>/`
 */

export interface SignauxTechno {
  /** "wordpress" | "wix" | "shopify"… `null` si aucune signature ne correspond. */
  cms: string | null;
  /** Version du CMS, quand elle est lisible — pour l'instant, WordPress seul. */
  cmsVersion: string | null;
  /** Slug du thème WordPress (`/wp-content/themes/<slug>/`). */
  theme: string | null;
  /** Constructeur de pages détecté par-dessus WordPress — Elementor, Divi… */
  constructeur: string | null;
  /** Le `<meta name="generator">` brut, pour une vérification humaine rapide. */
  generateurBrut: string | null;
}

const VIDE: SignauxTechno = { cms: null, cmsVersion: null, theme: null, constructeur: null, generateurBrut: null };

export function detecterTechno(html: string): SignauxTechno {
  if (!html) return VIDE;

  const generateurBrut = extraireGenerator(html);

  // 1) Le <meta generator>, quand il survit, est la source la plus fiable :
  // c'est le CMS lui-même qui se déclare.
  if (generateurBrut) {
    const versionWp = /wordpress\s*([\d.]+)?/i.exec(generateurBrut)?.[1];
    if (/wordpress/i.test(generateurBrut)) {
      return {
        cms: "wordpress",
        cmsVersion: versionWp ?? versionWordpressParAssets(html),
        theme: themeWordpress(html),
        constructeur: constructeurWordpress(html),
        generateurBrut,
      };
    }
    const connu = AUTRES_GENERATEURS.find(([motif]) => motif.test(generateurBrut));
    if (connu) return { ...VIDE, cms: connu[1], generateurBrut };
  }

  // 2) WordPress sans balise generator : les chemins d'assets suffisent — ils
  // ne dépendent d'aucun réglage de plugin SEO.
  if (/wp-content\/|wp-includes\/|wp-json\b|wp-emoji-release/i.test(html)) {
    return {
      cms: "wordpress",
      cmsVersion: versionWordpressParAssets(html),
      theme: themeWordpress(html),
      constructeur: constructeurWordpress(html),
      generateurBrut,
    };
  }

  // 3) Solutions louées et autres CMS : une ressource chargée depuis leur CDN
  // propre trahit la plateforme même sans une ligne de HTML "à eux".
  const autre = AUTRES_SIGNATURES.find((sig) => sig.motifs.some((m) => m.test(html)));
  if (autre) return { ...VIDE, cms: autre.cms, generateurBrut };

  return { ...VIDE, generateurBrut };
}

function extraireGenerator(html: string): string | null {
  const m =
    /<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /<meta\s+content=["']([^"']+)["']\s+name=["']generator["']/i.exec(html);
  return m?.[1]?.trim() || null;
}

/**
 * La version de WordPress quand la balise `generator` a été retirée. Les
 * fichiers du CŒUR (pas ceux d'un thème ou d'un plugin, dont la version n'a
 * rien à voir) portent la version en requête — `?ver=6.4.3` — tant que le
 * cache-busting par défaut n'a pas été désactivé.
 */
/**
 * La version du CŒUR WordPress, lue sur les seuls fichiers qui la portent.
 *
 * PIÈGE PAYÉ LE 18/08/2026 — NE PAS ÉLARGIR CE FILTRE
 * La version précédente acceptait n'importe quel fichier de `wp-includes/`.
 * Or WordPress y héberge des bibliothèques tierces versionnées POUR ELLES-MÊMES :
 * `wp-includes/js/jquery/jquery.min.js?ver=3.7.1` est jQuery 3.7.1, pas
 * WordPress 3.7.1. Un site en WordPress 6 avec Divi était donc rapporté comme
 * tournant sur une version de 2013 — un chiffre invérifiable, énoncé devant un
 * prospect qui n'a qu'à demander à son webmaster pour ruiner tout le rapport.
 *
 * Les trois motifs ci-dessous sont des fichiers du cœur, dont le `?ver=` est
 * posé par WordPress lui-même. Aucun repli : ne rien afficher vaut infiniment
 * mieux qu'un numéro faux, puisque « WordPress » sans version reste vrai.
 */
function versionWordpressParAssets(html: string): string | null {
  const m =
    /wp-emoji-release\.min\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html) ??
    /wp-includes\/js\/wp-embed\.min\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html) ??
    /wp-includes\/css\/dist\/block-library\/style(?:\.min)?\.css\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html);
  return m?.[1] ?? null;
}

function themeWordpress(html: string): string | null {
  return /wp-content\/themes\/([a-z0-9][a-z0-9._-]*)\//i.exec(html)?.[1] ?? null;
}

/** Une seule capture par page : le premier constructeur reconnu suffit à dater le site. */
const CONSTRUCTEURS_WP: Array<[RegExp, string]> = [
  [/elementor/i, "elementor"],
  [/\bet_pb_|\/themes\/divi\//i, "divi"],
  [/wp-content\/plugins\/js_composer\/|\bvc_row\b/i, "wpbakery"],
  [/wp-content\/themes\/avada/i, "avada"],
  [/wp-content\/plugins\/beaver-builder/i, "beaver-builder"],
  [/wp-content\/themes\/astra/i, "astra"],
  [/wp-content\/themes\/generatepress/i, "generatepress"],
  [/wp-content\/themes\/oceanwp/i, "oceanwp"],
  [/wp-content\/themes\/hello-elementor/i, "hello-elementor"],
];

function constructeurWordpress(html: string): string | null {
  return CONSTRUCTEURS_WP.find(([motif]) => motif.test(html))?.[1] ?? null;
}

/** Ce que la balise `generator` déclare pour les solutions les plus courantes hors WordPress. */
const AUTRES_GENERATEURS: Array<[RegExp, string]> = [
  [/wix\.com/i, "wix"],
  [/squarespace/i, "squarespace"],
  [/shopify/i, "shopify"],
  [/webflow/i, "webflow"],
  [/joomla/i, "joomla"],
  [/drupal/i, "drupal"],
  [/prestashop/i, "prestashop"],
  [/jimdo/i, "jimdo"],
  [/duda|dudamobile/i, "duda"],
];

/**
 * Repli quand la balise `generator` est absente : le domaine d'un asset
 * chargé — CDN propre à la plateforme — reste visible même quand tout le
 * reste a été personnalisé.
 *
 * Domaines déjà vus dans le vivier `domaines_classes.sql` (wixsite,
 * business.site, jimdo, e-monsite) plus les grandes plateformes internationales.
 */
const AUTRES_SIGNATURES: Array<{ cms: string; motifs: RegExp[] }> = [
  { cms: "wix", motifs: [/static\.parastorage\.com/i, /\bwixsite\.com/i] },
  { cms: "squarespace", motifs: [/static1\.squarespace\.com/i] },
  { cms: "shopify", motifs: [/cdn\.shopify\.com/i] },
  { cms: "webflow", motifs: [/\.webflow\.io\b|assets-global\.website-files\.com/i] },
  { cms: "duda", motifs: [/irp\.cdn-website\.com/i] },
  { cms: "jimdo", motifs: [/jimdo\.com|jimdofree\.com/i] },
  { cms: "e-monsite", motifs: [/e-monsite\.com/i] },
  { cms: "google-sites", motifs: [/sites\.google\.com/i] },
];
