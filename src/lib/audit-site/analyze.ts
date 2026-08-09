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

/**
 * Formules par lesquelles une page annonce elle-même qu'elle n'est pas un site.
 *
 * Un domaine garé ou une page en travaux ne se note pas : il se signale. Ces
 * entreprises rejoignent les prospects « sans site », qui sont les plus faciles
 * à convaincre — et à qui l'on n'a aujourd'hui rien à proposer.
 */
const MOTS_PARKING = [
  "en construction", "en cours de construction", "site en travaux", "under construction",
  "coming soon", "bientôt disponible", "bientot disponible", "prochainement en ligne",
  "ce domaine", "nom de domaine", "domain for sale", "page d'attente",
];

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
    poidsTotalOctets: c.poidsTotalOctets,
    compression: Boolean(c.enTetes["content-encoding"]),
    cacheControl: Boolean(c.enTetes["cache-control"]),
    longueurTexteVisible: 0,
    nbScripts: 0,
    nbScriptsBloquants: 0,
    nbCssBloquants: 0,
    ressembleSpa: false,
    coquille: false,
    pageParking: false,
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
    nbMediaQueries: null,
    nbLargeursFixes: 0,
    nbPolicesTropPetites: null,
    cssLisible: false,
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

  // Une page quasi vide, quelle qu'en soit la raison : coquille de SPA, page
  // parking, « site en construction », redirection HTML. Le critère ne dépend PAS
  // de la présence de JavaScript — une page de 1 Ko sans script avait sinon droit
  // à une note de conversion de 0/100 en confiance haute.
  const coquille =
    texte.length < SEUILS.texteSpa || (c.poidsOctets ?? Infinity) < SEUILS.htmlCoquilleOctets;
  // La SPA reste distinguée : elle a du contenu, simplement pas dans le HTML servi.
  const ressembleSpa = coquille && scripts.length >= 3;
  const pageParking = coquille && MOTS_PARKING.some((m) => texte.toLowerCase().includes(m));

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

  // Le CSS inline ET les feuilles externes. N'examiner que l'inline conduisait à
  // compter zéro règle mobile sur la moitié du parc, puis à le lui reprocher.
  const cssInline = root.querySelectorAll("style").map((s) => s.text).join("\n");
  const css = [cssInline, c.cssExterne].filter(Boolean).join("\n");

  // « Lisible » veut dire : soit la page ne déclare aucune feuille externe — tout
  // son CSS est alors sous nos yeux —, soit elle en déclare et on en a lu au
  // moins une. Sinon les compteurs issus du CSS valent `null` : inconnu, pas zéro.
  const cssLisible = c.nbFeuillesDeclarees === 0 || c.nbFeuillesLues > 0;

  const nbMediaQueries = cssLisible ? (css.match(/@media[^{]*\(/g) ?? []).length : null;
  const nbLargeursFixes = compterLargeursFixes(root, css);
  const nbPolicesTropPetites = cssLisible ? compterPolicesTropPetites(css) : null;

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
    coquille,
    pageParking,
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
    cssLisible,
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
 * Balises dont l'attribut `width` décrit une dimension INTRINSÈQUE, et non une
 * largeur de mise en page.
 *
 * `<img width="1200">` est le balisage normal d'une image adaptative — WordPress
 * et Next.js l'écrivent systématiquement — et le CSS la rend fluide par un
 * `max-width: 100%`. En le comptant comme « élément figé », l'analyseur relevait
 * jusqu'à 502 largeurs fixes sur une seule page, et déclarait « site mal adapté
 * au mobile » sur 21 des 22 sites concernés, dont un seul manquait réellement de
 * `meta viewport`.
 */
const BALISES_DIMENSION_INTRINSEQUE = new Set([
  "img", "svg", "video", "canvas", "iframe", "embed", "object", "source", "picture", "input",
]);

/**
 * Le motif qui distingue `width` de `max-width`.
 *
 * `/(?:min-)?width/` reconnaissait « width » à l'intérieur de « max-width » :
 * l'idiome le plus adaptatif du CSS était donc compté à charge. La garde arrière
 * refuse tout tiret ou toute lettre avant le mot ; `min-` reste admis parce qu'il
 * est consommé par le groupe optionnel avant que la garde ne s'applique.
 */
const MOTIF_LARGEUR_FIGEE = String.raw`(?<![-\w])(?:min-)?width\s*:\s*(\d{2,5})\s*px`;

const motifLargeur = () => new RegExp(MOTIF_LARGEUR_FIGEE, "gi");

/**
 * Éléments dont la largeur est figée au-delà de ce qu'un téléphone affiche.
 *
 * Quatre règles, chacune née d'un faux positif constaté en base :
 * 1. les dimensions intrinsèques ne comptent pas ;
 * 2. `max-width` n'est pas `width` ;
 * 3. un élément ne compte qu'une fois, même s'il porte `width` ET `style` ;
 * 4. une largeur accompagnée d'un `max-width` fluide ne fige rien.
 */
function compterLargeursFixes(root: HTMLElement, css: string): number {
  let n = 0;

  for (const el of root.querySelectorAll("[width], [style]")) {
    const balise = (el.rawTagName ?? "").toLowerCase();
    let fige = false;

    if (!BALISES_DIMENSION_INTRINSEQUE.has(balise)) {
      const w = Number(el.getAttribute("width"));
      if (Number.isFinite(w) && w > SEUILS.largeurMobilePx) fige = true;
    }

    const style = el.getAttribute("style") ?? "";
    if (style && !aUneLargeurFluide(style)) {
      for (const m of style.matchAll(motifLargeur())) {
        if (Number(m[1]) > SEUILS.largeurMobilePx) fige = true;
      }
    }

    if (fige) n++;
  }

  // Les largeurs figées d'une feuille de style comptent autant — sauf celles qui
  // vivent dans une media query, dont c'est précisément le rôle de ne s'appliquer
  // qu'aux grands écrans.
  for (const bloc of cssHorsMediaQueries(css)) {
    for (const m of bloc.matchAll(motifLargeur())) {
      if (Number(m[1]) > SEUILS.largeurMobilePx) n++;
    }
  }

  return n;
}

/** `max-width: 100%` (ou `auto`, ou une unité relative) rend la largeur fluide. */
function aUneLargeurFluide(style: string): boolean {
  return /max-width\s*:\s*(100\s*%|none|auto|\d+\s*(vw|%))/i.test(style);
}

/**
 * Le CSS débarrassé de ses blocs `@media`.
 *
 * Sans cette découpe, une feuille correctement écrite — largeurs fixes réservées
 * au bureau dans un `@media (min-width: 1024px)` — était comptée à charge, à
 * rebours exact de ce que ces règles font.
 */
export function cssHorsMediaQueries(css: string): string[] {
  const out: string[] = [];
  let reste = css;

  for (;;) {
    const debut = reste.search(/@media[^{]*\{/i);
    if (debut === -1) {
      out.push(reste);
      break;
    }
    out.push(reste.slice(0, debut));

    // Sauter le bloc en comptant les accolades : une media query contient des
    // règles, donc des accolades imbriquées.
    let i = reste.indexOf("{", debut);
    let profondeur = 0;
    for (; i < reste.length; i++) {
      if (reste[i] === "{") profondeur++;
      else if (reste[i] === "}") {
        profondeur--;
        if (profondeur === 0) break;
      }
    }
    if (i >= reste.length) break; // accolade jamais refermée : on s'arrête là
    reste = reste.slice(i + 1);
  }

  return out;
}

/** Tailles de police en dur sous 12 px : illisible sur un téléphone. */
function compterPolicesTropPetites(css: string): number {
  let n = 0;
  for (const bloc of cssHorsMediaQueries(css)) {
    for (const m of bloc.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
      const taille = Number(m[1]);
      // `font-size: 0` est une technique de mise en page, pas un texte illisible.
      if (taille > 0 && taille < 12) n++;
    }
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
