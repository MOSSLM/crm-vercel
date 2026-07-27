// Lectures Supabase de la ville SEO. Le client est simulé : on vérifie la
// logique de sélection (désambiguïsation, spécificité des corrections, repli sur
// les valeurs par défaut), pas le SDK.
import { DEFAULT_GEO_SETTINGS } from "../geo";
import { loadGeoSettings, loadOriginCommune, loadVilleSeoOverride } from "../communes";

type Row = Record<string, unknown>;

/**
 * Client Supabase minimal : chaque table renvoie un jeu de lignes ou une erreur.
 * Les filtres (`contains`, `eq`, `gte`…) sont acceptés et ignorés — ce qu'on
 * teste ici, c'est ce que le code fait des lignes qu'il reçoit.
 */
function fakeClient(tables: Record<string, { rows?: Row[]; error?: { code?: string; message?: string } }>) {
  return {
    from(table: string) {
      const entry = tables[table] ?? { rows: [] };
      const result = { data: entry.error ? null : (entry.rows ?? []), error: entry.error ?? null };
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        maybeSingle: () =>
          Promise.resolve({
            data: entry.error ? null : ((entry.rows ?? [])[0] ?? null),
            error: entry.error ?? null,
          }),
      };
      for (const method of ["select", "eq", "contains", "gte", "lte", "limit", "order"]) {
        builder[method] = () => builder;
      }
      return builder;
    },
  } as never;
}

describe("loadGeoSettings", () => {
  it("reads the configured thresholds", async () => {
    const sb = fakeClient({
      enrichment_geo_settings: {
        rows: [{
          metro_population: 90000,
          metro_radius_km: 25,
          big_city_population: 15000,
          preferred_radius_km: 40,
          max_radius_km: 70,
        }],
      },
    });
    await expect(loadGeoSettings(sb)).resolves.toEqual({
      metroPopulation: 90000,
      metroRadiusKm: 25,
      bigCityPopulation: 15000,
      preferredRadiusKm: 40,
      maxRadiusKm: 70,
    });
  });

  it("falls back to the defaults when the table is missing", async () => {
    // Migration non appliquée : l'enrichissement doit continuer, pas échouer.
    const sb = fakeClient({ enrichment_geo_settings: { error: { code: "42P01", message: "does not exist" } } });
    await expect(loadGeoSettings(sb)).resolves.toEqual(DEFAULT_GEO_SETTINGS);
  });
});

describe("loadVilleSeoOverride", () => {
  const rows = [
    { commune: null, ville_seo: "Defaut-Du-Code-Postal" },
    { commune: "Sainte-Marie-sur-Mer", ville_seo: "Regle-Specifique" },
  ];

  it("prefers the rule targeting the commune", async () => {
    const sb = fakeClient({ ville_seo_overrides: { rows } });
    await expect(loadVilleSeoOverride(sb, "44210", "Sainte-Marie-sur-Mer")).resolves.toBe("Regle-Specifique");
  });

  it("matches the commune despite accents, case and punctuation", async () => {
    const sb = fakeClient({ ville_seo_overrides: { rows } });
    await expect(loadVilleSeoOverride(sb, "44210", "SAINTE MARIE SUR MER")).resolves.toBe("Regle-Specifique");
  });

  it("falls back to the postal-code-wide rule for another commune", async () => {
    const sb = fakeClient({ ville_seo_overrides: { rows } });
    await expect(loadVilleSeoOverride(sb, "44210", "Autre-Commune")).resolves.toBe("Defaut-Du-Code-Postal");
  });

  it("returns null without a postal code or without any rule", async () => {
    const sb = fakeClient({ ville_seo_overrides: { rows: [] } });
    await expect(loadVilleSeoOverride(sb, null, "Peu-Importe")).resolves.toBeNull();
    await expect(loadVilleSeoOverride(sb, "44210", "Peu-Importe")).resolves.toBeNull();
  });
});

describe("loadOriginCommune", () => {
  // Un code postal couvre souvent plusieurs communes.
  const rows = [
    { nom: "Petite-Commune", population: 800, lat: 1, lon: 1 },
    { nom: "Grosse-Commune", population: 12000, lat: 2, lon: 2 },
  ];

  it("disambiguates by the company's city name", async () => {
    const sb = fakeClient({ communes_fr: { rows } });
    await expect(loadOriginCommune(sb, "21800", "Petite-Commune")).resolves.toMatchObject({
      nom: "Petite-Commune",
      lat: 1,
    });
  });

  it("falls back to the most populated commune when the name doesn't match", async () => {
    const sb = fakeClient({ communes_fr: { rows } });
    await expect(loadOriginCommune(sb, "21800", "Inconnue")).resolves.toMatchObject({
      nom: "Grosse-Commune",
    });
  });

  it("ignores rows without usable coordinates", async () => {
    const sb = fakeClient({
      communes_fr: { rows: [{ nom: "Sans-Centre", population: 90000, lat: null, lon: null }, rows[0]] },
    });
    await expect(loadOriginCommune(sb, "21800", "Inconnue")).resolves.toMatchObject({ nom: "Petite-Commune" });
  });

  it("returns null for a non-French postal code or an empty referential", async () => {
    const sb = fakeClient({ communes_fr: { rows } });
    await expect(loadOriginCommune(sb, "CH-1200", "Genève")).resolves.toBeNull();
    await expect(loadOriginCommune(fakeClient({ communes_fr: { rows: [] } }), "21800", "X")).resolves.toBeNull();
  });
});
