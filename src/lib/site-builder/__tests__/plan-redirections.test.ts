import {
  apparier,
  chemsDepuisSitemap,
  liensInternes,
  sitemapsDepuisIndex,
  sitemapsDepuisRobots,
  versRegles,
} from "../plan-redirections";
import type { SitemapPage } from "@/types";

const page = (slug: string, title: string): SitemapPage => ({ id: slug, slug, title });

describe("chemsDepuisSitemap", () => {
  const xml = `<?xml version="1.0"?>
    <urlset>
      <url><loc>https://ancien.fr/</loc></url>
      <url><loc>https://www.ancien.fr/Nos-Services.html</loc></url>
      <url><loc>https://autre-marque.fr/promo</loc></url>
    </urlset>`;

  it("réduit les URLs à leur chemin normalisé", () => {
    expect(chemsDepuisSitemap(xml)).toEqual(["/", "/nos-services.html", "/promo"]);
  });

  it("écarte les domaines qui ne sont pas celui qu'on remplace", () => {
    // Un sitemap d'agrégateur liste d'autres marques : les rediriger serait
    // s'approprier des URLs qui ne nous appartiennent pas.
    expect(chemsDepuisSitemap(xml, "ancien.fr")).toEqual(["/", "/nos-services.html"]);
  });
});

describe("sitemapsDepuisIndex / sitemapsDepuisRobots", () => {
  it("suit un index de sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://a.fr/sitemap-1.xml</loc></sitemap></sitemapindex>`;
    expect(sitemapsDepuisIndex(xml)).toEqual(["https://a.fr/sitemap-1.xml"]);
  });

  it("ne confond pas un urlset avec un index", () => {
    expect(sitemapsDepuisIndex("<urlset><url><loc>https://a.fr/x</loc></url></urlset>")).toEqual([]);
  });

  it("lit le sitemap annoncé par robots.txt", () => {
    expect(sitemapsDepuisRobots("User-agent: *\nSitemap: https://a.fr/wp-sitemap.xml\n")).toEqual([
      "https://a.fr/wp-sitemap.xml",
    ]);
  });
});

describe("liensInternes", () => {
  it("ne garde que les pages du même domaine", () => {
    const html = `
      <a href="/contact.php">Contact</a>
      <a href="https://ancien.fr/services/">Services</a>
      <a href="https://facebook.com/x">FB</a>
      <a href="/plaquette.pdf">PDF</a>
      <a href="mailto:a@b.fr">Mail</a>
      <a href="#haut">Haut</a>`;
    expect(liensInternes(html, "https://ancien.fr/")).toEqual(["/contact.php", "/services"]);
  });
});

describe("apparier", () => {
  const pages = [
    page("/", "Accueil"),
    page("/services", "Nos prestations"),
    page("/chauffage", "Chauffage"),
    page("/contact", "Contact"),
    page("/realisations", "Réalisations"),
  ];

  it("ramène toutes les formes d'accueil sur « / » sans passer par les mots", () => {
    const { propositions } = apparier(["/index.php", "/accueil", "/index.html"], pages);
    expect(propositions.every((p) => p.vers === "/" && p.score === 1)).toBe(true);
    expect(propositions.map((p) => p.de).sort()).toEqual(["/accueil", "/index.html", "/index.php"]);
  });

  it("ne propose rien pour un chemin déjà identique", () => {
    expect(apparier(["/contact"], pages).propositions).toEqual([]);
  });

  it("rapproche une page héritée de la bonne cible", () => {
    const { propositions } = apparier(["/nos-services.html"], pages);
    expect(propositions[0]).toMatchObject({ de: "/nos-services.html", vers: "/services" });
  });

  it("préfère la page la plus précise quand deux candidates matchent", () => {
    // « /services-chauffage » partage un mot avec /services et un avec /chauffage :
    // c'est la couverture de la cible qui doit départager.
    const { propositions } = apparier(["/services-chauffage.php"], pages);
    expect(propositions[0].vers).toBe("/chauffage");
  });

  it("suit les formulations françaises qu'un rapprochement par mots rate", () => {
    const { propositions } = apparier(["/nous-contacter.html", "/nos-chantiers.html"], pages);
    const par = Object.fromEntries(propositions.map((p) => [p.de, p.vers]));
    expect(par["/nous-contacter.html"]).toBe("/contact");
    expect(par["/nos-chantiers.html"]).toBe("/realisations");
  });

  it("laisse orphelin ce qu'il ne sait pas rapprocher plutôt que d'inventer", () => {
    // Une redirection fausse est pire qu'une redirection absente : elle envoie
    // sur une page qui ne répond pas à la demande, et ne laisse aucune trace.
    const { propositions, orphelins } = apparier(["/xyzzy-1234.html"], pages);
    expect(propositions).toEqual([]);
    expect(orphelins).toEqual(["/xyzzy-1234.html"]);
  });

  it("rend des règles prêtes pour le plan", () => {
    const { propositions } = apparier(["/nos-services.html"], pages);
    expect(versRegles(propositions)).toEqual([{ de: "/nos-services.html", vers: "/services" }]);
  });
});
