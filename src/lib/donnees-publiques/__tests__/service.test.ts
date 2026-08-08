/**
 * Ce que l'hydratation doit garantir, et qu'un test doit empêcher de perdre :
 *
 *   1. elle n'écrit QUE dans ses deux tables — jamais `entreprises`, jamais
 *      `lead_magnet_projects`, donc jamais une colonne `stat_*_official` ;
 *   2. elle est idempotente ;
 *   3. une qualification qui disparaît de l'ADEME est RETIRÉE, pas oubliée ;
 *   4. `ca: 0` n'atteint jamais la base.
 *
 * Le client Supabase est simulé et ENREGISTRE chaque opération : c'est ce qui
 * permet d'affirmer la propriété (1) — une assertion sur ce qui n'a PAS été
 * écrit, impossible à formuler autrement.
 */

import { hydraterEntreprise, hydraterIdentite, hydraterRge, hydraterLot } from "../service";

type Op = { table: string; op: string; payload: unknown; filtres: Record<string, unknown> };

/**
 * Faux client Supabase : chaînable comme le vrai, et qui journalise tout.
 * Volontairement minimal — il ne réimplémente pas Postgres, il constate les
 * appels.
 */
const fakeSb = (lectures: Record<string, unknown[]> = {}) => {
  const ops: Op[] = [];

  const builder = (table: string, op: string, payload: unknown) => {
    const filtres: Record<string, unknown> = {};
    const enregistre = () => {
      if (!ops.some((o) => o.table === table && o.op === op && o.payload === payload)) {
        ops.push({ table, op, payload, filtres });
      }
    };
    enregistre();

    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "in", "is", "lt", "neq", "not", "or", "order", "limit"]) {
      chain[m] = (a?: unknown, b?: unknown) => {
        filtres[`${m}:${String(a)}`] = b ?? true;
        return chain;
      };
    }
    chain.select = () => chain;
    chain.maybeSingle = async () => ({ data: (lectures[table] ?? [])[0] ?? null, error: null });
    // Rendu « thenable » : `await sb.from(t).update(...)...` doit résoudre.
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: lectures[table] ?? [], error: null });
    return chain;
  };

  const sb = {
    from: (table: string) => ({
      upsert: (payload: unknown) => builder(table, "upsert", payload),
      insert: (payload: unknown) => builder(table, "insert", payload),
      update: (payload: unknown) => builder(table, "update", payload),
      select: (payload?: unknown) => builder(table, "select", payload),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: sb as any, ops };
};

/**
 * Réponse `recherche-entreprises` composite : le SIRET est celui, réel et
 * valide au sens de Luhn, de CHALEUR ET CONFORT ; les finances sont celles,
 * réelles aussi, de COTTAZ SARL (`ca: 0` avec un résultat à six chiffres).
 *
 * Le SIRET doit être authentique : `normalizeSiret` vérifie la clé de contrôle
 * et refuse tout numéro inventé AVANT d'appeler l'API — un fixture fabriqué de
 * tête ferait passer les tests à côté de tout le code utile.
 */
const REPONSE_IDENTITE = {
  results: [
    {
      siren: "749892840",
      nom_complet: "CHALEUR ET CONFORT",
      nom_raison_sociale: "CHALEUR ET CONFORT",
      date_creation: "2003-01-15",
      etat_administratif: "A",
      activite_principale: "43.22B",
      tranche_effectif_salarie: "02",
      siege: { siret: "74989284000028", code_postal: "62136", libelle_commune: "LESTREM", est_siege: true },
      finances: { "2024": { ca: 0, resultat_net: 140998 } },
      complements: { est_rge: true },
    },
  ],
};

const REPONSE_RGE = (codes: string[]) => ({
  results: codes.map((c) => ({
    siret: "74989284000028",
    code_qualification: c,
    nom_certificat: "QualiPAC module Chauffage et ECS",
    lien_date_debut: "2023-05-09",
    lien_date_fin: "2027-05-09",
    email: "Contact@Exemple.fr",
    telephone: "03 21 26 81 30",
    site_internet: "http://exemple.fr",
    nom_entreprise: "EXEMPLE",
  })),
});

const fetchQui = (parUrl: (url: string) => unknown): typeof fetch =>
  (async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => parUrl(String(url)),
  })) as unknown as typeof fetch;

const CIBLE = { entreprise_id: 42, siret: "74989284000028" };

