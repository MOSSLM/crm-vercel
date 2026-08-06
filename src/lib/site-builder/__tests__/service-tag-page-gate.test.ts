import { serviceTagGate } from "@/utils/serviceTags";
import { buildPublicMenus, filterSitemapByEnterpriseTags } from "../menu-overrides";
import type { SitemapPage, SiteMenus } from "@/types";

/**
 * Les deux vocabulaires du service_tag, tels qu'ils cohabitent VRAIMENT en base
 * sur les designs Claude liés à une entreprise :
 *  - le plan du site porte le tag du nom de fichier — `service-pompe-a-chaleur.html`
 *    → "pompe-a-chaleur", "electricite", "photovoltaique" ;
 *  - l'entreprise porte le libellé du CRM — "pompe à chaleur", "electricité",
 *    "photovoltaïque".
 * Comparés bruts, seuls les services d'un seul mot ASCII ("climatisation",
 * "chauffage") se rencontraient : les autres pages 404aient dans l'aperçu comme
 * en ligne, et leurs liens disparaissaient des menus.
 */
const SITEMAP_TAGS = ["climatisation", "pompe-a-chaleur", "electricite", "photovoltaique"];
const COMPANY_TAGS = ["climatisation", "pompe à chaleur", "electricité", "photovoltaïque"];

const page = (slug: string, service_tag: string | null): SitemapPage =>
  ({ id: slug, title: slug, slug, service_tag }) as SitemapPage;

describe("serviceTagGate", () => {
  it("ouvre la page quel que soit le vocabulaire du tag", () => {
    const allows = serviceTagGate(COMPANY_TAGS);
    for (const tag of SITEMAP_TAGS) expect(allows(tag)).toBe(true);
  });

  it("ferme la page quand l'entreprise n'a pas le service", () => {
    const allows = serviceTagGate(["climatisation"]);
    expect(allows("pompe-a-chaleur")).toBe(false);
    expect(allows("Pompe à chaleur")).toBe(false);
  });

  it("ne restreint rien sans tag, ni sur un tag sans clé", () => {
    const allows = serviceTagGate([]);
    expect(allows(null)).toBe(true);
    expect(allows("")).toBe(true);
    expect(allows("---")).toBe(true);
  });
});

describe("filterSitemapByEnterpriseTags", () => {
  it("garde les pages des services de l'entreprise, graphies mêlées", () => {
    const sitemap = [page("/", null), ...SITEMAP_TAGS.map((t) => page(`/service-${t}`, t))];
    const kept = filterSitemapByEnterpriseTags(sitemap, ["pompe à chaleur"]).map((p) => p.slug);
    expect(kept).toEqual(["/", "/service-pompe-a-chaleur"]);
  });
});

describe("buildPublicMenus", () => {
  const sitemap = [page("/", null), ...SITEMAP_TAGS.map((t) => page(`/service-${t}`, t))];
  const instances = sitemap.map((p) => ({ page_slug: p.slug, is_hidden: false }));
  const menus: SiteMenus = {
    nav: sitemap.map((p) => ({ id: p.slug, label: p.slug, url: p.slug })),
    footer: sitemap.map((p) => ({ id: p.slug, label: p.slug, url: p.slug })),
    footerLegal: [],
  };

  it("garde les liens vers les pages des services de l'entreprise", () => {
    const built = buildPublicMenus(menus, sitemap, instances, COMPANY_TAGS);
    expect(built?.nav.map((i) => i.url)).toEqual([
      "/",
      "/service-climatisation",
      "/service-pompe-a-chaleur",
      "/service-electricite",
      "/service-photovoltaique",
    ]);
    expect(built?.footer).toHaveLength(5);
  });

  it("retire les liens vers les services que l'entreprise n'a pas", () => {
    const built = buildPublicMenus(menus, sitemap, instances, ["climatisation"]);
    expect(built?.nav.map((i) => i.url)).toEqual(["/", "/service-climatisation"]);
  });
});
