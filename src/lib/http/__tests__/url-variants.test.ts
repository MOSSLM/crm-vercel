/**
 * @jest-environment node
 */
// Ce qui est verrouillé ici : une adresse joignable ne doit plus être déclarée
// injoignable à cause d'un `www` en trop ou d'un `https` que le serveur ne sert
// pas. Doit rester aligné sur `edge function enrich/url-variants.ts`, son jumeau
// côté Deno.
import { buildUrlCandidates, originOf, sameOrigin, toAbsoluteUrl, toggleWww } from "../url-variants";

describe("toAbsoluteUrl", () => {
  it("complète le schéma manquant", () => {
    expect(toAbsoluteUrl("exemple.fr")?.href).toBe("https://exemple.fr/");
  });

  it("rejette ce qui n'est pas une adresse http(s)", () => {
    for (const bad of ["", "   ", "localhost", "ftp://exemple.fr", "pas une url"]) {
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

describe("buildUrlCandidates", () => {
  it("couvre les quatre combinaisons www/apex × https/http", () => {
    expect(buildUrlCandidates("https://www.exemple.fr")).toEqual([
      "https://www.exemple.fr",
      "http://www.exemple.fr",
      "https://exemple.fr",
      "http://exemple.fr",
    ]);
  });

  it("conserve le chemin sur chaque variante — /contact reste /contact", () => {
    expect(buildUrlCandidates("https://www.exemple.fr/contact")).toEqual([
      "https://www.exemple.fr/contact",
      "http://www.exemple.fr/contact",
      "https://exemple.fr/contact",
      "http://exemple.fr/contact",
    ]);
  });

  it("part du schéma demandé", () => {
    expect(buildUrlCandidates("http://exemple.fr")[0]).toBe("http://exemple.fr");
  });

  it("ne propose jamais deux fois la même URL", () => {
    const candidates = buildUrlCandidates("https://exemple.fr/");
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it("rend une liste vide sur une URL illisible", () => {
    expect(buildUrlCandidates("")).toEqual([]);
    expect(buildUrlCandidates(null)).toEqual([]);
  });
});

describe("originOf / sameOrigin", () => {
  it("réduit une URL à son origine", () => {
    expect(originOf("https://exemple.fr/contact?x=1")).toBe("https://exemple.fr");
    expect(originOf("bidon")).toBeNull();
  });

  it("distingue www, apex et schémas", () => {
    expect(sameOrigin("https://exemple.fr", "https://exemple.fr/")).toBe(true);
    expect(sameOrigin("https://www.exemple.fr", "https://exemple.fr")).toBe(false);
    expect(sameOrigin("http://exemple.fr", "https://exemple.fr")).toBe(false);
    expect(sameOrigin(null, "https://exemple.fr")).toBe(false);
  });
});
