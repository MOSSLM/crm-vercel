import { conditionServiceMarkup } from "../condition-service-markup";
import { serviceTagMapFromSitemap } from "../filter-service-links";
import type { SitemapPage } from "@/types";

const sitemap: SitemapPage[] = [
  { id: "1", slug: "/", title: "Accueil", service_tag: null },
  { id: "2", slug: "/service-climatisation", title: "Climatisation", service_tag: "climatisation" },
  { id: "3", slug: "/service-chauffage", title: "Chauffage", service_tag: "chauffage" },
  { id: "4", slug: "/service-photovoltaique", title: "Photovoltaïque", service_tag: "photovoltaique" },
] as SitemapPage[];

const tagBySlug = serviceTagMapFromSitemap(sitemap);

describe("conditionServiceMarkup", () => {
  // Reproduces the reported bug: the "Nos services" grid where each card's
  // data-service-tag sits on the inner <a> (relative *.html href), exactly like
  // the Claude Design export. Removing only the <a> would orphan the card.
  const grid = `<section id="services"><div class="services-grid">
    <article class="svc-card">
      <h3>Climatisation réversible</h3>
      <p>Rafraîchir l'été, chauffer l'hiver.</p>
      <a href="service-climatisation.html" data-service-tag="climatisation" class="link-more">En savoir plus</a>
    </article>
    <article class="svc-card">
      <h3>Chauffage</h3>
      <p>Un confort homogène.</p>
      <a href="service-chauffage.html" data-service-tag="chauffage" class="link-more">En savoir plus</a>
    </article>
    <article class="svc-card">
      <h3>Photovoltaïque</h3>
      <p>Produisez votre électricité.</p>
      <a href="service-photovoltaique.html" data-service-tag="photovoltaique" class="link-more">En savoir plus</a>
    </article>
  </div></section>`;

  it("removes the WHOLE card for a missing service, not just its inner link", () => {
    const out = conditionServiceMarkup(grid, tagBySlug, ["climatisation"]);
    // kept service: title, text and its link all survive
    expect(out).toContain("Climatisation réversible");
    expect(out).toContain("service-climatisation.html");
    // missing services: the entire <article> is gone (no orphaned card)
    expect(out).not.toContain("Chauffage");
    expect(out).not.toContain("Un confort homogène");
    expect(out).not.toContain("service-chauffage.html");
    expect(out).not.toContain("Photovoltaïque");
    expect(out).not.toContain("service-photovoltaique.html");
  });

  it("keeps every card when the company offers all services", () => {
    const out = conditionServiceMarkup(grid, tagBySlug, [
      "climatisation",
      "chauffage",
      "photovoltaique",
    ]);
    expect(out).toContain("Climatisation réversible");
    expect(out).toContain("Chauffage");
    expect(out).toContain("Photovoltaïque");
  });

  it("filters both the header nav and the grid consistently", () => {
    const header = `<nav><ul class="subnav">
      <li><a href="service-climatisation.html" data-service-tag="climatisation">Climatisation</a></li>
      <li><a href="service-chauffage.html" data-service-tag="chauffage">Chauffage</a></li>
    </ul></nav>`;
    const out = conditionServiceMarkup(header + grid, tagBySlug, ["climatisation"]);
    // header keeps clim, drops chauffage; dropdown container intact
    expect(out).toContain("subnav");
    expect(out).toContain(">Climatisation<");
    expect(out).not.toContain(">Chauffage<");
    // grid card for chauffage is gone too
    expect(out).not.toContain("service-chauffage.html");
  });

  it("still strips a link-less data-service-tag region (no service href)", () => {
    const html = `<span class="badge" data-service-tag="chauffage">Spécialiste chauffage</span>
      <span class="badge" data-service-tag="climatisation">Spécialiste clim</span>`;
    const out = conditionServiceMarkup(html, tagBySlug, ["climatisation"]);
    expect(out).toContain("Spécialiste clim");
    expect(out).not.toContain("Spécialiste chauffage");
  });

  it("shows everything for a company with no service links map (author preview)", () => {
    // no serviceTagBySlug and no data-service-tag → untouched
    const plain = `<div><h3>Hello</h3></div>`;
    expect(conditionServiceMarkup(plain, undefined, [])).toBe(plain);
  });
});
