// `url-variants.ts` est du TypeScript pur (aucun global Deno, aucune I/O), donc
// testable directement depuis la suite Jest du CRM — contrairement au reste de
// `scraper.ts`, qui lit `Deno.env` au chargement.
//
// Ce qui est verrouillé ici : un site joignable ne doit plus jamais être déclaré
// « sans site web » à cause d'un `www` en trop ou d'un `https` que le serveur ne
// sert pas.
import { buildHomeCandidates, originOf, sameOrigin, toAbsoluteUrl, toggleWww } from "../url-variants";

describe("toAbsoluteUrl", () => {
  it("complète le schéma manquant", () => {
    expect(toAbsoluteUrl("exemple.fr")?.href).toBe("https://exemple.fr/");
    expect(toAbsoluteUrl("www.exemple.fr/contact")?.href).toBe("https://www.exemple.fr/contact");
  });

  it("respecte le schéma déjà présent", () => {
    expect(toAbsoluteUrl("http://exemple.fr")?.protocol).toBe("http:");
  });

  it("rejette ce qui n'est pas une adresse", () => {
    for (const bad of ["", "   ", "localhost", "pas une url"]) {
      expect(toAbsoluteUrl(bad)).toBeNull();
    }
  });
});

describe("toggleWww", () => {
  it("bascule dans les deux sens", () => {
    expect(toggleWww("www.exemple.fr")).toBe("exemple.fr");
    expect(toggleWww("exemple.fr")).toBe("www.exemple.fr");
  });
});

describe("buildHomeCandidates", () => {
  it("couvre les quatre combinaisons www/apex × https/http", () => {
    // Le cas IDC Energies : Google donne le `www`, seul l'apex répond.
    const built = buildHomeCandidates("https://www.exemple.fr");
    expect(built?.candidates).toEqual([
      "https://www.exemple.fr",
      "http://www.exemple.fr",
      "https://exemple.fr",
      "http://exemple.fr",
    ]);
  });

  it("part du schéma stocké, et propose l'autre ensuite", () => {
    const built = buildHomeCandidates("http://exemple.fr");
    expect(built?.candidates[0]).toBe("http://exemple.fr");
    expect(built?.candidates).toContain("https://exemple.fr");
    expect(built?.candidates).toContain("http://www.exemple.fr");
  });

  it("essaie d'abord le chemin stocké — certains sites ne rendent que /accueil", () => {
    const built = buildHomeCandidates("https://exemple.fr/accueil/");
    expect(built?.candidates[0]).toBe("https://exemple.fr/accueil");
    expect(built?.candidates[1]).toBe("https://exemple.fr");
  });

  it("ne propose jamais deux fois la même URL", () => {
    const built = buildHomeCandidates("https://exemple.fr/");
    expect(built?.candidates).toEqual([
      "https://exemple.fr",
      "http://exemple.fr",
      "https://www.exemple.fr",
      "http://www.exemple.fr",
    ]);
    expect(new Set(built?.candidates).size).toBe(built?.candidates.length);
  });

  it("garde l'origine stockée comme point de départ", () => {
    expect(buildHomeCandidates("www.exemple.fr/contact")?.origin).toBe("https://www.exemple.fr");
  });

  it("rend null sur une URL illisible", () => {
    expect(buildHomeCandidates("")).toBeNull();
    expect(buildHomeCandidates(null)).toBeNull();
  });
});

describe("originOf / sameOrigin", () => {
  it("réduit une URL à son origine", () => {
    expect(originOf("https://exemple.fr/contact?x=1")).toBe("https://exemple.fr");
    expect(originOf("bidon")).toBeNull();
  });

  it("distingue www, apex et schémas — c'est ce qui déclenche la correction de fiche", () => {
    expect(sameOrigin("https://exemple.fr", "https://exemple.fr/")).toBe(true);
    expect(sameOrigin("https://www.exemple.fr", "https://exemple.fr")).toBe(false);
    expect(sameOrigin("http://exemple.fr", "https://exemple.fr")).toBe(false);
    expect(sameOrigin(null, "https://exemple.fr")).toBe(false);
  });
});
