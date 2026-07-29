import {
  buildFlagsPatch,
  buildMergePlan,
  isBlank,
  type ProjectRecord,
} from "../merge-lead-magnet-projects";

const proj = (id: string, fields: Record<string, unknown> = {}): ProjectRecord => ({ id, ...fields });

describe("isBlank", () => {
  it("treats the empty-stat markers as absent, like the rest of the pipeline", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("0")).toBe(true);
    expect(isBlank("-")).toBe(true);
    expect(isBlank("—")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank({})).toBe(true);
  });

  it("keeps real values", () => {
    expect(isBlank("12")).toBe(false);
    expect(isBlank(["clim"])).toBe(false);
    expect(isBlank({ a: 1 })).toBe(false);
  });
});

describe("buildMergePlan", () => {
  // Le cas vécu : l'un des doublons porte les chiffres clés, l'autre le logo.
  // Aucune des deux lignes n'est complète, et le site n'en lit qu'une.
  it("recovers what the survivor is missing, from the duplicate", () => {
    const survivor = proj("s", { stat_years_experience: "12", logo_url: null });
    const dup = proj("d", { stat_years_experience: "99", logo_url: "logo.png", override_city: "Dijon" });

    const { patch, takenFrom } = buildMergePlan(survivor, [dup]);
    expect(patch.logo_url).toBe("logo.png");
    expect(patch.override_city).toBe("Dijon");
    expect(takenFrom.logo_url).toBe("d");
    // Jamais d'écrasement : la valeur du survivant reste la sienne.
    expect(patch.stat_years_experience).toBeUndefined();
  });

  it("treats '0' as missing, so a zeroed stat is recovered", () => {
    const survivor = proj("s", { stat_rge_count: "0" });
    const { patch } = buildMergePlan(survivor, [proj("d", { stat_rge_count: "3" })]);
    expect(patch.stat_rge_count).toBe("3");
  });

  it("takes the first non-empty value, duplicates being ordered best-first", () => {
    const survivor = proj("s");
    const best = proj("d1", { override_email: "bon@x.fr" });
    const other = proj("d2", { override_email: "vieux@x.fr" });
    expect(buildMergePlan(survivor, [best, other]).patch.override_email).toBe("bon@x.fr");
  });

  it("unions the service tags instead of replacing them", () => {
    const survivor = proj("s", { service_tags_snapshot: ["Climatisation"] });
    const dup = proj("d", { service_tags_snapshot: ["Climatisation", "Plomberie"] });
    expect(buildMergePlan(survivor, [dup]).patch.service_tags_snapshot).toEqual(["Climatisation", "Plomberie"]);
  });

  it("merges the variables jsonb key by key, survivor wins per key", () => {
    const survivor = proj("s", { variables: { a: "survivant", b: "" } });
    const dup = proj("d", { variables: { a: "doublon", b: "récupéré", c: "nouveau" } });
    expect(buildMergePlan(survivor, [dup]).patch.variables).toEqual({
      a: "survivant",
      b: "récupéré",
      c: "nouveau",
    });
  });

  it("produces an empty patch when there is nothing to recover", () => {
    const survivor = proj("s", { logo_url: "a.png", stat_years_experience: "12" });
    const dup = proj("d", { logo_url: "b.png" });
    expect(buildMergePlan(survivor, [dup]).patch).toEqual({});
  });

  it("never touches the identity columns", () => {
    const survivor = proj("s", { opportunite_id: "o1", entreprise_id: 1 });
    const dup = proj("d", { opportunite_id: "o2", entreprise_id: 2 });
    const { patch } = buildMergePlan(survivor, [dup]);
    expect(patch.opportunite_id).toBeUndefined();
    expect(patch.entreprise_id).toBeUndefined();
    expect(patch.id).toBeUndefined();
  });
});

describe("buildFlagsPatch", () => {
  // Une validation humaine faite depuis la carte de l'autre deal ne doit pas
  // être perdue par la fusion.
  it("lifts a validation carried by a duplicate", () => {
    const patch = buildFlagsPatch(proj("s"), [proj("d", { enrichment_validated: true, pret_pour_lm: true })]);
    expect(patch).toEqual({ enrichment_validated: true, pret_pour_lm: true });
  });

  it("never downgrades the survivor", () => {
    const survivor = proj("s", { enrichment_validated: true, pret_pour_lm: true });
    expect(buildFlagsPatch(survivor, [proj("d", { enrichment_validated: false })])).toEqual({});
  });
});
