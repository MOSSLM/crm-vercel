/**
 * Le remplissage des gabarits — et les trois fautes qu'il doit rendre
 * impossibles : un marqueur oublié, une valeur qui casse son contexte, et une
 * couverture qui promet une démo qui n'existe pas.
 */
import { rendrePlaquette, type DonneesPlaquette } from "@/lib/audit/plaquette-rendu";

const base: DonneesPlaquette = {
  nom: "Maac-Air",
  meta: "climatisation · Viry-Châtillon",
  demoUrl: "https://maac-air.samadigitalstudio.fr",
  captureDemo: "https://llzrpcbwnqvbrcjjwysm.supabase.co/storage/v1/object/public/x/shot.jpg",
  prix: "690 €",
  date: "21 août 2026",
};

describe.each(["a4", "mobile"] as const)("plaquette %s", (format) => {
  it("ne laisse aucun marqueur dans le document", () => {
    const { html } = rendrePlaquette(format, base);
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("porte le nom, le secteur, le prix et la date du prospect", () => {
    const { html } = rendrePlaquette(format, base);
    expect(html).toContain("Maac-Air");
    expect(html).toContain("climatisation · Viry-Châtillon");
    expect(html).toContain("690 €");
    expect(html).toContain("21 août 2026");
  });

  it("sert l'adresse sans schéma, pour que le lien du gabarit tienne", () => {
    const { html } = rendrePlaquette(format, base);
    expect(html).toContain('href="https://maac-air.samadigitalstudio.fr"');
    expect(html).not.toContain("https://https://");
  });

  it("colle la capture dans le fond CSS", () => {
    const { html } = rendrePlaquette(format, base);
    expect(html).toContain("background-image:url('https://llzrpcbwnqvbrcjjwysm.supabase.co");
  });

  it("bascule sur « aperçu en préparation » quand il n'y a pas de démo", () => {
    const { html } = rendrePlaquette(format, { ...base, demoUrl: "", captureDemo: null });
    expect(html).toContain('<div id="doc" class="sc">');
  });

  it("garde la couverture normale dès qu'il y a une démo", () => {
    const { html } = rendrePlaquette(format, base);
    expect(html).toContain('<div id="doc">');
    expect(html).not.toContain('class="sc"');
  });

  it("laisse le squelette prendre la place quand la capture manque", () => {
    const { html } = rendrePlaquette(format, { ...base, captureDemo: null });
    expect(html).toContain("background-image:url('')");
    expect(html).toContain('<div id="doc">');
  });

  it("refuse une capture qui refermerait l'expression CSS", () => {
    // Une apostrophe ou une parenthèse ici, et tout ce qui suit devient de la
    // déclaration CSS. On ne l'échappe pas, on la jette.
    const html = rendrePlaquette(format, {
      ...base,
      captureDemo: "https://x.fr/a.jpg'); background:url('https://pirate.fr/p.png",
    }).html;
    expect(html).toContain("background-image:url('')");
    expect(html).not.toContain("pirate.fr");
  });

  it("refuse une capture qui n'est pas en https", () => {
    expect(rendrePlaquette(format, { ...base, captureDemo: "http://x.fr/a.jpg" }).html).toContain(
      "background-image:url('')",
    );
    expect(
      rendrePlaquette(format, { ...base, captureDemo: "javascript:alert(1)" }).html,
    ).toContain("background-image:url('')");
  });

  it("échappe le nom du prospect", () => {
    const { html } = rendrePlaquette(format, { ...base, nom: 'SARL <script>"Martin"' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("écrit « sur devis » plutôt qu'un trou quand le catalogue s'est tu", () => {
    const { html } = rendrePlaquette(format, { ...base, prix: null });
    expect(html).toContain("sur devis");
  });

  it("nomme « Votre entreprise » plutôt que rien", () => {
    const { html } = rendrePlaquette(format, { ...base, nom: "   " });
    expect(html).toContain("Votre entreprise");
  });

  it("ne parle jamais d'hébergement ni de « tout compris »", () => {
    // Décision commerciale : l'hébergement est parfois offert, le nommer en
    // ferait un frein, et « tout compris » mentirait à la signature.
    const { html, css } = rendrePlaquette(format, base);
    expect(`${html}${css}`).not.toMatch(/hébergement/i);
    expect(html).not.toContain("tout compris");
  });

  it("sert sa feuille de style avec son corps", () => {
    const { css } = rendrePlaquette(format, base);
    expect(css).toContain("#doc.sc");
    expect(css.length).toBeGreaterThan(10_000);
  });
});

describe("pagination", () => {
  it("l'A4 fait deux feuilles de deux demi-pages", () => {
    const { html } = rendrePlaquette("a4", base);
    expect(html.match(/class="sheet"/g) ?? []).toHaveLength(2);
    expect(html.match(/class="half/g) ?? []).toHaveLength(4);
  });

  it("le mobile fait sept écrans, et une page d'impression par écran", () => {
    const { html, css } = rendrePlaquette("mobile", base);
    expect(html.match(/class="page[ "]/g) ?? []).toHaveLength(7);
    expect(css).toContain("page-break-before:always");
  });
});
