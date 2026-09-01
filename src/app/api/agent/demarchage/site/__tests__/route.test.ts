/**
 * @jest-environment node
 *
 * CE QU'UN HUMAIN A VU, ÉCRIT SANS SE CONTREDIRE.
 *
 * Le faux client retient les écritures table par table : c'est le seul moyen de
 * vérifier ce qui compte ici, qui n'est pas la réponse HTTP mais l'ORDRE et le
 * CONTENU des deux écritures. Trois règles y sont tenues :
 *
 *   1. le constat s'écrit AVANT la fiche — la table est append-only, elle est la
 *      trace ; la colonne, elle, s'écrase ;
 *   2. déclarer « aucun site » EFFACE l'adresse. C'est le troisième piège de
 *      `20260817_constats_presence_trois_etats` : un constat « absent » sur une
 *      fiche qui garde une URL est contredit par sa propre table, l'URL gagne, et
 *      l'agent recommencerait trois fois sans comprendre ;
 *   3. on n'écrit pas la fiche du voisin.
 */
import { __resetServiceClientForTests } from "@/app/api/_lib/service-client";

const mockAuthGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/env", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

import { POST } from "../route";

const AGENT = "66ee3ab7-0ec4-4f4c-995b-d33f58cab585";
const AUTRE = "76353de0-ac50-4645-9530-8be2db55c7a3";

type Ecriture = { table: string; op: "insert" | "update"; valeurs: Record<string, unknown> };

/** Sert la fiche demandée et retient tout ce que la route écrit, dans l'ordre. */
const brancher = (fiche: Record<string, unknown> | null) => {
  const ecritures: Ecriture[] = [];
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const resoudre = () => {
      if (table === "user_profiles") return { data: { role: "freelance" }, error: null };
      if (table === "entreprises") return { data: fiche, error: null };
      return { data: null, error: null };
    };
    for (const m of ["select", "eq", "in", "order", "limit", "is", "not", "gte"]) {
      chain[m] = () => chain;
    }
    for (const op of ["insert", "update"] as const) {
      chain[op] = (valeurs: Record<string, unknown>) => {
        ecritures.push({ table, op, valeurs });
        return chain;
      };
    }
    chain.maybeSingle = async () => resoudre();
    chain.then = (suite: (v: unknown) => unknown) => suite(resoudre());
    return chain;
  });
  return ecritures;
};

const appel = (corps: unknown) =>
  POST(
    new Request("http://localhost/api/agent/demarchage/site", {
      method: "POST",
      headers: { authorization: "Bearer jeton", "content-type": "application/json" },
      body: JSON.stringify(corps),
    }),
  );

const FICHE = { id: 42, name: "FA PLOMBERIE", ville: "Royan", site_web_canonique: null, owner_id: AGENT };

beforeEach(() => {
  __resetServiceClientForTests();
  mockFrom.mockReset();
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT, email: "codingmos@gmail.com" } }, error: null });
});

describe("POST /api/agent/demarchage/site — une adresse", () => {
  it("pose le constat AVANT d'écrire la fiche, et normalise la saisie", async () => {
    const ecritures = brancher(FICHE);
    const res = await appel({ entreprise_id: 42, url: "  Plombier-Royan.FR  " });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      etat_site: "present",
      site_web_canonique: "https://plombier-royan.fr",
    });

    expect(ecritures.map((e) => `${e.table}.${e.op}`)).toEqual([
      "constats_presence.insert",
      "entreprises.update",
      "agent_activity_events.insert",
    ]);
    expect(ecritures[0].valeurs).toMatchObject({
      entreprise_id: 42,
      sujet: "site_web",
      etat: "present",
      valeur: "https://plombier-royan.fr",
      confiance: "certaine",
      constate_par: AGENT,
    });
    expect(ecritures[1].valeurs).toEqual({ site_web_canonique: "https://plombier-royan.fr" });
  });

  /** La seule trace qui reste d'une adresse corrigée. */
  it("garde l'adresse précédente dans la preuve du constat", async () => {
    const ecritures = brancher({ ...FICHE, site_web_canonique: "https://ancienne.fr" });
    await appel({ entreprise_id: 42, url: "https://nouvelle.fr" });
    expect(ecritures[0].valeurs.preuve).toMatchObject({ url_precedente: "https://ancienne.fr" });
  });

  it("n'écrit pas la fiche quand l'adresse ne change pas — le trigger updated_at, lui, écrirait", async () => {
    const ecritures = brancher({ ...FICHE, site_web_canonique: "https://plombier-royan.fr" });
    await appel({ entreprise_id: 42, url: "https://plombier-royan.fr" });
    // Le constat, si : re-vérifier est une information, et sa date en est une
    // autre.
    expect(ecritures.filter((e) => e.table === "entreprises")).toHaveLength(0);
    expect(ecritures.filter((e) => e.table === "constats_presence")).toHaveLength(1);
  });

  it("refuse une saisie qui n'est pas une adresse", async () => {
    const ecritures = brancher(FICHE);
    const res = await appel({ entreprise_id: 42, url: "il n'en a pas" });
    expect(res.status).toBe(400);
    expect(ecritures).toHaveLength(0);
  });
});

describe("POST /api/agent/demarchage/site — aucun site", () => {
  it("pose l'absence ET efface l'adresse, sans quoi l'URL gagnerait", async () => {
    const ecritures = brancher({ ...FICHE, site_web_canonique: "https://mort.fr" });
    const res = await appel({ entreprise_id: 42, aucun_site: true });
    await expect(res.json()).resolves.toMatchObject({ etat_site: "absent", site_web_canonique: null });

    expect(ecritures[0]).toMatchObject({
      table: "constats_presence",
      valeurs: { etat: "absent", valeur: null },
    });
    // `constat_coherent` interdit une valeur sur un « absent » : la contrainte
    // est en base, la respecter ici évite un 500 par saisie.
    expect(ecritures[0].valeurs.preuve).toMatchObject({ url_precedente: "https://mort.fr" });
    expect(ecritures[1]).toMatchObject({ table: "entreprises", valeurs: { site_web_canonique: null } });
  });

  it("refuse une adresse ET « aucun site » dans le même appel", async () => {
    const ecritures = brancher(FICHE);
    const res = await appel({ entreprise_id: 42, aucun_site: true, url: "https://exemple.fr" });
    expect(res.status).toBe(400);
    expect(ecritures).toHaveLength(0);
  });

  it("refuse un appel qui ne dit ni l'un ni l'autre", async () => {
    brancher(FICHE);
    expect((await appel({ entreprise_id: 42 })).status).toBe(400);
  });
});

describe("POST /api/agent/demarchage/site — à qui on a le droit de toucher", () => {
  it("refuse la fiche d'un autre agent", async () => {
    const ecritures = brancher({ ...FICHE, owner_id: AUTRE });
    expect((await appel({ entreprise_id: 42, aucun_site: true })).status).toBe(403);
    expect(ecritures).toHaveLength(0);
  });

  /** Constater sur une fiche que personne n'a prise est du travail rendu à tous. */
  it("accepte une fiche encore dans le pool commun", async () => {
    brancher({ ...FICHE, owner_id: null });
    expect((await appel({ entreprise_id: 42, aucun_site: true })).status).toBe(200);
  });

  it("répond 404 sur une entreprise qui n'existe pas", async () => {
    brancher(null);
    expect((await appel({ entreprise_id: 42, aucun_site: true })).status).toBe(404);
  });
});
