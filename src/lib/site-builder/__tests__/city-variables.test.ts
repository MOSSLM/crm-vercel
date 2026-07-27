import { applyCityVariables, resolveCities } from "../city-variables";

describe("resolveCities", () => {
  it("uses override_city as the SEO city and keeps the real city untouched", () => {
    // Le cas nominal : entreprise à Quetigny, ville SEO Dijon.
    expect(
      resolveCities({ ville: "Quetigny", overrideCity: "Dijon", overrideLocation: "Dijon" }),
    ).toEqual({ ville: "Quetigny", villeSeo: "Dijon", location: "Dijon" });
  });

  it("falls back to override_location when override_city is empty", () => {
    // Projets enrichis par l'ancienne edge function : seul `override_location`
    // avait été rempli.
    expect(
      resolveCities({ ville: "Quetigny", overrideCity: null, overrideLocation: "Dijon" }),
    ).toEqual({ ville: "Quetigny", villeSeo: "Dijon", location: "Dijon" });
  });

  it("falls back to the real city when nothing is set", () => {
    // Aucun trou possible sur un site publié : la ville SEO vaut la vraie ville.
    expect(resolveCities({ ville: "Dijon", overrideCity: null, overrideLocation: null })).toEqual({
      ville: "Dijon",
      villeSeo: "Dijon",
      location: "Dijon",
    });
  });

  it("keeps a distinct override_location for already-published designs", () => {
    // `{{ entreprise.location }}` ne doit pas changer de valeur sous les pieds
    // d'un design déjà en ligne.
    expect(
      resolveCities({ ville: "Quetigny", overrideCity: "Dijon", overrideLocation: "Beaune" }),
    ).toEqual({ ville: "Quetigny", villeSeo: "Dijon", location: "Beaune" });
  });

  it("ignores blank strings and trims", () => {
    expect(resolveCities({ ville: " Quetigny ", overrideCity: "   ", overrideLocation: " Dijon " })).toEqual({
      ville: "Quetigny",
      villeSeo: "Dijon",
      location: "Dijon",
    });
  });

  it("returns empty strings when the company has no city at all", () => {
    expect(resolveCities({ ville: null, overrideCity: null, overrideLocation: null })).toEqual({
      ville: "",
      villeSeo: "",
      location: "",
    });
  });
});

describe("applyCityVariables", () => {
  it("writes the three variables and never lets the SEO city overwrite the real one", () => {
    const vars: Record<string, string> = { "entreprise.ville": "Quetigny" };
    applyCityVariables(vars, { ville: "Quetigny", overrideCity: "Dijon", overrideLocation: null });
    expect(vars["entreprise.ville"]).toBe("Quetigny");
    expect(vars["entreprise.ville_seo"]).toBe("Dijon");
    expect(vars["entreprise.location"]).toBe("Dijon");
  });
});
