import { detecterTechno } from "../techno";

function page(head: string, body = ""): string {
  return `<!doctype html><html lang="fr"><head>${head}</head><body>${body}</body></html>`;
}

describe("detecterTechno — WordPress", () => {
  it("lit le CMS et la version dans la balise generator quand elle est présente", () => {
    const html = page(`<meta name="generator" content="WordPress 6.4.3" />`);
    const s = detecterTechno(html);
    expect(s.cms).toBe("wordpress");
    expect(s.cmsVersion).toBe("6.4.3");
    expect(s.generateurBrut).toBe("WordPress 6.4.3");
  });

  it("reconnaît WordPress aux chemins d'assets quand Yoast a retiré la balise generator", () => {
    const html = page(
      "",
      `<link rel="stylesheet" href="/wp-content/themes/astra/style.css">
       <script src="/wp-includes/js/wp-embed.min.js?ver=6.2.1"></script>`,
    );
    const s = detecterTechno(html);
    expect(s.cms).toBe("wordpress");
    expect(s.cmsVersion).toBe("6.2.1");
    expect(s.theme).toBe("astra");
    expect(s.generateurBrut).toBeNull();
  });

  it("ne confond pas la version d'un plugin avec celle du cœur", () => {
    const html = page(
      "",
      `<link rel="stylesheet" href="/wp-content/plugins/contact-form-7/style.css?ver=5.9">
       <script src="/wp-content/themes/generatepress/js/nav.js"></script>`,
    );
    const s = detecterTechno(html);
    expect(s.cms).toBe("wordpress");
    expect(s.cmsVersion).toBeNull();
    expect(s.theme).toBe("generatepress");
  });

  it("détecte le constructeur Elementor par-dessus le thème", () => {
    const html = page(
      "",
      `<div class="elementor-section wp-content-loaded"><link href="/wp-content/themes/hello-elementor/style.css"></div>`,
    );
    const s = detecterTechno(html);
    expect(s.cms).toBe("wordpress");
    expect(s.constructeur).toBe("elementor");
    expect(s.theme).toBe("hello-elementor");
  });
});

describe("detecterTechno — autres plateformes", () => {
  it("reconnaît Wix par son CDN, sans balise generator", () => {
    const html = page("", `<script src="https://static.parastorage.com/services/foo.js"></script>`);
    const s = detecterTechno(html);
    expect(s.cms).toBe("wix");
    expect(s.cmsVersion).toBeNull();
    expect(s.theme).toBeNull();
  });

  it("reconnaît Shopify par sa balise generator", () => {
    const html = page(`<meta name="generator" content="Shopify" />`);
    const s = detecterTechno(html);
    expect(s.cms).toBe("shopify");
  });

  it("ne détecte rien sur un site fait main, sans faux positif", () => {
    const html = page("", `<p>Menuiserie Berthier, artisan à Antibes.</p>`);
    const s = detecterTechno(html);
    expect(s.cms).toBeNull();
    expect(s.theme).toBeNull();
    expect(s.constructeur).toBeNull();
  });

  it("rend tout à null sur un HTML vide, sans lever", () => {
    expect(detecterTechno("")).toEqual({
      cms: null,
      cmsVersion: null,
      theme: null,
      constructeur: null,
      generateurBrut: null,
    });
  });
});
