import {
  buildDealMergePlan,
  duplicateGroups,
  isBlank,
  isRealDeal,
  pickSurvivor,
  type DealRecord,
} from "./one-per-company";

const deal = (o: Partial<DealRecord> & { id: string }): DealRecord => ({
  entreprise_id: 1,
  owner_id: null,
  pipeline_id: "p-streak",
  stage_id: null,
  created_at: null,
  updated_at: null,
  is_test: false,
  ...o,
});

describe("pickSurvivor", () => {
  // La plus ancienne porte l'historique : montant négocié, notes, audits.
  // La récente est la coquille ouverte par l'attribution du 3 août.
  it("garde la plus ancienne", () => {
    const survivor = pickSurvivor([
      deal({ id: "agent-sama", created_at: "2026-08-03T09:54:31Z" }),
      deal({ id: "streak", created_at: "2026-03-06T01:07:30Z" }),
    ]);

    expect(survivor?.id).toBe("streak");
  });

  it("départage par id à date égale, pour rester déterministe", () => {
    const at = "2026-03-06T01:07:30Z";
    expect(pickSurvivor([deal({ id: "b", created_at: at }), deal({ id: "a", created_at: at })])?.id).toBe("a");
  });

  it("ignore les affaires de test", () => {
    const survivor = pickSurvivor([
      deal({ id: "test", created_at: "2026-01-01T00:00:00Z", is_test: true }),
      deal({ id: "vraie", created_at: "2026-03-01T00:00:00Z" }),
    ]);

    expect(survivor?.id).toBe("vraie");
  });

  it("renvoie null quand il n'y a que des affaires de test", () => {
    expect(pickSurvivor([deal({ id: "test", is_test: true })])).toBeNull();
  });
});

describe("isRealDeal", () => {
  it("accepte une affaire dont is_test est absent ou null", () => {
    expect(isRealDeal(deal({ id: "a", is_test: null }))).toBe(true);
    expect(isRealDeal({ id: "b" })).toBe(true);
    expect(isRealDeal(deal({ id: "c", is_test: true }))).toBe(false);
  });
});

describe("isBlank", () => {
  // Un montant à 0 € est une information, pas un champ vide — contrairement à
  // la chaîne "0", qui est le marqueur de stat vide utilisé ailleurs.
  it("traite 0 numérique comme une valeur pleine", () => {
    expect(isBlank(0)).toBe(false);
    expect(isBlank("0")).toBe(true);
  });

  it("traite null, chaîne vide, tableau et objet vides comme vides", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank({})).toBe(true);
  });
});

describe("buildDealMergePlan", () => {
  // La fusion est complémentaire : le survivant garde tout ce qu'il a.
  it("ne remplit que les trous du survivant", () => {
    const plan = buildDealMergePlan(
      deal({ id: "s", montant: 4200, note_base: null }),
      [deal({ id: "d", montant: 2500, note_base: "Rappelé le 12" })],
    );

    expect(plan.patch).toEqual({ note_base: "Rappelé le 12" });
    expect(plan.takenFrom).toEqual({ note_base: "d" });
  });

  it("ne touche jamais au pipeline ni à l'étape du survivant", () => {
    const plan = buildDealMergePlan(deal({ id: "s", pipeline_id: "p-streak", stage_id: 42 }), [
      deal({ id: "d", pipeline_id: "p-agent", stage_id: 77 }),
    ]);

    expect(plan.patch).not.toHaveProperty("pipeline_id");
    expect(plan.patch).not.toHaveProperty("stage_id");
    expect(plan.patch).not.toHaveProperty("owner_id");
  });

  it("fait l'union des tags et des flags", () => {
    const plan = buildDealMergePlan(deal({ id: "s", tags: ["clim"] }), [
      deal({ id: "d", tags: ["clim", "pac"] }),
    ]);

    expect(plan.patch.tags).toEqual(["clim", "pac"]);
  });

  it("ne rétrograde pas le drapeau lead_magnet", () => {
    expect(buildDealMergePlan(deal({ id: "s", lead_magnet: false }), [
      deal({ id: "d", lead_magnet: true }),
    ]).patch.lead_magnet).toBe(true);

    expect(buildDealMergePlan(deal({ id: "s", lead_magnet: true }), [
      deal({ id: "d", lead_magnet: false }),
    ]).patch).not.toHaveProperty("lead_magnet");
  });

  it("prend la première valeur non vide en parcourant les doublons dans l'ordre", () => {
    const plan = buildDealMergePlan(deal({ id: "s", priorite: null }), [
      deal({ id: "d1", priorite: null }),
      deal({ id: "d2", priorite: "haute" }),
      deal({ id: "d3", priorite: "basse" }),
    ]);

    expect(plan.patch.priorite).toBe("haute");
    expect(plan.takenFrom.priorite).toBe("d2");
  });
});

describe("duplicateGroups", () => {
  it("ne retient que les entreprises à plus d'une affaire réelle", () => {
    const groups = duplicateGroups([
      deal({ id: "a1", entreprise_id: 1 }),
      deal({ id: "a2", entreprise_id: 1 }),
      deal({ id: "b1", entreprise_id: 2 }),
      deal({ id: "c1", entreprise_id: 3 }),
      deal({ id: "c2", entreprise_id: 3, is_test: true }),
    ]);

    expect([...groups.keys()]).toEqual([1]);
    expect(groups.get(1)?.map((d) => d.id)).toEqual(["a1", "a2"]);
  });

  it("ignore les affaires sans entreprise", () => {
    expect(duplicateGroups([deal({ id: "a", entreprise_id: null }), deal({ id: "b", entreprise_id: null })]).size).toBe(0);
  });
});
