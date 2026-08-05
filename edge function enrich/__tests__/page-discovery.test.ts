import {
  allocateBudget,
  extractInternalLinks,
  rankCandidatePages,
  scorePath,
  stripSharedBoilerplate,
} from "../page-discovery";

const ORIGIN = "https://exemple.fr";

describe("extractInternalLinks", () => {
  it("garde les liens internes et écarte les externes", () => {
    const html = `
      <a href="/contact">Contact</a>
      <a href="https://facebook.com/x">Facebook</a>
      <a href="https://exemple.fr/services">Services</a>
    `;
    expect(extractInternalLinks(html, ORIGIN)).toEqual([
      "https://exemple.fr/contact",
      "https://exemple.fr/services",
    ]);
  });

  /** Les sites mélangent constamment www et apex dans leurs propres liens. */
  it("considère www et apex comme le même site", () => {
    const html = `<a href="https://www.exemple.fr/contact">C</a>`;
    expect(extractInternalLinks(html, ORIGIN)).toEqual(["https://exemple.fr/contact"]);
  });

  it("écarte ancres, mailto, tel et javascript", () => {
    const html = `
      <a href="#top">Haut</a>
      <a href="mailto:a@b.fr">Mail</a>
      <a href="tel:+33100000000">Tel</a>
      <a href="javascript:void(0)">JS</a>
    `;
    expect(extractInternalLinks(html, ORIGIN)).toEqual([]);
  });

  it("écarte les fichiers qui ne sont pas des pages", () => {
    const html = `<a href="/plaquette.pdf">PDF</a><a href="/logo.png">Logo</a><a href="/contact">C</a>`;
    expect(extractInternalLinks(html, ORIGIN)).toEqual(["https://exemple.fr/contact"]);
  });

  it("dédoublonne par chemin, query et slash final ignorés", () => {
    const html = `
      <a href="/contact">A</a>
      <a href="/contact/">B</a>
      <a href="/contact?utm=x">C</a>
    `;
    expect(extractInternalLinks(html, ORIGIN)).toEqual(["https://exemple.fr/contact"]);
  });

  it("écarte la home, déjà scrapée", () => {
    expect(extractInternalLinks(`<a href="/">Accueil</a>`, ORIGIN)).toEqual([]);
  });

  it("résout les liens relatifs", () => {
    expect(extractInternalLinks(`<a href="nous-joindre">C</a>`, ORIGIN)).toEqual([
      "https://exemple.fr/nous-joindre",
    ]);
  });

  it("survit à un HTML sans lien ou illisible", () => {
    expect(extractInternalLinks("", ORIGIN)).toEqual([]);
    expect(extractInternalLinks("<p>rien</p>", ORIGIN)).toEqual([]);
    expect(extractInternalLinks(`<a href="/x">X</a>`, "pas-une-url")).toEqual([]);
  });
});

/**
 * C'est le cœur du correctif : les pages qui portent l'email et le SIRET doivent
 * être trouvées quelle que soit l'URL choisie par le site.
 */
describe("scorePath", () => {
  it("reconnaît les variantes françaises de la page contact", () => {
    for (const p of ["/contact", "/nous-contacter", "/nous-joindre", "/contactez-nous"]) {
      expect(scorePath(p)).toBeGreaterThan(0);
    }
  });

  it("reconnaît les pages malgré une extension de fichier", () => {
    expect(scorePath("/qui-sommes-nous.php")).toBeGreaterThan(0);
    expect(scorePath("/mentions-legales.html")).toBeGreaterThan(0);
  });

  it("classe contact avant mentions légales, puis à-propos, puis services", () => {
    expect(scorePath("/contact")).toBeGreaterThan(scorePath("/mentions-legales"));
    expect(scorePath("/mentions-legales")).toBeGreaterThan(scorePath("/a-propos"));
    expect(scorePath("/a-propos")).toBeGreaterThan(scorePath("/nos-services"));
  });

  it("préfère le chemin court à sa déclinaison profonde", () => {
    expect(scorePath("/contact")).toBeGreaterThan(scorePath("/services/clim/contact"));
  });

  it("écarte ce qui ne sert pas l'extraction", () => {
    for (const p of ["/blog", "/actualites", "/panier", "/wp-admin", "/mon-compte", "/faq", "/cookies"]) {
      expect(scorePath(p)).toBe(0);
    }
  });

  it("rend 0 sur un chemin sans intention identifiable", () => {
    expect(scorePath("/lorem-ipsum")).toBe(0);
  });
});

