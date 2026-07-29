import { applyVariableAliases } from "../variable-aliases";
import { applyStatVariables } from "../stats-variables";
import { finalizeEnterpriseVariables } from "../build-enterprise-variables";

describe("applyVariableAliases", () => {
  // Le mode d'échec d'origine : un token à une lettre près rend du vide, en
  // silence. Les orthographes voisines doivent résoudre comme la canonique.
  it("mirrors a canonical value onto its aliases", () => {
    const vars: Record<string, string> = { "entreprise.annee_experience": "12" };
    applyVariableAliases(vars);
    expect(vars["entreprise.annees_experience"]).toBe("12");
    expect(vars["entreprise.experience"]).toBe("12");
  });

  it("covers the three other stat tokens", () => {
    const vars: Record<string, string> = {
      "entreprise.clients_count": "480",
      "entreprise.installations": "1300",
      "entreprise.qualifications": "3",
    };
    applyVariableAliases(vars);
    expect(vars["entreprise.nb_clients"]).toBe("480");
    expect(vars["entreprise.interventions"]).toBe("1300");
    expect(vars["entreprise.chantiers"]).toBe("1300");
    expect(vars["entreprise.certifications"]).toBe("3");
  });

  it("never overwrites a value already set by hand", () => {
    const vars: Record<string, string> = {
      "entreprise.annee_experience": "12",
      "entreprise.annees_experience": "20",
    };
    applyVariableAliases(vars);
    expect(vars["entreprise.annees_experience"]).toBe("20");
  });

  it("does not invent an alias from an empty canonical value", () => {
    const vars: Record<string, string> = { "entreprise.clients_count": "" };
    applyVariableAliases(vars);
    expect(vars["entreprise.nb_clients"]).toBeUndefined();
  });
});

describe("applyStatVariables", () => {
  // `entreprises.stats` et `content_overrides.stats` n'alimentaient que le JSON
  // `__stats`, jamais les tokens — une entreprise renseignée à la main sortait
  // donc avec des cases vides.
  it("fills the scalar tokens from a resolved stats list", () => {
    const vars: Record<string, string> = {};
    applyStatVariables(vars, [
      { label: "Années d'expérience", value: "12" },
      { label: "Clients satisfaits", value: "480" },
      { label: "Installations réalisées", value: "1300" },
      { label: "Qualifications", value: "3" },
    ]);
    expect(vars["entreprise.annee_experience"]).toBe("12");
    expect(vars["entreprise.clients_count"]).toBe("480");
    expect(vars["entreprise.installations"]).toBe("1300");
    expect(vars["entreprise.qualifications"]).toBe("3");
  });

  it("matches labels regardless of accents, case and punctuation", () => {
    const vars: Record<string, string> = {};
    applyStatVariables(vars, [{ label: "ANNEES D EXPERIENCE", value: "8" }]);
    expect(vars["entreprise.annee_experience"]).toBe("8");
  });

  it("never overwrites a value already resolved, and skips empty stats", () => {
    const vars: Record<string, string> = { "entreprise.annee_experience": "20" };
    applyStatVariables(vars, [
      { label: "Années d'expérience", value: "12" },
      { label: "Clients satisfaits", value: "0" },
    ]);
    expect(vars["entreprise.annee_experience"]).toBe("20");
    expect(vars["entreprise.clients_count"]).toBeUndefined();
  });

  it("ignores an unknown label (it stays available through __stats)", () => {
    const vars: Record<string, string> = {};
    applyStatVariables(vars, [{ label: "Camions", value: "7" }]);
    expect(Object.keys(vars)).toHaveLength(0);
  });
});

describe("finalizeEnterpriseVariables", () => {
  // Les deux résolveurs doivent produire le même jeu de clés, sinon on retombe
  // sur « visible dans le builder, vide une fois déployé ».
  it("derives the company.* family and defaults the country", () => {
    const vars: Record<string, string> = {
      "entreprise.nom": "Clim Pro",
      "entreprise.ville": "Quetigny",
      "entreprise.adresse": "3 rue des Lilas",
      "entreprise.telephone": "0612345678",
      "entreprise.email": "a@b.fr",
      "entreprise.services": "Climatisation",
      "entreprise.logo_url": "logo.png",
      "entreprise.site_web_canonique": "https://climpro.fr",
      "entreprise.note_moyenne": "4,8",
      "entreprise.nombre_avis": "127",
    };
    finalizeEnterpriseVariables(vars, null);
    expect(vars["company.name"]).toBe("Clim Pro");
    expect(vars["company.address"]).toBe("3 rue des Lilas, Quetigny");
    expect(vars["company.logo"]).toBe("logo.png");
    expect(vars["company.website"]).toBe("https://climpro.fr");
    expect(vars["entreprise.pays"]).toBe("France");
    // `entreprise.site_web` n'existait que côté aperçu : c'est un alias.
    expect(vars["entreprise.site_web"]).toBe("https://climpro.fr");
  });

  it("chains stats fallback then aliases", () => {
    const vars: Record<string, string> = {};
    finalizeEnterpriseVariables(vars, [{ label: "Clients satisfaits", value: "480" }]);
    expect(vars["entreprise.clients_count"]).toBe("480");
    expect(vars["entreprise.nb_clients"]).toBe("480");
  });
});
