/**
 * Le remplissage des gabarits — et les trois fautes qu'il doit rendre
 * impossibles : un marqueur oublié, une valeur qui casse son contexte, et une
 * couverture qui promet une démo qui n'existe pas.
 */
import { rendrePlaquette, type DonneesPlaquette } from "@/lib/audit/plaquette-rendu";
import { boostSeoLocal } from "@/lib/audit/prix-seo-local";

const base: DonneesPlaquette = {
  nom: "Maac-Air",
  meta: "climatisation · Viry-Châtillon",
  demoUrl: "https://maac-air.samadigitalstudio.fr",
  captureDemo: "https://llzrpcbwnqvbrcjjwysm.supabase.co/storage/v1/object/public/x/shot.jpg",
  prix: "690 €",
  date: "21 août 2026",
  // Deux métiers : de quoi voir que le nombre de pages du boost n'est pas
  // celui des communes, et que l'accord suit (« vos 2 métiers »).
  boost: boostSeoLocal(["climatisation", "plomberie"]),
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

  it("le mobile fait huit écrans, et une page d'impression par écran", () => {
    const { html, css } = rendrePlaquette("mobile", base);
    expect(html.match(/class="page[ "]/g) ?? []).toHaveLength(8);
    expect(css).toContain("page-break-before:always");
  });
});

/**
 * L'ÉCRAN DU BOOST SEO LOCAL — et la promesse qu'il remplace.
 *
 * Le document vendait « une page par métier ET PAR COMMUNE » dans le prix du
 * site : ce n'est pas ce que le générateur livre, et ça n'a jamais été facturé.
 * Les communes sont devenues un produit à part, chiffré pour le prospect. Ce
 * que ces tests tiennent est la couture des deux moitiés — le barème calcule,
 * le gabarit affiche — parce qu'un marqueur mal nommé ne casse rien : il part
 * en clair chez le prospect.
 */
describe("le boost SEO local", () => {
  it("ne promet plus les communes dans le prix du site", () => {
    // LA FAUTE D'ORIGINE, dans les deux formats : la phrase se lisait sur la
    // page des piliers ET sur celle des repères.
    for (const format of ["a4", "mobile"] as const) {
      const { html } = rendrePlaquette(format, base);
      expect(html).not.toContain("par métier et par commune");
      expect(html).toContain("Une page par métier ou service");
    }
  });

  it("chiffre les trois formules pour CE prospect", () => {
    const { html } = rendrePlaquette("mobile", base);
    // Deux métiers : 20, 40 et 60 pages, donc 160, 320 et 460 €.
    expect(html).toContain("20 pages écrites");
    expect(html).toContain("40 pages écrites");
    expect(html).toContain("60 pages écrites");
    expect(html).toContain("460\u00A0\u20AC");
  });

  it("accorde « métiers » au nombre, sans jamais écrire « 1 métiers »", () => {
    const un = rendrePlaquette("mobile", { ...base, boost: boostSeoLocal([]) }).html;
    expect(un).toContain("1 métier<");
    expect(un).not.toContain("1 métiers");
    expect(rendrePlaquette("mobile", base).html).toContain("2 métiers<");
  });

  it("n'existe qu'en mobile, et l'A4 n'en garde aucune trace", () => {
    // L'A4 est une mise en page à positions fixes : l'écran n'y rentre pas. Ce
    // qu'on vérifie est qu'il n'en porte AUCUN marqueur — un marqueur laissé
    // dans un gabarit qui ne le remplit pas partirait en clair chez le prospect.
    const { html } = rendrePlaquette("a4", base);
    expect(html).not.toContain("SEO_");
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});
