import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodeCitiesFromCommunes } from "../city-geo";

// Faux client Supabase : renvoie les lignes `communes_fr` fournies, en
// filtrant sur la liste demandée comme le ferait `.in()`.
const fakeSb = (rows: Array<Record<string, unknown>>, opts: { throws?: boolean } = {}) =>
  ({
    from: () => ({
      select: () => ({
        in: async (_col: string, vals: string[]) => {
          if (opts.throws) throw new Error("relation \"communes_fr\" does not exist");
          return { data: rows.filter((r) => vals.includes(r.nom as string)), error: null };
        },
      }),
    }),
  }) as unknown as SupabaseClient;

const BLANZY = { nom: "Blanzy", lat: 46.7028, lon: 4.3907, codes_postaux: ["71450"], population: 5955 };

describe("geocodeCitiesFromCommunes", () => {
  it("place une petite commune que la table statique ne connaît pas", async () => {
    // Le vrai cas qui cassait le globe : une visite depuis une commune de
    // 6 000 habitants n'apparaissait nulle part faute de coordonnées.
    const out = await geocodeCitiesFromCommunes(fakeSb([BLANZY]), ["Blanzy"]);
    expect(out.get("Blanzy")).toEqual({ lat: 46.7028, lon: 4.3907, region: "Bourgogne-Franche-Comté" });
  });

  it("tranche les homonymes en retenant la commune la plus peuplée", async () => {
    const out = await geocodeCitiesFromCommunes(
      fakeSb([
        { nom: "Sainte-Marie", lat: 1, lon: 1, codes_postaux: ["08240"], population: 120 },
        { nom: "Sainte-Marie", lat: 2, lon: 2, codes_postaux: ["66470"], population: 4300 },
      ]),
      ["Sainte-Marie"],
    );
    expect(out.get("Sainte-Marie")).toMatchObject({ lat: 2, lon: 2 });
  });

  it("retombe sur la table statique pour une ville étrangère", async () => {
    const out = await geocodeCitiesFromCommunes(fakeSb([]), ["Bruxelles"]);
    expect(out.get("Bruxelles")).toMatchObject({ region: "Belgique" });
  });

  it("ignore les villes inconnues plutôt que d'inventer des coordonnées", async () => {
    const out = await geocodeCitiesFromCommunes(fakeSb([]), ["Ville-Qui-N-Existe-Pas"]);
    expect(out.has("Ville-Qui-N-Existe-Pas")).toBe(false);
  });

  it("ignore la ville vide que GA4 renvoie quand il ne sait pas", async () => {
    const out = await geocodeCitiesFromCommunes(fakeSb([BLANZY]), ["", "Inconnue"]);
    expect(out.size).toBe(0);
  });

  it("reste utilisable si la table communes_fr n'existe pas encore", async () => {
    // Migration non appliquée : on doit dégrader vers la table statique, pas
    // faire tomber toute la page analytics.
    const out = await geocodeCitiesFromCommunes(fakeSb([], { throws: true }), ["Blanzy", "Bruxelles"]);
    expect(out.has("Blanzy")).toBe(false);
    expect(out.get("Bruxelles")).toMatchObject({ region: "Belgique" });
  });

  it("ne géocode pas une commune sans coordonnées", async () => {
    const out = await geocodeCitiesFromCommunes(
      fakeSb([{ nom: "Sansgeo", lat: null, lon: null, codes_postaux: ["12345"], population: 900 }]),
      ["Sansgeo"],
    );
    expect(out.has("Sansgeo")).toBe(false);
  });
});
