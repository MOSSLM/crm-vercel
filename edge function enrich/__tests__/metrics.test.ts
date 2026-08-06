import { TRACKED_FIELDS, fieldsFound, newRun, saveRun } from "../metrics";
import type { LLMExtraction } from "../types";

/**
 * `fields_found` est LA mesure de qualité d'un modèle : ce qu'il a trouvé sur le
 * site, champ par champ, indépendamment de ce qui a fini écrit en base
 * (l'application est non destructive, un champ déjà rempli n'est jamais réécrit).
 * Un décompte faux fausse toute la comparaison entre modèles.
 */
const EMPTY: LLMExtraction = {
  services_tags: [],
  company_name_clean: null,
  email: null,
  logo_url: null,
  address_clean: null,
  years_experience: null,
  rge_count: null,
  satisfied_clients_from_site: null,
  installations_from_site: null,
  closest_big_city: null,
  surrounding_cities: [],
  site_accessible: true,
};

describe("fieldsFound", () => {
  it("compte zéro sur une extraction vide", () => {
    const res = fieldsFound(EMPTY);
    expect(res.fields_found_count).toBe(0);
    expect(res.fields_total).toBe(TRACKED_FIELDS.length);
    expect(Object.values(res.fields_found).every((v) => v === false)).toBe(true);
  });

  it("compte un tableau vide comme NON trouvé", () => {
    // `services_tags: []` veut dire « aucun service identifié », pas « répondu ».
    // Les compter comme trouvés gonflerait le taux de tous les modèles à
    // l'identique et masquerait précisément ce qu'on cherche à comparer.
    const res = fieldsFound({ ...EMPTY, services_tags: [], surrounding_cities: [] });
    expect(res.fields_found.services_tags).toBe(false);
    expect(res.fields_found.surrounding_cities).toBe(false);
  });

  it("distingue les champs remplis des champs laissés à null", () => {
    const res = fieldsFound({
      ...EMPTY,
      services_tags: ["plomberie"],
      email: "contact@exemple.fr",
      years_experience: 15,
      closest_big_city: "Dijon",
    });
    expect(res.fields_found).toMatchObject({
      services_tags: true,
      email: true,
      years_experience: true,
      closest_big_city: true,
      logo_url: false,
      rge_count: false,
    });
    expect(res.fields_found_count).toBe(4);
  });

  it("ne compte pas une chaîne vide comme trouvée", () => {
    const res = fieldsFound({ ...EMPTY, email: "" });
    expect(res.fields_found.email).toBe(false);
    expect(res.fields_found_count).toBe(0);
  });

  it("rend un décompte nul, jamais une exception, sans extraction", () => {
    // Le journal s'écrit dans un `finally` : lui faire lever une exception
    // masquerait l'erreur d'origine de l'enrichissement.
    const res = fieldsFound(null);
    expect(res.fields_found_count).toBe(0);
    expect(res.fields_total).toBe(TRACKED_FIELDS.length);
  });

  it("couvre exactement les champs de l'extraction, sans clé inventée", () => {
    const res = fieldsFound(EMPTY);
    expect(Object.keys(res.fields_found).sort()).toEqual([...TRACKED_FIELDS].sort());
  });
});

describe("newRun", () => {
  it("retombe sur 'unknown' quand l'appelant ne dit pas d'où il vient", () => {
    expect(newRun("p1", "").source).toBe("unknown");
    expect(newRun("p1", "reenrich").source).toBe("reenrich");
  });
});

describe("saveRun", () => {
  const runOf = () => newRun("p1", "crm_manual");

  it("insère la ligne dans enrichment_runs", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const sb = { from: jest.fn().mockReturnValue({ insert }) };
    await saveRun(sb, runOf());
    expect(sb.from).toHaveBeenCalledWith("enrichment_runs");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "p1" }));
  });

  it("avale une erreur de la base — mieux vaut perdre une mesure qu'un enrichissement", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const sb = {
      from: () => ({ insert: () => Promise.resolve({ error: { message: "relation absente" } }) }),
    };
    await expect(saveRun(sb, runOf())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("avale aussi une exception du client", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const sb = {
      from: () => {
        throw new Error("réseau");
      },
    };
    await expect(saveRun(sb, runOf())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
