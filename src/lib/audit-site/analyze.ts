import { parse, type HTMLElement } from "node-html-parser";
import type { CollecteSite, SignauxSite } from "./types";
import { SEUILS } from "./score";

/**
 * HTML → signaux bruts. Aucun jugement ici : que des faits comptés.
 *
 * La séparation avec `score.ts` n'est pas cosmétique. Les seuils bougeront —
 * c'est un outil commercial, il s'ajuste au terrain — et il faut pouvoir les
 * changer sans retoucher l'extraction, ni inversement. Le jour où l'on discute
 * une note avec un prospect, on veut aussi pouvoir montrer le signal brut sans
 * qu'il soit déjà passé par une pondération.
 *
 * `node-html-parser` est déjà en dépendance et suffit : on cherche des balises
 * et des attributs, pas un DOM vivant.
 */

/**
 * Fournisseurs de widgets d'avis, reconnus par le domaine de leur script.
 *
 * SANS CETTE LISTE, l'analyseur annonce à un artisan que ses avis clients
 * n'apparaissent pas sur son site — alors qu'ils y sont, chargés par un script.
 * C'est le type d'erreur qui coûte le rendez-vous, pas juste un point de score.
 */
const WIDGETS_AVIS = [
  "trustindex",
  "elfsight",
  "sociablekit",
  "reviewsonmywebsite",
  "trustpilot",
  "avis-verifies",
  "netreviews",
  "ekomi",
  "google.com/maps/embed",
  "widgets.sociablekit",
  "featurable",
];

/** Réseaux sociaux reconnus dans les liens sortants. */
const RESEAUX = ["facebook.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com"];

/** Formulations qui font un appel à l'action, dans le vocabulaire du bâtiment. */
const MOTS_CTA = [
  "devis", "contact", "rappel", "rappeler", "appeler", "réserver", "reserver",
  "rendez-vous", "rdv", "demander", "obtenir", "estimation", "gratuit",
];

const MOTS_MENTIONS = ["mentions légales", "mentions legales", "mentions-legales", "politique de confidentialité", "cgv"];
const MOTS_COOKIES = ["cookie", "rgpd", "consentement", "tarteaucitron", "axeptio", "didomi"];
const MOTS_AVIS = ["avis", "témoignage", "temoignage", "ils nous font confiance", "nos clients"];

