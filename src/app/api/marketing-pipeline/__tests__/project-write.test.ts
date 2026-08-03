import { writeProjectDetails, type WriteError } from "../_project-write";

/**
 * Enregistrer une fiche ne doit jamais échouer sur un chiffre facultatif —
 * les qualifications RGE en tête, que beaucoup d'entreprises n'ont pas.
 */

const payload = () => ({
  override_city: "Annecy",
  override_city_source: "manual",
  logo_url: "https://cdn/l.png",
  stat_years_experience: "12",
  stat_satisfied_clients: "300",
  stat_installations_completed: "450",
  stat_rge_count: null as string | null,
});

/** Faux `update` : rejoue la liste d'erreurs fournie, en gardant les payloads. */
function fakeUpdate(errors: Array<WriteError | null>) {
  const seen: Array<Record<string, unknown>> = [];
  const update = async (p: Record<string, unknown>) => {
    seen.push({ ...p });
    return errors[seen.length - 1] ?? null;
  };
  return { update, seen };
}

const notNull = (column: string): WriteError => ({
  code: "23502",
  message: `null value in column "${column}" of relation "lead_magnet_projects" violates not-null constraint`,
});

describe("writeProjectDetails", () => {
  it("écrit une seule fois quand la base accepte le payload", async () => {
    const { update, seen } = fakeUpdate([null]);
    expect(await writeProjectDetails(update, payload())).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0].stat_rge_count).toBeNull();
  });

  it("réécrit les qualifications RGE en vide quand la colonne refuse NULL", async () => {
    const { update, seen } = fakeUpdate([notNull("stat_rge_count"), null]);
    expect(await writeProjectDetails(update, payload())).toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[1].stat_rge_count).toBe("");
    // Le reste de la fiche part intact au deuxième essai.
    expect(seen[1].override_city).toBe("Annecy");
  });

  it("abandonne les qualifications RGE plutôt que la fiche quand la valeur reste refusée", async () => {
    // Ex. un CHECK qui refuse aussi bien "" que NULL.
    const { update, seen } = fakeUpdate([
      notNull("stat_rge_count"),
      { code: "23514", message: 'violates check constraint "lmp_stat_rge_count_check"' },
      null,
    ]);
    expect(await writeProjectDetails(update, payload())).toBeNull();
    expect(seen).toHaveLength(3);
    expect("stat_rge_count" in seen[2]).toBe(false);
    expect(seen[2].stat_years_experience).toBe("12");
  });

  it("ne blanchit que les chiffres clés réellement vides", async () => {
    const { update, seen } = fakeUpdate([notNull("stat_rge_count"), null]);
    await writeProjectDetails(update, { ...payload(), stat_years_experience: null });
    expect(seen[1].stat_years_experience).toBe("");
    expect(seen[1].stat_satisfied_clients).toBe("300");
  });

  it("enregistre sans `override_city_source` tant que la migration n'est pas appliquée", async () => {
    const { update, seen } = fakeUpdate([
      { code: "PGRST204", message: "Could not find the 'override_city_source' column" },
      null,
    ]);
    expect(await writeProjectDetails(update, payload())).toBeNull();
    expect(seen).toHaveLength(2);
    expect("override_city_source" in seen[1]).toBe(false);
  });

  it("remonte une erreur qui n'est pas une valeur refusée, sans réessayer", async () => {
    const { update, seen } = fakeUpdate([{ code: "42501", message: "permission denied" }]);
    const error = await writeProjectDetails(update, payload());
    expect(error?.message).toBe("permission denied");
    expect(seen).toHaveLength(1);
  });

  it("remonte l'erreur quand même les replis échouent", async () => {
    const { update } = fakeUpdate([
      notNull("logo_url"),
      notNull("logo_url"),
      notNull("logo_url"),
      notNull("logo_url"),
    ]);
    const error = await writeProjectDetails(update, payload());
    expect(error?.code).toBe("23502");
  });

  it("ne modifie pas le payload du caller", async () => {
    const { update } = fakeUpdate([notNull("stat_rge_count"), null]);
    const original = payload();
    await writeProjectDetails(update, original);
    expect(original.stat_rge_count).toBeNull();
  });
});