describe("hydraterIdentite", () => {
  it("n'écrit jamais ca: 0 en base — il devient null", async () => {
    const { sb, ops } = fakeSb();
    await hydraterIdentite(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_IDENTITE) });

    const upsert = ops.find((o) => o.table === "entreprises_donnees_publiques" && o.op === "upsert");
    const payload = upsert!.payload as Record<string, unknown>;
    expect(payload.chiffre_affaires).toBeNull();
    expect(payload.resultat_net).toBe(140998);
    expect(payload.exercice_annee).toBe(2024);
  });

  it("stocke la tranche d'effectif comme code", async () => {
    const { sb, ops } = fakeSb();
    await hydraterIdentite(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_IDENTITE) });
    const payload = ops.find((o) => o.op === "upsert")!.payload as Record<string, unknown>;
    expect(payload.tranche_effectif_code).toBe("02");
  });

  it("refuse un SIRET invalide sans appeler l'API", async () => {
    const { sb, ops } = fakeSb();
    const appels: string[] = [];
    const r = await hydraterIdentite(
      sb,
      { entreprise_id: 42, siret: "123" },
      { fetchImpl: fetchQui((u) => { appels.push(u); return REPONSE_IDENTITE; }) },
    );
    expect(r.statut).toBe("erreur");
    expect(r.message).toBe("siret_invalide");
    expect(appels).toHaveLength(0);
    expect(ops).toHaveLength(0);
  });

  it("mémorise l'échec réseau dans la ligne, sans planter", async () => {
    const { sb, ops } = fakeSb();
    const rate = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await hydraterIdentite(sb, CIBLE, { fetchImpl: rate });
    expect(r.statut).toBe("erreur");
    const payload = ops.find((o) => o.op === "upsert")!.payload as Record<string, unknown>;
    expect(String(payload.identite_erreur)).toMatch(/503/);
  });
});

describe("hydraterRge", () => {
  it("retire les qualifications qui ont disparu de l'ADEME", async () => {
    const { sb, ops } = fakeSb({
      // Le `.select("id")` du retrait rend une ligne : une qualification a été
      // retirée à ce passage.
      entreprise_rge_qualifications: [{ id: "abc" }],
    });
    const r = await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_RGE(["43"])) });

    const retrait = ops.find(
      (o) => o.table === "entreprise_rge_qualifications" && o.op === "update",
    );
    // La qualification perdue est MARQUÉE, jamais supprimée : l'historique est
    // un renseignement commercial.
    expect(retrait).toBeDefined();
    expect((retrait!.payload as Record<string, unknown>).retiree_le).toBeTruthy();
    expect(ops.some((o) => o.op === "delete")).toBe(false);
    expect(r.retirees).toBe(1);
  });

  it("relève une qualification qui réapparaît", async () => {
    const { sb, ops } = fakeSb();
    await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_RGE(["43"])) });
    const upsert = ops.find((o) => o.table === "entreprise_rge_qualifications" && o.op === "upsert");
    const lignes = upsert!.payload as Array<Record<string, unknown>>;
    expect(lignes[0].retiree_le).toBeNull();
  });

  it("interroge l'ADEME avec le joker SIREN, pour couvrir les établissements secondaires", async () => {
    const { sb } = fakeSb();
    const urls: string[] = [];
    await hydraterRge(sb, CIBLE, {
      fetchImpl: fetchQui((u) => { urls.push(u); return REPONSE_RGE(["43"]); }),
    });
    // `qs=siret:749892840*` et non `siret:"74989284000028"` : une entreprise
    // multi-sites peut être qualifiée ailleurs qu'à son siège.
    expect(decodeURIComponent(urls[0])).toContain("siret:749892840*");
  });

  it("traite « aucune qualification » comme un fait, pas comme une erreur", async () => {
    const { sb } = fakeSb();
    // Cas ECLEIS : l'ADEME rend 0 ligne alors que le site affiche des logos.
    const r = await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => ({ results: [] })) });
    expect(r.statut).toBe("vide");
    expect(r.ajoutees).toBe(0);
  });
});

