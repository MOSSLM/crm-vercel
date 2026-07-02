import { geoFromCodePostal } from "../geo-fr";
import {
  applyDerivedVariables,
  applyEnrichmentVariables,
  type EnrichmentSlice,
} from "../enrichment-variables";

describe("geoFromCodePostal", () => {
  it("resolves metropolitan départements and régions", () => {
    expect(geoFromCodePostal("74000")).toEqual({
      departement: "Haute-Savoie",
      region: "Auvergne-Rhône-Alpes",
    });
    expect(geoFromCodePostal("75011")).toEqual({ departement: "Paris", region: "Île-de-France" });
  });

  it("handles Corse and DOM prefixes", () => {
    expect(geoFromCodePostal("20000")?.departement).toBe("Corse-du-Sud");
    expect(geoFromCodePostal("20200")?.departement).toBe("Haute-Corse");
    expect(geoFromCodePostal("97400")).toEqual({ departement: "La Réunion", region: "La Réunion" });
  });

  it("returns null for non-French or malformed codes", () => {
    expect(geoFromCodePostal("1204")).toBeNull(); // Genève
    expect(geoFromCodePostal("")).toBeNull();
    expect(geoFromCodePostal(null)).toBeNull();
    expect(geoFromCodePostal("96000")).toBeNull(); // unassigned prefix
  });
});

describe("applyEnrichmentVariables", () => {
  const slice: EnrichmentSlice = {
    areas_served: ["Annecy", "Seynod", "  Cran-Gevrier "],
    years_in_business: 12,
    founded_year: 2010,
    opening_hours: ["Lun–Ven 8h–18h", "Sam 9h–12h"],
  };

  it("fills zones, années d'expérience and horaires when empty", () => {
    const vars: Record<string, string> = {};
    applyEnrichmentVariables(vars, slice, 2026);
    expect(vars["entreprise.zones_desservies"]).toBe("Annecy, Seynod, Cran-Gevrier");
    expect(vars["entreprise.annee_experience"]).toBe("12");
    expect(vars["entreprise.horaires"]).toBe("Lun–Ven 8h–18h · Sam 9h–12h");
  });

  it("derives années d'expérience from founded_year when years_in_business is absent", () => {
    const vars: Record<string, string> = {};
    applyEnrichmentVariables(vars, { ...slice, years_in_business: null }, 2026);
    expect(vars["entreprise.annee_experience"]).toBe("16");
  });

  it("never overrides already-resolved values", () => {
    const vars: Record<string, string> = {
      "entreprise.horaires": "Sur rendez-vous",
      "entreprise.annee_experience": "20",
    };
    applyEnrichmentVariables(vars, slice, 2026);
    expect(vars["entreprise.horaires"]).toBe("Sur rendez-vous");
    expect(vars["entreprise.annee_experience"]).toBe("20");
  });

  it("ignores malformed payloads and null slices", () => {
    const vars: Record<string, string> = {};
    applyEnrichmentVariables(vars, null);
    applyEnrichmentVariables(vars, {
      areas_served: { not: "an array" },
      years_in_business: null,
      founded_year: null,
      opening_hours: { mon: "8-18" },
    });
    expect(vars).toEqual({});
  });
});

describe("applyDerivedVariables", () => {
  it("derives departement/region, telephone_lien and email_domain", () => {
    const vars: Record<string, string> = {
      "entreprise.code_postal": "74000",
      "entreprise.telephone": "01 23 45 67 89",
      "entreprise.email": "contact@clim-annecy.fr",
    };
    applyDerivedVariables(vars);
    expect(vars["entreprise.departement"]).toBe("Haute-Savoie");
    expect(vars["entreprise.region"]).toBe("Auvergne-Rhône-Alpes");
    expect(vars["entreprise.telephone_lien"]).toBe("0123456789");
    expect(vars["entreprise.email_domain"]).toBe("clim-annecy.fr");
  });

  it("keeps + prefix on international numbers and skips too-short ones", () => {
    const vars: Record<string, string> = { "entreprise.telephone": "+33 6 12 34 56 78" };
    applyDerivedVariables(vars);
    expect(vars["entreprise.telephone_lien"]).toBe("+33612345678");

    const short: Record<string, string> = { "entreprise.telephone": "36 99" };
    applyDerivedVariables(short);
    expect(short["entreprise.telephone_lien"]).toBeUndefined();
  });

  it("respects manual values (fill-only)", () => {
    const vars: Record<string, string> = {
      "entreprise.code_postal": "74000",
      "entreprise.departement": "Savoie du Nord",
    };
    applyDerivedVariables(vars);
    expect(vars["entreprise.departement"]).toBe("Savoie du Nord");
    expect(vars["entreprise.region"]).toBe("Auvergne-Rhône-Alpes");
  });
});
