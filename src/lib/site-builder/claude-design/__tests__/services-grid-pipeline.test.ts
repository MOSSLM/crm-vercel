/**
 * Reproduction du bug signalé, bout en bout, sur la grille « Nos services ».
 *
 * Symptôme : sans entreprise, chaque carte porte sa photo. On applique une
 * entreprise → les photos se retrouvent sur les mauvaises cartes, et les deux
 * cartes volontairement sans photo (maintenance, dépannage) en héritent d'une.
 *
 * Deux causes se cumulaient :
 *   1. le tag de la page vient du nom de fichier ("pompe-a-chaleur") tandis que
 *      l'entreprise porte "Pompe à chaleur" — comparés bruts, plus AUCUNE carte
 *      de service ne survivait ;
 *   2. les retraits décalent les chemins positionnels des overrides, donc les
 *      photos restantes glissaient sur les cartes précédentes.
 *
 * Ce test verrouille l'invariant global : après conditionnement, chaque photo
 * est toujours sur SA carte (assertion sur le couple titre + src), et une carte
 * sans photo n'en reçoit jamais.
 */
import { parse } from "node-html-parser";
import { applyOverridesToHTML, type OverrideEntry } from "@/lib/library-section/apply-overrides-html";
import { conditionServiceMarkup } from "../condition-service-markup";
import { serviceTagMapFromSitemap } from "../filter-service-links";
import { stampDomPaths } from "../dom-paths";
import type { SitemapPage } from "@/types";

const SITEMAP = [
  { id: "1", slug: "/", title: "Accueil", service_tag: null },
  { id: "2", slug: "/service-climatisation", title: "Climatisation", service_tag: "climatisation" },
  { id: "3", slug: "/service-pompe-a-chaleur", title: "PAC", service_tag: "pompe-a-chaleur" },
  { id: "4", slug: "/service-plomberie", title: "Plomberie", service_tag: "plomberie" },
  { id: "5", slug: "/service-bornes-irve", title: "IRVE", service_tag: "bornes-irve" },
] as SitemapPage[];

const tagBySlug = serviceTagMapFromSitemap(SITEMAP);

/** Le markup tel que l'exporte Claude Design : une racine de section unique,
 *  6 cartes dont 2 sans tag ET sans emplacement photo. */
const SECTION = `<div data-claude-design=""><section class="services"><div class="grid">
  <article class="svc"><h3>Climatisation</h3><img src=""><a href="service-climatisation.html">En savoir plus</a></article>
  <article class="svc"><h3>Pompe à chaleur</h3><img src=""><a href="service-pompe-a-chaleur.html">En savoir plus</a></article>
  <article class="svc"><h3>Plomberie</h3><img src=""><a href="service-plomberie.html">En savoir plus</a></article>
  <article class="svc"><h3>Bornes IRVE</h3><img src=""><a href="service-bornes-irve.html">En savoir plus</a></article>
  <article class="svc"><h3>Maintenance</h3><p>Contrats annuels.</p></article>
  <article class="svc"><h3>Dépannage</h3><p>Intervention 24/7.</p></article>
</div></section></div>`;

/** Une photo posée à la main sur chacune des 4 cartes de service. Les chemins
 *  sont ceux du markup COMPLET, tel que le builder les enregistre. */
const OVERRIDES: Record<string, OverrideEntry> = {
  "0.0.0.1:image": { kind: "image", value: "clim.jpg" },
  "0.0.1.1:image": { kind: "image", value: "pac.jpg" },
  "0.0.2.1:image": { kind: "image", value: "plomberie.jpg" },
  "0.0.3.1:image": { kind: "image", value: "irve.jpg" },
};

/** Le pipeline de rendu, dans l'ordre de LibrarySectionInline (overrides AVANT
 *  le conditionnement). */
function render(enterpriseTags: string[]): string {
  let html = stampDomPaths(SECTION, { mode: "section-root", only: Object.keys(OVERRIDES) });
  html = applyOverridesToHTML(html, OVERRIDES, {}).html;
  return conditionServiceMarkup(html, tagBySlug, enterpriseTags);
}

/**
 * L'ordre INVERSE : le conditionnement d'abord, les overrides ensuite. C'est la
 * situation de l'aperçu du builder (le conditionnement se fait sur la chaîne, les
 * overrides dans l'iframe) et de l'hydrateur du site déployé (qui ne voit que le
 * DOM déjà conditionné). Impossible de les réordonner : c'est précisément ce que
 * le tampon `data-cdp` rend inoffensif.
 */
function renderConditionedFirst(enterpriseTags: string[]): string {
  let html = stampDomPaths(SECTION, { mode: "section-root", only: Object.keys(OVERRIDES) });
  html = conditionServiceMarkup(html, tagBySlug, enterpriseTags);
  return applyOverridesToHTML(html, OVERRIDES, {}).html;
}

/** titre de carte → src de sa photo ("" si la carte n'a pas d'image). */
function photosByCard(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const card of parse(html).querySelectorAll("article.svc")) {
    const title = card.querySelector("h3")?.text.trim() ?? "";
    out[title] = card.querySelector("img")?.getAttribute("src") ?? "";
  }
  return out;
}

describe("grille « Nos services » — photos et conditionnement par entreprise", () => {
  // Aperçu d'un template sans entreprise : le résolveur pose TOUS les tags du
  // sitemap dans `__service_tags`, donc toutes les cartes s'affichent.
  const ALL_TAGS = SITEMAP.map((p) => p.service_tag).filter((t): t is string => !!t);

  it("sans entreprise : les 6 cartes, chaque photo sur sa carte", () => {
    expect(photosByCard(render(ALL_TAGS))).toEqual({
      "Climatisation": "clim.jpg",
      "Pompe à chaleur": "pac.jpg",
      "Plomberie": "plomberie.jpg",
      "Bornes IRVE": "irve.jpg",
      "Maintenance": "",
      "Dépannage": "",
    });
  });

  it("avec une entreprise : les cartes restantes gardent CHACUNE sa photo", () => {
    // Tags réels, en français lisible — le markup, lui, est slugifié.
    const out = render(["Pompe à chaleur", "Bornes IRVE"]);
    expect(photosByCard(out)).toEqual({
      "Pompe à chaleur": "pac.jpg",
      "Bornes IRVE": "irve.jpg",
      "Maintenance": "",
      "Dépannage": "",
    });
  });

  it("les cartes sans tag survivent et restent SANS photo", () => {
    const cards = photosByCard(render(["Climatisation"]));
    expect(cards["Maintenance"]).toBe("");
    expect(cards["Dépannage"]).toBe("");
    expect(cards["Climatisation"]).toBe("clim.jpg");
  });

  it("une entreprise dont aucun service ne figure au template ne garde que les cartes sans tag", () => {
    expect(Object.keys(photosByCard(render(["Toiture"])))).toEqual(["Maintenance", "Dépannage"]);
  });

  // Le cœur du correctif : appliquer les overrides APRÈS le conditionnement — ce
  // que font l'aperçu du builder et l'hydrateur du site déployé — doit donner
  // exactement le même résultat. Sans le tampon `data-cdp`, "pac.jpg" glissait
  // sur la carte précédente et les cartes sans photo en héritaient une.
  it("donne le même résultat quand les overrides sont appliqués APRÈS le conditionnement", () => {
    for (const tags of [["Pompe à chaleur", "Bornes IRVE"], ["Climatisation"], ["Toiture"]]) {
      expect(photosByCard(renderConditionedFirst(tags))).toEqual(photosByCard(render(tags)));
    }
  });
});
