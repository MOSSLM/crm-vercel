import { deriveSubdomainLabel, uniqueSubdomain } from "../derive-subdomain";

describe("deriveSubdomainLabel", () => {
  it("strips protocol, www, path and tld", () => {
    expect(deriveSubdomainLabel("https://www.ecotherme.fr/contact")).toBe("ecotherme");
    expect(deriveSubdomainLabel("ecotherme.fr")).toBe("ecotherme");
    expect(deriveSubdomainLabel("http://ECOTHERME.FR")).toBe("ecotherme");
  });

  it("slugifies spaces and special chars", () => {
    expect(deriveSubdomainLabel("https://eco therme&co.fr")).toBe("eco-therme-co");
  });

  it("falls back to the company name when url is empty", () => {
    expect(deriveSubdomainLabel("", "Éco Therme")).toBe("eco-therme");
    expect(deriveSubdomainLabel(null, "Acme SARL")).toBe("acme-sarl");
  });
});

describe("uniqueSubdomain", () => {
  it("returns the base label when free", () => {
    expect(uniqueSubdomain("ecotherme", new Set())).toBe("ecotherme");
  });

  it("appends an incrementing suffix on collision", () => {
    expect(uniqueSubdomain("ecotherme", new Set(["ecotherme"]))).toBe("ecotherme-2");
    expect(uniqueSubdomain("ecotherme", new Set(["ecotherme", "ecotherme-2"]))).toBe("ecotherme-3");
  });

  it("falls back to 'site' when the label is empty", () => {
    expect(uniqueSubdomain("", new Set())).toBe("site");
  });

  // Un client dont le site est « rapport.fr » ou « app.fr » prendrait sinon
  // l'hôte de l'application : le déploiement ne consulte que les sous-domaines
  // déjà attribués, et `rapport.{domaine}` sert le rapport d'audit public.
  it("refuses labels reserved by the app itself", () => {
    expect(uniqueSubdomain("rapport", new Set())).toBe("rapport-2");
    expect(uniqueSubdomain("app", new Set())).toBe("app-2");
    expect(uniqueSubdomain("api", new Set())).toBe("api-2");
  });

  it("still skips past a reserved label already colliding", () => {
    expect(uniqueSubdomain("app", new Set(["app-2"]))).toBe("app-3");
  });
});
