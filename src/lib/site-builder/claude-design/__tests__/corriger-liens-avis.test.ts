import {
  corrigerLiensAvis,
  estFicheGoogle,
  estRechercheGoogle,
} from "../corriger-liens-avis";

const FICHE =
  "https://www.google.com/maps/place/Climat+Gaz+33/data=!4m7!3m6!1s0xd55246f329044cf:0x3b2090978e2cf3a8";

describe("estRechercheGoogle", () => {
  it("reconnaît la recherche qui cassait les démos", () => {
    expect(estRechercheGoogle("https://www.google.com/search?q=avis")).toBe(true);
  });

  it("reconnaît une recherche cartographique", () => {
    expect(estRechercheGoogle("https://www.google.com/maps/search/avis+climat+gaz")).toBe(true);
  });

  it("reconnaît les domaines nationaux", () => {
    expect(estRechercheGoogle("https://www.google.fr/search?q=avis")).toBe(true);
    expect(estRechercheGoogle("https://google.co.uk/search?q=avis")).toBe(true);
  });

  it("ne confond pas une fiche avec une recherche", () => {
    expect(estRechercheGoogle(FICHE)).toBe(false);
  });

  it("ignore les autres domaines, y compris ceux qui imitent Google", () => {
    expect(estRechercheGoogle("https://www.bing.com/search?q=avis")).toBe(false);
    expect(estRechercheGoogle("https://notgoogle.com/search?q=avis")).toBe(false);
    expect(estRechercheGoogle("https://google.com.evil.fr/search?q=avis")).toBe(false);
  });

  it("ne casse pas sur un href relatif ou vide", () => {
    expect(estRechercheGoogle("/contact")).toBe(false);
    expect(estRechercheGoogle("")).toBe(false);
    expect(estRechercheGoogle("#")).toBe(false);
  });
});

describe("estFicheGoogle", () => {
  it("reconnaît une fiche maps/place", () => {
    expect(estFicheGoogle(FICHE)).toBe(true);
  });

  it("reconnaît les liens courts d'établissement", () => {
    expect(estFicheGoogle("https://g.page/climat-gaz")).toBe(true);
    expect(estFicheGoogle("https://goo.gl/maps/abc123")).toBe(true);
  });

  it("reconnaît un lien par cid", () => {
    expect(estFicheGoogle("https://www.google.com/maps?cid=123456789")).toBe(true);
  });

  it("refuse une recherche", () => {
    expect(estFicheGoogle("https://www.google.com/search?q=avis")).toBe(false);
  });
});

describe("corrigerLiensAvis", () => {
  it("réécrit la recherche Google vers la fiche du client", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Voir tous les avis</a>`;
    expect(corrigerLiensAvis(html, FICHE)).toContain(`href="${FICHE}"`);
  });

  it("ouvre le lien corrigé dans un nouvel onglet", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Voir tous les avis</a>`;
    const out = corrigerLiensAvis(html, FICHE);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("respecte un target déjà posé par le design", () => {
    const html = `<a href="https://www.google.com/search?q=avis" target="_self">Avis</a>`;
    expect(corrigerLiensAvis(html, FICHE)).toContain('target="_self"');
  });

  it("honore le marqueur explicite quel que soit le href", () => {
    const html = `<a data-avis-lien href="#">Nos avis</a>`;
    expect(corrigerLiensAvis(html, FICHE)).toContain(`href="${FICHE}"`);
  });

  it("laisse tranquille un lien qui pointe déjà vers une fiche", () => {
    const autre = "https://www.google.com/maps/place/Deja+Bon";
    const html = `<a href="${autre}">Avis</a>`;
    expect(corrigerLiensAvis(html, FICHE)).toContain(autre);
  });

  it("ne touche pas aux liens internes ni aux autres domaines", () => {
    const html = `<a href="/contact">Contact</a><a href="https://facebook.com/x">Facebook</a>`;
    expect(corrigerLiensAvis(html, FICHE)).toBe(html);
  });

  it("corrige plusieurs liens dans la même page", () => {
    const html =
      `<a href="https://www.google.com/search?q=avis">Avis</a>` +
      `<a href="https://www.google.fr/maps/search/avis">Tous les avis</a>`;
    const out = corrigerLiensAvis(html, FICHE);
    expect(out.match(new RegExp(FICHE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(2);
  });

  it("ne fait rien sans fiche NI nom — mieux vaut le lien bancal qu'un href vide", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Avis</a>`;
    expect(corrigerLiensAvis(html, null)).toBe(html);
    expect(corrigerLiensAvis(html, "")).toBe(html);
    expect(corrigerLiensAvis(html, "   ")).toBe(html);
    expect(corrigerLiensAvis(html, null, { nom: "  ", ville: "Bordeaux" })).toBe(html);
  });

  it("sans fiche, cherche l'entreprise et sa ville au lieu du mot « avis »", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Voir tous les avis</a>`;
    const out = corrigerLiensAvis(html, null, { nom: "Climat Gaz", ville: "Bordeaux" });
    expect(out).toContain(`href="https://www.google.com/search?q=Climat%20Gaz%20Bordeaux"`);
  });

  it("sans ville connue, la recherche de repli se fait sur le seul nom", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Avis</a>`;
    const out = corrigerLiensAvis(html, null, { nom: "Climat Gaz", ville: null });
    expect(out).toContain(`href="https://www.google.com/search?q=Climat%20Gaz"`);
  });

  it("le repli d'un lien cartographique reste cartographique", () => {
    const html = `<a href="https://www.google.fr/maps/search/avis">Sur la carte</a>`;
    const out = corrigerLiensAvis(html, null, { nom: "Climat Gaz", ville: "Bordeaux" });
    expect(out).toContain(`href="https://www.google.com/maps/search/Climat%20Gaz%20Bordeaux"`);
  });

  it("le repli ouvre aussi dans un nouvel onglet", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Avis</a>`;
    const out = corrigerLiensAvis(html, null, { nom: "Climat Gaz", ville: "Bordeaux" });
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("la fiche l'emporte toujours sur le repli", () => {
    const html = `<a href="https://www.google.com/search?q=avis">Avis</a>`;
    const out = corrigerLiensAvis(html, FICHE, { nom: "Climat Gaz", ville: "Bordeaux" });
    expect(out).toContain(`href="${FICHE}"`);
    expect(out).not.toContain("q=Climat");
  });

  it("le marqueur explicite suit le repli quand il n'y a pas de fiche", () => {
    const html = `<a data-avis-lien href="#">Nos avis</a>`;
    const out = corrigerLiensAvis(html, null, { nom: "Climat Gaz", ville: "Bordeaux" });
    expect(out).toContain(`href="https://www.google.com/search?q=Climat%20Gaz%20Bordeaux"`);
  });

  it("retourne le HTML tel quel quand il n'y a rien à corriger", () => {
    const html = `<section><p>Aucun lien ici</p></section>`;
    expect(corrigerLiensAvis(html, FICHE)).toBe(html);
  });

  it("préserve le contenu du lien", () => {
    const html = `<a href="https://www.google.com/search?q=avis"><span>Voir tous les avis</span></a>`;
    expect(corrigerLiensAvis(html, FICHE)).toContain("<span>Voir tous les avis</span>");
  });
});
