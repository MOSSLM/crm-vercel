import {
  detectBracketTokens,
  applyBracketTokens,
  defaultMappingFromTokens,
  detectIdentityStrings,
} from "../bracket-tokens";

describe("detectBracketTokens", () => {
  const html = `
    <h1>[Nom de l'entreprise]</h1>
    <p>Depuis [XX] ans, [Nom de l'entreprise] vous accompagne.</p>
    <a href="tel:0123456789">[XX XX XX XX XX]</a>
    <span>SIRET [XXX XXX XXX XXXXX]</span>
  `;

  it("finds each distinct placeholder with its count", () => {
    const tokens = detectBracketTokens(html);
    const byFind = Object.fromEntries(tokens.map((t) => [t.find, t]));
    expect(byFind["[Nom de l'entreprise]"].count).toBe(2);
    expect(byFind["[XX XX XX XX XX]"].count).toBe(1);
    expect(byFind["[XX]"].count).toBe(1);
    expect(byFind["[XXX XXX XXX XXXXX]"].count).toBe(1);
  });

  it("suggests tokens for known placeholders and leaves ambiguous ones null", () => {
    const byFind = Object.fromEntries(detectBracketTokens(html).map((t) => [t.find, t]));
    expect(byFind["[Nom de l'entreprise]"].suggestedToken).toBe("{{ entreprise.nom }}");
    expect(byFind["[XX XX XX XX XX]"].suggestedToken).toBe("{{ entreprise.telephone }}");
    // SIRET n'est plus une variable Claude Design : le placeholder reste non mappé.
    expect(byFind["[XXX XXX XXX XXXXX]"].suggestedToken).toBeNull();
    expect(byFind["[XX]"].suggestedToken).toBeNull();
  });
});

describe("applyBracketTokens", () => {
  it("replaces every occurrence and reports counts", () => {
    const html = "<h1>[Nom de l'entreprise]</h1><footer>[Nom de l'entreprise]</footer>";
    const { html: out, applied } = applyBracketTokens(html, [
      { find: "[Nom de l'entreprise]", token: "{{ entreprise.nom }}", label: "Nom" },
    ]);
    expect(out).toBe("<h1>{{ entreprise.nom }}</h1><footer>{{ entreprise.nom }}</footer>");
    expect(applied[0].count).toBe(2);
  });

  it("skips entries with no token and non-matching finds", () => {
    const { html: out, applied } = applyBracketTokens("<p>[X]</p>", [
      { find: "[Y]", token: "{{ entreprise.nom }}", label: "x" },
      { find: "[X]", token: "", label: "x" },
    ]);
    expect(out).toBe("<p>[X]</p>");
    expect(applied).toHaveLength(0);
  });
});

describe("defaultMappingFromTokens", () => {
  it("keeps only suggested tokens", () => {
    const mapping = defaultMappingFromTokens(detectBracketTokens("[Nom de l'entreprise] [XX]"));
    expect(mapping).toEqual([{ find: "[Nom de l'entreprise]", token: "{{ entreprise.nom }}", label: "Nom de l'entreprise" }]);
  });
});

describe("ville / ville SEO", () => {
  // Les templates distinguent la ville de l'adresse ([Ville]) de la grande ville
  // mise en avant dans le texte marketing ([Ville SEO]) : les deux crochets
  // doivent se tokeniser vers deux variables différentes, sans intervention
  // dans l'écran de mapping.
  const html = "<h1>Plombier à [Ville SEO]</h1><li>[N° et rue], [Code postal] [Ville]</li>";

  it("maps each bracket to its own token", () => {
    const byFind = Object.fromEntries(detectBracketTokens(html).map((t) => [t.find, t]));
    expect(byFind["[Ville SEO]"].suggestedToken).toBe("{{ entreprise.ville_seo }}");
    expect(byFind["[Ville]"].suggestedToken).toBe("{{ entreprise.ville }}");
  });

  it("tokenises both automatically with the default mapping", () => {
    const { html: out } = applyBracketTokens(html, defaultMappingFromTokens(detectBracketTokens(html)));
    expect(out).toContain("<h1>Plombier à {{ entreprise.ville_seo }}</h1>");
    expect(out).toContain("{{ entreprise.code_postal }} {{ entreprise.ville }}");
    expect(out).not.toContain("[Ville");
  });
});

describe("detectIdentityStrings", () => {
  it("reports hardcoded city/postal when present", () => {
    const found = detectIdentityStrings("<p>74000 Annecy, Annecy</p>");
    const byFind = Object.fromEntries(found.map((f) => [f.find, f]));
    expect(byFind["Annecy"].count).toBe(2);
    expect(byFind["Annecy"].token).toBe("{{ entreprise.ville }}");
    expect(byFind["74000"].count).toBe(1);
  });
});