describe("cloisonnement des écritures", () => {
  it("n'écrit QUE dans ses deux tables, plus son journal", async () => {
    const { sb, ops } = fakeSb();
    await hydraterEntreprise(sb, CIBLE, {
      fetchImpl: fetchQui((u) =>
        u.includes("ademe") ? REPONSE_RGE(["43", "41"]) : REPONSE_IDENTITE,
      ),
    });

    const ecrites = new Set(
      ops.filter((o) => ["upsert", "insert", "update"].includes(o.op)).map((o) => o.table),
    );

    // La garantie centrale du socle : le saisi humain et les colonnes
    // `stat_*_official` sont hors d'atteinte, structurellement.
    expect(ecrites).not.toContain("entreprises");
    expect(ecrites).not.toContain("lead_magnet_projects");
    expect(ecrites).not.toContain("contacts");
    expect([...ecrites].sort()).toEqual([
      "donnees_publiques_runs",
      "entreprise_contacts_ademe",
      "entreprise_rge_qualifications",
      "entreprises_donnees_publiques",
    ]);
  });

  it("journalise même une fiche sans SIRET, au lieu de l'ignorer en silence", async () => {
    const { sb, ops } = fakeSb();
    const r = await hydraterEntreprise(sb, { entreprise_id: 7, siret: null });
    expect(r.identite).toBe("ignore");
    const journal = ops.find((o) => o.table === "donnees_publiques_runs");
    expect((journal!.payload as Record<string, unknown>).motif).toBe("pas_de_siret");
  });
});

describe("hydraterLot", () => {
  it("rend la main quand le budget est épuisé, en disant ce qui reste", async () => {
    const { sb } = fakeSb();
    const cibles = Array.from({ length: 5 }, (_, i) => ({
      entreprise_id: i + 1,
      siret: "74989284000028",
    }));
    const lent = (async () => {
      await new Promise((r) => setTimeout(r, 12));
      return { ok: true, status: 200, json: async () => REPONSE_IDENTITE };
    }) as unknown as typeof fetch;

    const { traitees, reste } = await hydraterLot(sb, cibles, { fetchImpl: lent, budgetMs: 20 });
    // Un résultat partiel + un reste chiffré vaut mieux qu'une 504 muette.
    expect(traitees.length).toBeGreaterThan(0);
    expect(traitees.length + reste).toBe(5);
  });

  it("respecte les cadences : rien à faire quand rien n'est dû", async () => {
    const { sb, ops } = fakeSb();
    await hydraterLot(sb, [{ ...CIBLE, identite_due: false, rge_due: false }], {
      fetchImpl: fetchQui(() => REPONSE_IDENTITE),
    });
    expect(ops.some((o) => o.table === "entreprises_donnees_publiques")).toBe(false);
  });

  it("force les deux sources quand un humain clique", async () => {
    const { sb, ops } = fakeSb();
    await hydraterLot(sb, [{ ...CIBLE, identite_due: false, rge_due: false }], {
      forcer: true,
      declencheur: "bouton",
      fetchImpl: fetchQui((u) => (u.includes("ademe") ? REPONSE_RGE(["43"]) : REPONSE_IDENTITE)),
    });
    expect(ops.some((o) => o.table === "entreprises_donnees_publiques")).toBe(true);
    expect(ops.some((o) => o.table === "entreprise_rge_qualifications")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coordonnées ADEME
// ---------------------------------------------------------------------------
describe("contacts ADEME", () => {
  it("stocke l'email déclaré au certificateur, en minuscules", async () => {
    const { sb, ops } = fakeSb();
    await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_RGE(["43"])) });
    const up = ops.find((o) => o.table === "entreprise_contacts_ademe");
    const lignes = up!.payload as Array<Record<string, unknown>>;
    expect(lignes[0].email).toBe("contact@exemple.fr");
    expect(lignes[0].telephone).toBe("03 21 26 81 30");
  });

  it("ne crée qu'une ligne quand six qualifications répètent la même adresse", async () => {
    // Les coordonnées figurent sur CHAQUE ligne de qualification : sans
    // déduplication, une entreprise à six qualifications rendrait six fois la
    // même adresse.
    const { sb, ops } = fakeSb();
    await hydraterRge(sb, CIBLE, {
      fetchImpl: fetchQui(() => REPONSE_RGE(["32", "43", "41", "21", "11", "12"])),
    });
    const up = ops.find((o) => o.table === "entreprise_contacts_ademe");
    expect((up!.payload as unknown[]).length).toBe(1);
  });

  it("n'écrit RIEN dans entreprises ni contacts — le tri est le travail d'un agent", async () => {
    const { sb, ops } = fakeSb();
    await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => REPONSE_RGE(["43"])) });
    const ecrites = new Set(
      ops.filter((o) => ["upsert", "insert", "update"].includes(o.op)).map((o) => o.table),
    );
    expect(ecrites).not.toContain("contacts");
    expect(ecrites).not.toContain("entreprises");
  });

  it("ne stocke rien quand l'ADEME ne rend aucune coordonnée", async () => {
    const { sb, ops } = fakeSb();
    await hydraterRge(sb, CIBLE, { fetchImpl: fetchQui(() => ({ results: [] })) });
    expect(ops.some((o) => o.table === "entreprise_contacts_ademe")).toBe(false);
  });
});