describe("rankCandidatePages", () => {
  it("classe par intérêt et plafonne", () => {
    const links = [
      "https://exemple.fr/blog",
      "https://exemple.fr/nos-services",
      "https://exemple.fr/contact",
      "https://exemple.fr/mentions-legales",
    ];
    expect(rankCandidatePages(links, 2)).toEqual([
      "https://exemple.fr/contact",
      "https://exemple.fr/mentions-legales",
    ]);
  });

  it("retire les pages sans intérêt du résultat", () => {
    expect(rankCandidatePages(["https://exemple.fr/blog", "https://exemple.fr/panier"])).toEqual([]);
  });

  it("conserve l'ordre de la page à score égal", () => {
    const links = ["https://exemple.fr/prestations", "https://exemple.fr/services"];
    expect(rankCandidatePages(links)).toEqual(links);
  });
});

describe("stripSharedBoilerplate", () => {
  const nav = "Accueil Services Contact";
  const footer = "© 2026 Exemple SARL";

  it("retire le menu et le pied de page communs à 3 pages", () => {
    const pages = [
      { path: "/", markdown: `${nav}\nBienvenue chez nous, spécialiste du chauffage depuis 1998.\n${footer}` },
      { path: "/contact", markdown: `${nav}\nEcrivez-nous à contact@exemple.fr ou au 01 02 03 04 05.\n${footer}` },
      { path: "/services", markdown: `${nav}\nNous installons pompes à chaleur et climatisation réversible.\n${footer}` },
    ];
    const out = stripSharedBoilerplate(pages);
    for (const p of out) {
      expect(p.markdown).not.toContain(nav);
      expect(p.markdown).not.toContain(footer);
    }
    expect(out[1].markdown).toContain("contact@exemple.fr");
  });

  /** En dessous de 3 pages, « répété » ne veut rien dire. */
  it("ne touche à rien avec moins de 3 pages", () => {
    const pages = [
      { path: "/", markdown: `${nav}\nA` },
      { path: "/contact", markdown: `${nav}\nB` },
    ];
    expect(stripSharedBoilerplate(pages)).toEqual(pages);
  });

  it("épargne un paragraphe long même répété — c'est du contenu", () => {
    const long = "x".repeat(250);
    const pages = [
      { path: "/", markdown: `${long}\nA` },
      { path: "/b", markdown: `${long}\nB` },
      { path: "/c", markdown: `${long}\nC` },
    ];
    for (const p of stripSharedBoilerplate(pages)) expect(p.markdown).toContain(long);
  });

  it("rend la page intacte si la déduplication la viderait de plus de moitié", () => {
    // Trois pages quasi identiques : un site mono-page servi sur plusieurs URLs.
    const body = `${nav}\n${footer}\nMême contenu partout`;
    const pages = [
      { path: "/", markdown: body },
      { path: "/b", markdown: body },
      { path: "/c", markdown: body },
    ];
    expect(stripSharedBoilerplate(pages)).toEqual(pages);
  });

  it("ne compte qu'une fois une ligne répétée dans la même page", () => {
    // `nav` apparaît deux fois sur la home (en-tête + pied) mais sur une seule des
    // trois pages : il ne doit pas être considéré comme partagé.
    const pages = [
      { path: "/", markdown: `${nav}\nAccueil bavard et détaillé\n${nav}` },
      { path: "/b", markdown: "Page B avec son propre contenu bien à elle" },
      { path: "/c", markdown: "Page C avec son propre contenu bien à elle aussi" },
    ];
    expect(stripSharedBoilerplate(pages)[0].markdown).toContain(nav);
  });
});

describe("allocateBudget", () => {
  it("garantit sa part à contact même derrière une home énorme", () => {
    const pages = [
      { path: "/", markdown: "h".repeat(50000) },
      { path: "/contact", markdown: "c".repeat(3000) },
    ];
    const quota = allocateBudget(pages);
    expect(quota.get("/contact")).toBe(3000);
    expect(quota.get("/")).toBeLessThanOrEqual(27000);
  });

  it("ne dépasse jamais le budget total", () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({
      path: i === 0 ? "/" : `/p${i}`,
      markdown: "x".repeat(20000),
    }));
    const quota = allocateBudget(pages);
    const sum = [...quota.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(30000);
  });

  it("redistribue le reliquat des pages courtes", () => {
    const pages = [
      { path: "/", markdown: "h".repeat(30000) },
      { path: "/contact", markdown: "c".repeat(100) },
    ];
    const quota = allocateBudget(pages);
    expect(quota.get("/contact")).toBe(100);
    // La home récupère tout ce que contact n'utilise pas.
    expect(quota.get("/")).toBe(29900);
  });

  it("ne demande jamais plus que ce que la page contient", () => {
    const pages = [{ path: "/", markdown: "court" }];
    expect(allocateBudget(pages).get("/")).toBe(5);
  });

  it("laisse de quoi porter un email même quand tout déborde", () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({
      path: i === 0 ? "/" : `/p${i}`,
      markdown: "x".repeat(10000),
    }));
    const quota = allocateBudget(pages);
    for (const v of quota.values()) expect(v).toBeGreaterThanOrEqual(500);
  });
});
