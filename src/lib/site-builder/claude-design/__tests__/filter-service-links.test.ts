import { filterServiceLinks, serviceTagMapFromSitemap } from "../filter-service-links";
import type { SitemapPage } from "@/types";

const sitemap: SitemapPage[] = [
  { id: "1", slug: "/", title: "Accueil", service_tag: null },
  { id: "2", slug: "/service-climatisation", title: "Climatisation", service_tag: "climatisation" },
  { id: "3", slug: "/service-chauffage", title: "Chauffage", service_tag: "chauffage" },
  { id: "4", slug: "/service-plomberie", title: "Plomberie", service_tag: "plomberie" },
] as SitemapPage[];

const tagBySlug = serviceTagMapFromSitemap(sitemap);

describe("serviceTagMapFromSitemap", () => {
  it("maps only tagged pages", () => {
    expect(tagBySlug).toEqual({
      "/service-climatisation": "climatisation",
      "/service-chauffage": "chauffage",
      "/service-plomberie": "plomberie",
    });
  });
});

describe("filterServiceLinks", () => {
  const have = ["climatisation"]; // company only does clim

  it("removes a footer <li> for a service the company lacks, keeps the one it has", () => {
    const html = `<ul class="footer-links">
      <li><a href="/service-climatisation">Climatisation</a></li>
      <li><a href="/service-chauffage">Chauffage</a></li>
      <li><a href="/service-plomberie">Plomberie</a></li>
    </ul>`;
    const out = filterServiceLinks(html, tagBySlug, have);
    expect(out).toContain("/service-climatisation");
    expect(out).not.toContain("/service-chauffage");
    expect(out).not.toContain("/service-plomberie");
    // the kept item is still wrapped in its <li>
    expect(out).toMatch(/<li><a href="\/service-climatisation"/);
  });

  it("removes the whole expertise <article> card, not just the inner link", () => {
    const html = `<div class="services-grid">
      <article class="svc-card"><h3>Clim</h3><a class="link-more" href="/service-climatisation">En savoir plus</a></article>
      <article class="svc-card"><h3>Chauffage</h3><a class="link-more" href="/service-chauffage">En savoir plus</a></article>
    </div>`;
    const out = filterServiceLinks(html, tagBySlug, have);
    expect(out).toContain("Clim");
    expect(out).not.toContain("Chauffage");
    expect(out).not.toContain("/service-chauffage");
  });

  it("in a shared submenu, removes only the <a>, never the whole dropdown", () => {
    const html = `<li class="has-sub"><button>Nos services</button><div class="subnav">
      <a href="/service-climatisation">Climatisation</a>
      <a href="/service-chauffage">Chauffage</a>
      <a href="/service-plomberie">Plomberie</a>
    </div></li>`;
    const out = filterServiceLinks(html, tagBySlug, have);
    expect(out).toContain("Nos services"); // dropdown intact
    expect(out).toContain(">Climatisation<");
    expect(out).not.toContain("/service-chauffage");
    expect(out).not.toContain("/service-plomberie");
  });

  it("keeps everything when the company has all services", () => {
    const html = `<li><a href="/service-chauffage">Chauffage</a></li>`;
    const out = filterServiceLinks(html, tagBySlug, ["chauffage"]);
    expect(out).toContain("/service-chauffage");
  });

  it("leaves non-service links (anchors, external, home) untouched", () => {
    const html = `<a href="/">Accueil</a><a href="#contact">Contact</a><a href="https://x.com">X</a>`;
    const out = filterServiceLinks(html, tagBySlug, []);
    expect(out).toContain('href="/"');
    expect(out).toContain('href="#contact"');
    expect(out).toContain("https://x.com");
  });
});
