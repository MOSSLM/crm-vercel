import { applyProjectEnrichment, effectiveStat } from "../project-enrichment";

/**
 * Les chiffres clés d'une démo sont estimés quand le site du client ne publie rien
 * d'exploitable : l'enrichissement les dérive du nombre d'avis Google. C'est
 * assumé pour une démo privée, accessible sur lien uniquement.
 *
 * Ce que ces tests protègent, c'est la suite : dès que le client confirme ses vrais
 * chiffres, ils doivent passer devant l'estimation — et l'enrichissement n'écrivant
 * jamais les colonnes `_official`, une relance ne peut pas les effacer.
 */
describe("effectiveStat", () => {
  it("préfère le chiffre officiel à l'estimation", () => {
    const proj = { stat_years_experience: "12", stat_years_experience_official: "25" };
    expect(effectiveStat(proj, "stat_years_experience", "stat_years_experience_official")).toBe("25");
  });

  it("retombe sur l'estimation quand l'officiel est absent", () => {
    for (const official of [undefined, null, "", "0", "—", "-"]) {
      const proj = { stat_years_experience: "12", stat_years_experience_official: official };
      expect(effectiveStat(proj, "stat_years_experience", "stat_years_experience_official")).toBe("12");
    }
  });

  it("rend une chaîne vide quand ni l'un ni l'autre n'est renseigné", () => {
    expect(effectiveStat({}, "stat_years_experience", "stat_years_experience_official")).toBe("");
  });

  /** La migration s'applique à la main : une ligne sans ces colonnes doit marcher. */
  it("fonctionne sur une ligne antérieure à la migration", () => {
    const proj = { stat_satisfied_clients: "800" };
    expect(effectiveStat(proj, "stat_satisfied_clients", "stat_satisfied_clients_official")).toBe("800");
  });
});

describe("applyProjectEnrichment — priorité des chiffres officiels", () => {
  const base = {
    stat_years_experience: "12",
    stat_satisfied_clients: "700",
    stat_installations_completed: "1400",
    stat_rge_count: "2",
  };

  it("expose les chiffres officiels dans les variables du site", () => {
    const vars: Record<string, string> = {};
    applyProjectEnrichment(vars, {
      ...base,
      stat_years_experience_official: "25",
      stat_satisfied_clients_official: "1200",
      stat_installations_completed_official: "3000",
      stat_rge_count_official: "5",
    });
    expect(vars["entreprise.annee_experience"]).toBe("25");
    expect(vars["entreprise.clients_count"]).toBe("1200");
    expect(vars["entreprise.installations"]).toBe("3000");
    expect(vars["entreprise.qualifications"]).toBe("5");
  });

  it("garde les estimations quand rien n'est confirmé", () => {
    const vars: Record<string, string> = {};
    applyProjectEnrichment(vars, base);
    expect(vars["entreprise.annee_experience"]).toBe("12");
    expect(vars["entreprise.clients_count"]).toBe("700");
  });

  it("mélange officiel et estimé champ par champ", () => {
    const vars: Record<string, string> = {};
    applyProjectEnrichment(vars, { ...base, stat_satisfied_clients_official: "1200" });
    expect(vars["entreprise.annee_experience"]).toBe("12"); // estimé
    expect(vars["entreprise.clients_count"]).toBe("1200"); // confirmé
  });

  /**
   * `fillIfEmpty` : une valeur déjà posée dans le jsonb `variables` de la fiche est
   * une saisie manuelle sur le site, encore plus spécifique que le chiffre officiel.
   */
  it("n'écrase pas un override déjà présent dans les variables", () => {
    const vars: Record<string, string> = { "entreprise.annee_experience": "30" };
    applyProjectEnrichment(vars, { ...base, stat_years_experience_official: "25" });
    expect(vars["entreprise.annee_experience"]).toBe("30");
  });

  it("construit le bloc stats avec les valeurs effectives", () => {
    const { stats } = applyProjectEnrichment({}, { ...base, stat_years_experience_official: "25" });
    const annees = stats?.find((s) => s.label === "Années d'expérience");
    expect(annees?.value).toBe("25");
    const clients = stats?.find((s) => s.label === "Clients satisfaits");
    expect(clients?.value).toBe("700");
  });

  it("omet du bloc stats un chiffre ni estimé ni confirmé", () => {
    const { stats } = applyProjectEnrichment({}, { stat_years_experience: "12" });
    expect(stats?.map((s) => s.label)).toEqual(["Années d'expérience"]);
  });
});