export function analyser(c: CollecteSite, contexte: { telephone?: string | null } = {}): SignauxSite {
  const joignable = !c.injoignable && c.httpStatus != null && c.httpStatus < 400 && Boolean(c.html);

  const vide: SignauxSite = {
    joignable,
    bloque: c.bloque,
    httpStatus: c.httpStatus,
    https: c.https,
    ttfbMs: c.ttfbMs,
    chargementMs: c.chargementMs,
    poidsOctets: c.poidsOctets,
    compression: Boolean(c.enTetes["content-encoding"]),
    cacheControl: Boolean(c.enTetes["cache-control"]),
    longueurTexteVisible: 0,
    nbScripts: 0,
    nbScriptsBloquants: 0,
    nbCssBloquants: 0,
    ressembleSpa: false,
    title: null,
    metaDescription: null,
    nbH1: 0,
    canonical: false,
    lang: null,
    noindex: false,
    robotsTxt: c.robotsTxt,
    sitemapXml: c.sitemapXml,
    jsonLdLocalBusiness: false,
    napNom: false,
    napAdresse: false,
    napTelephone: false,
    nbImages: 0,
    nbImagesSansAlt: 0,
    nbImagesSansLazy: 0,
    viewport: false,
    viewportZoomBloque: false,
    nbMediaQueries: 0,
    nbLargeursFixes: 0,
    nbPolicesTropPetites: 0,
    telCliquable: false,
    telephoneEnTexte: false,
    formulaire: false,
    mailto: false,
    avisDansLaPage: false,
    widgetAvis: null,
    mentionsLegales: false,
    bandeauCookies: false,
    nbReseauxSociaux: 0,
    nbCta: 0,
  };

  if (!joignable || !c.html) return vide;

  const root = parse(c.html, { blockTextElements: { script: true, style: true } });
  const htmlBas = c.html.toLowerCase();
  const texte = texteVisible(root);

  // ── Structure ─────────────────────────────────────────────────────────────
  const scripts = root.querySelectorAll("script");
  const head = root.querySelector("head");
  const scriptsHead = head?.querySelectorAll("script") ?? [];
  const nbScriptsBloquants = scriptsHead.filter(
    (s) => s.getAttribute("src") && !s.hasAttribute("async") && !s.hasAttribute("defer"),
  ).length;
  const nbCssBloquants = (head?.querySelectorAll('link[rel="stylesheet"]') ?? []).filter(
    (l) => !l.getAttribute("media") || l.getAttribute("media") === "all",
  ).length;

  // Une coquille de SPA : peu de texte servi, et du JS pour le fabriquer.
  const ressembleSpa = texte.length < SEUILS.texteSpa && scripts.length >= 3;

  // ── SEO ───────────────────────────────────────────────────────────────────
  const title = root.querySelector("title")?.text?.trim() || null;
  const metaDescription = attr(root, 'meta[name="description"]', "content");
  const nbH1 = root.querySelectorAll("h1").length;
  const canonical = Boolean(root.querySelector('link[rel="canonical"]'));
  const lang = root.querySelector("html")?.getAttribute("lang")?.trim() || null;
  const robotsMeta = (attr(root, 'meta[name="robots"]', "content") ?? "").toLowerCase();
  const noindex = robotsMeta.includes("noindex");

  const jsonLdLocalBusiness = root
    .querySelectorAll('script[type="application/ld+json"]')
    .some((s) => /"@type"\s*:\s*"?(LocalBusiness|Organization|[A-Za-z]*(Contractor|Service|Store))/i.test(s.text));

  const images = root.querySelectorAll("img");
  const nbImagesSansAlt = images.filter((i) => !(i.getAttribute("alt") ?? "").trim()).length;
  const nbImagesSansLazy = images.filter((i) => i.getAttribute("loading") !== "lazy").length;

  // ── Mobile ────────────────────────────────────────────────────────────────
  const viewportContent = attr(root, 'meta[name="viewport"]', "content");
  const viewport = Boolean(viewportContent);
  const viewportZoomBloque = Boolean(
    viewportContent && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewportContent),
  );

  const css = root.querySelectorAll("style").map((s) => s.text).join("\n");
  const nbMediaQueries = (css.match(/@media[^{]*\(/g) ?? []).length;
  const nbLargeursFixes = compterLargeursFixes(root, css);
  const nbPolicesTropPetites = compterPolicesTropPetites(css);

  // ── Conversion ────────────────────────────────────────────────────────────
  const liens = root.querySelectorAll("a");
  const hrefs = liens.map((a) => (a.getAttribute("href") ?? "").trim());
  const telCliquable = hrefs.some((h) => h.toLowerCase().startsWith("tel:"));
  const mailto = hrefs.some((h) => h.toLowerCase().startsWith("mailto:"));
  const formulaire = root.querySelectorAll("form").length > 0;

  const widgetAvis = WIDGETS_AVIS.find((w) => htmlBas.includes(w)) ?? null;
  const avisDansLaPage = MOTS_AVIS.some((m) => texte.toLowerCase().includes(m));

  const mentionsLegales = MOTS_MENTIONS.some(
    (m) => texte.toLowerCase().includes(m) || hrefs.some((h) => h.toLowerCase().includes(m.replace(/\s/g, "-"))),
  );
  const bandeauCookies = MOTS_COOKIES.some((m) => htmlBas.includes(m));
  const nbReseauxSociaux = RESEAUX.filter((r) => hrefs.some((h) => h.toLowerCase().includes(r))).length;

  const nbCta = compterCta(liens, root);

  // ── NAP et téléphone ──────────────────────────────────────────────────────
  const telephoneEnTexte = /\b0\s?[1-9](?:[\s.-]?\d{2}){4}\b|\+33\s?[1-9](?:[\s.-]?\d{2}){4}/.test(texte);
  const napTelephone = telephoneEnTexte || telCliquable;
  const napAdresse = /\b\d{5}\b/.test(texte) && /\b(rue|avenue|boulevard|chemin|impasse|route|place|allée|allee)\b/i.test(texte);
  const napNom = Boolean(title) || Boolean(root.querySelector("h1"));

  return {
    ...vide,
    longueurTexteVisible: texte.length,
    nbScripts: scripts.length,
    nbScriptsBloquants,
    nbCssBloquants,
    ressembleSpa,
    title,
    metaDescription,
    nbH1,
    canonical,
    lang,
    noindex,
    jsonLdLocalBusiness,
    napNom,
    napAdresse,
    napTelephone,
    nbImages: images.length,
    nbImagesSansAlt,
    nbImagesSansLazy,
    viewport,
    viewportZoomBloque,
    nbMediaQueries,
    nbLargeursFixes,
    nbPolicesTropPetites,
    telCliquable,
    telephoneEnTexte: telephoneEnTexte || Boolean(contexte.telephone && texte.includes(contexte.telephone)),
    formulaire,
    mailto,
    avisDansLaPage,
    widgetAvis,
    mentionsLegales,
    bandeauCookies,
    nbReseauxSociaux,
    nbCta,
  };
}

/** Texte réellement lisible : scripts, styles et balises retirés. */
function texteVisible(root: HTMLElement): string {
  const clone = parse(root.toString());
  clone.querySelectorAll("script, style, noscript, head").forEach((n) => n.remove());
  return clone.text.replace(/\s+/g, " ").trim();
}

function attr(root: HTMLElement, selector: string, name: string): string | null {
  const v = root.querySelector(selector)?.getAttribute(name)?.trim();
  return v || null;
}

/**
 * Éléments dont la largeur est figée au-delà de ce qu'un téléphone affiche.
 * On regarde l'attribut `width` HTML et les `width: NNNpx` du CSS inline —
 * les deux marqueurs d'un site conçu avant le mobile.
 */
function compterLargeursFixes(root: HTMLElement, css: string): number {
  let n = 0;
  for (const el of root.querySelectorAll("[width], [style]")) {
    const w = Number(el.getAttribute("width"));
    if (Number.isFinite(w) && w > SEUILS.largeurMobilePx) n++;
    const style = el.getAttribute("style") ?? "";
    const m = /width\s*:\s*(\d+)\s*px/i.exec(style);
    if (m && Number(m[1]) > SEUILS.largeurMobilePx) n++;
  }
  // Les largeurs figées d'une feuille inline comptent autant : c'est le même
  // symptôme, écrit ailleurs.
  for (const m of css.matchAll(/(?:min-)?width\s*:\s*(\d{3,4})\s*px/gi)) {
    if (Number(m[1]) > SEUILS.largeurMobilePx) n++;
  }
  return n;
}

/** Tailles de police en dur sous 12 px : illisible sur un téléphone. */
function compterPolicesTropPetites(css: string): number {
  let n = 0;
  for (const m of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    if (Number(m[1]) < 12) n++;
  }
  return n;
}

/**
 * Appels à l'action : les liens `tel:`/`mailto:`, les boutons de formulaire, et
 * les liens dont le libellé appelle à agir. On dédoublonne par libellé — un menu
 * répété en pied de page gonflerait le compte sans rien apporter au visiteur.
 */
function compterCta(liens: HTMLElement[], root: HTMLElement): number {
  const vus = new Set<string>();
  for (const a of liens) {
    const href = (a.getAttribute("href") ?? "").toLowerCase();
    const libelle = a.text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!libelle && !href) continue;
    if (href.startsWith("tel:") || href.startsWith("mailto:")) {
      vus.add(href);
      continue;
    }
    if (MOTS_CTA.some((m) => libelle.includes(m))) vus.add(libelle);
  }
  for (const b of root.querySelectorAll('button, input[type="submit"]')) {
    const libelle = (b.text || b.getAttribute("value") || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (libelle && MOTS_CTA.some((m) => libelle.includes(m))) vus.add(libelle);
  }
  return vus.size;
}
