import { buildCompanyPatch, buildProjectPatch } from "../_missing-data";

/**
 * La grille de complétion en masse ne connaît que les champs requis. Tout le
 * danger tient là : si un champ non envoyé était écrit à `null`, enregistrer
 * trois téléphones effacerait au passage l'adresse, l'e-mail et les horaires de
 * trois fiches. D'où la règle que ce fichier tient — **une clé absente n'est pas
 * une clé à vider** — et les deux règles de provenance héritées de la fiche.
 */

const NOW = "2026-08-07T10:00:00.000Z";

describe("buildCompanyPatch", () => {
  it("n'écrit que les colonnes envoyées", () => {
    expect(buildCompanyPatch({ telephone: "0450000000" }, NOW)).toEqual({
      telephone: "0450000000",
      manually_enriched: true,
      updated_at: NOW,
    });
  });

  it("rend null quand rien n'a été touché — pas d'UPDATE à vide", () => {
    expect(buildCompanyPatch({}, NOW)).toBeNull();
  });

  it("ne lève `manually_enriched` que s'il écrit vraiment quelque chose", () => {
    // Une ligne dont on n'a complété que le logo ne passe pas par ici : le logo
    // vit sur le dossier lead magnet.
    expect(buildCompanyPatch({}, NOW)).toBeNull();
    expect(buildCompanyPatch({ ville: "Annecy" }, NOW)).toHaveProperty("manually_enriched", true);
  });

  it("normalise le blanc en NULL, mais seulement pour les clés envoyées", () => {
    const patch = buildCompanyPatch({ ville: "  ", code_postal: " 74000 " }, NOW);
    expect(patch).toMatchObject({ ville: null, code_postal: "74000" });
    expect(patch).not.toHaveProperty("telephone");
    expect(patch).not.toHaveProperty("name");
  });

  it("écrit une liste de tags vide si — et seulement si — elle est envoyée", () => {
    expect(buildCompanyPatch({ service_tags: [] }, NOW)).toMatchObject({ service_tags: [] });
    expect(buildCompanyPatch({ telephone: "04" }, NOW)).not.toHaveProperty("service_tags");
  });

  it("distingue une note effacée d'une note non envoyée", () => {
    expect(buildCompanyPatch({ note_moyenne: null }, NOW)).toMatchObject({ note_moyenne: null });
    expect(buildCompanyPatch({ ville: "Annecy" }, NOW)).not.toHaveProperty("note_moyenne");
  });
});

describe("buildProjectPatch", () => {
  it("rend null quand rien n'a été touché", () => {
    expect(buildProjectPatch({}, "Annecy", NOW)).toBeNull();
  });

  it("n'écrit que les colonnes envoyées", () => {
    expect(buildProjectPatch({ logo_url: "https://cdn/l.png" }, "Annecy", NOW)).toEqual({
      logo_url: "https://cdn/l.png",
      updated_at: NOW,
    });
  });

  /**
   * `override_location` est le miroir historique de la ville SEO : les designs
   * qui utilisent encore `{{ entreprise.location }}` le lisent. Ne pas le
   * synchroniser ferait afficher au site une ville que la fiche ne montre plus.
   */
  it("synchronise override_location sur la ville SEO", () => {
    const patch = buildProjectPatch({ override_city: "Chambéry" }, "Annecy", NOW);
    expect(patch).toMatchObject({ override_city: "Chambéry", override_location: "Chambéry" });
  });

  /**
   * Sans cette comparaison, un enregistrement de masse marquerait « saisi à la
   * main » toutes les villes posées par l'enrichissement, et les sortirait du
   * recalcul automatique alors que personne ne les a validées.
   */
  it("ne marque « manual » que si la ville change vraiment", () => {
    expect(buildProjectPatch({ override_city: "Annecy" }, "Annecy", NOW)).not.toHaveProperty(
      "override_city_source",
    );
    expect(buildProjectPatch({ override_city: "Chambéry" }, "Annecy", NOW)).toMatchObject({
      override_city_source: "manual",
    });
    expect(buildProjectPatch({ override_city: "Chambéry" }, null, NOW)).toMatchObject({
      override_city_source: "manual",
    });
  });

  it("efface la provenance quand la ville SEO est vidée", () => {
    expect(buildProjectPatch({ override_city: "" }, "Annecy", NOW)).toMatchObject({
      override_city: null,
      override_location: null,
      override_city_source: null,
    });
  });

  it("laisse les chiffres non envoyés en dehors du patch", () => {
    const patch = buildProjectPatch({ stat_years_experience: "15" }, "Annecy", NOW);
    expect(patch).toMatchObject({ stat_years_experience: "15" });
    expect(patch).not.toHaveProperty("stat_satisfied_clients");
    expect(patch).not.toHaveProperty("stat_installations_completed");
    // Les qualifications RGE ne sont jamais réclamées : la grille ne les
    // propose pas, le patch ne doit donc pas les mentionner.
    expect(patch).not.toHaveProperty("stat_rge_count");
  });

  it("envoie NULL pour un chiffre vidé — `writeProjectDetails` gère le NOT NULL", () => {
    expect(buildProjectPatch({ stat_satisfied_clients: "  " }, "Annecy", NOW)).toMatchObject({
      stat_satisfied_clients: null,
    });
  });
});
