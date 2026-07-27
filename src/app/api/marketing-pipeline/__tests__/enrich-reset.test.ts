import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEnrichReset,
  enrichResetPayload,
  OVERWRITE_CLEARED_COLUMNS,
  stripSurroundingCities,
} from "../_enrich-reset";

const NOW = "2026-07-27T10:00:00.000Z";

describe("enrichResetPayload", () => {
  it("repasse un projet déjà enrichi à draft, sinon l'edge function l'ignore", () => {
    // `shouldProcess` refuse framer/ready/published : sans ce reset, le run
    // répond `already_framer` et rien ne se passe.
    for (const statut of ["framer", "ready", "published"]) {
      expect(enrichResetPayload({ statut, overwrite: false, now: NOW })).toMatchObject({
        statut: "draft",
        pret_pour_lm: true,
      });
    }
  });

  it("ne touche pas au statut d'un projet qui n'a pas besoin d'être réinitialisé", () => {
    // Un run en cours (`processing`) ou jamais lancé (`draft`) ne doit pas être
    // piétiné par une simple préparation.
    expect(enrichResetPayload({ statut: "processing", overwrite: false, now: NOW })).not.toHaveProperty("statut");
    expect(enrichResetPayload({ statut: "draft", overwrite: false, now: NOW })).not.toHaveProperty("statut");
    expect(enrichResetPayload({ statut: null, overwrite: false, now: NOW })).not.toHaveProperty("statut");
  });

  it("vide les colonnes de l'enrichissement quand on écrase", () => {
    const payload = enrichResetPayload({ statut: "framer", overwrite: true, now: NOW });
    for (const key of Object.keys(OVERWRITE_CLEARED_COLUMNS)) {
      expect(payload).toHaveProperty(key);
    }
    // La ville SEO repart de zéro, provenance comprise.
    expect(payload.override_city).toBeNull();
    expect(payload.override_location).toBeNull();
    expect(payload.override_city_source).toBeNull();
    expect(payload.statut).toBe("draft");
  });

  it("écrase même un statut qui n'était pas terminal", () => {
    expect(enrichResetPayload({ statut: "draft", overwrite: true, now: NOW }).statut).toBe("draft");
  });

  it("retire les villes autour des variables sans perdre le reste", () => {
    const payload = enrichResetPayload({
      statut: "framer",
      variables: { surrounding_cities: ["Annecy"], surrounding_cities_text: "Annecy", theme: "bleu" },
      overwrite: true,
      now: NOW,
    });
    expect(payload.variables).toEqual({ theme: "bleu" });
  });

  it("laisse les variables intactes sans écrasement", () => {
    const payload = enrichResetPayload({
      statut: "framer",
      variables: { surrounding_cities: ["Annecy"] },
      overwrite: false,
      now: NOW,
    });
    expect(payload).not.toHaveProperty("variables");
  });
});

describe("stripSurroundingCities", () => {
  it("tolère l'absence de variables", () => {
    expect(stripSurroundingCities(null)).toEqual({});
    expect(stripSurroundingCities(undefined)).toEqual({});
  });

  it("ne mute pas l'objet d'origine", () => {
    const original = { surrounding_cities: ["Annecy"], theme: "bleu" };
    expect(stripSurroundingCities(original)).toEqual({ theme: "bleu" });
    expect(original).toHaveProperty("surrounding_cities");
  });
});

/** Client minimal : enregistre les payloads reçus et rejoue les erreurs voulues. */
function fakeClient(errors: Array<{ code?: string; message?: string } | null>) {
  const payloads: Array<Record<string, unknown>> = [];
  let call = 0;
  const client = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        payloads.push(payload);
        return { eq: async () => ({ error: errors[call++] ?? null }) };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, payloads };
}

describe("applyEnrichReset", () => {
  it("réécrit sans override_city_source quand la colonne manque", async () => {
    // La migration 20260727 s'applique à la main : une base en retard ne doit pas
    // faire échouer toute la remise à zéro pour une colonne de traçabilité.
    const { client, payloads } = fakeClient([{ code: "42703", message: 'column "override_city_source" does not exist' }, null]);

    const error = await applyEnrichReset(client, "p1", enrichResetPayload({ statut: "framer", overwrite: true, now: NOW }));

    expect(error).toBeNull();
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("override_city_source");
    expect(payloads[1]).not.toHaveProperty("override_city_source");
    // Le reste du reset est bien conservé au second essai.
    expect(payloads[1]).toMatchObject({ statut: "draft", override_city: null });
  });

  it("remonte une vraie erreur sans réessayer", async () => {
    const { client, payloads } = fakeClient([{ code: "23505", message: "conflit" }]);
    await expect(applyEnrichReset(client, "p1", enrichResetPayload({ statut: "framer", overwrite: true, now: NOW }))).resolves.toBe(
      "conflit",
    );
    expect(payloads).toHaveLength(1);
  });

  it("ne réessaie pas quand le payload ne porte pas la colonne en cause", async () => {
    const { client, payloads } = fakeClient([{ code: "42703", message: "column does not exist" }]);
    // Sans `overwrite`, `override_city_source` n'est pas écrit : l'erreur vient
    // d'ailleurs et doit remonter telle quelle.
    await expect(applyEnrichReset(client, "p1", enrichResetPayload({ statut: "framer", overwrite: false, now: NOW }))).resolves.toBe(
      "column does not exist",
    );
    expect(payloads).toHaveLength(1);
  });

  it("ne fait qu'une écriture quand tout va bien", async () => {
    const { client, payloads } = fakeClient([null]);
    await expect(applyEnrichReset(client, "p1", enrichResetPayload({ statut: "framer", overwrite: true, now: NOW }))).resolves.toBeNull();
    expect(payloads).toHaveLength(1);
  });
});
