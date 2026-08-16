/**
 * @jest-environment node
 *
 * La route de lot des plaquettes.
 *
 * CE QUE CE FICHIER GARDE, et les trois pannes correspondantes :
 *
 *   · LA GARDE DE PROPRIÉTÉ. Un agent ne prépare de lien que pour SES
 *     entreprises. Sans ce test, un filtre `owner_id` retiré par mégarde ne se
 *     verrait qu'au moment où un agent fabrique des liens pour le parc d'un
 *     autre — c'est-à-dire jamais, jusqu'à ce que quelqu'un les envoie.
 *   · L'IDEMPOTENCE, RENDUE VISIBLE. Rejouer un lot déjà préparé doit répondre
 *     « déjà prêtes », pas « créées » : les liens sont déjà partis par WhatsApp,
 *     et un second jeton les tuerait. Le compte est ce qui prouve à l'agent que
 *     rien n'a bougé.
 *   · LES ÉCHECS NOMMÉS, JAMAIS EN BLOC. Une ligne non attribuée ou disparue ne
 *     doit pas emporter les 299 autres. C'est la leçon du 12/08, où un lot
 *     s'appliquait ou échouait tout entier.
 */
import { __resetServiceClientForTests } from "@/app/api/_lib/service-client";

const mockAuthGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockInsert = jest.fn();

jest.mock("@/env", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

import { POST } from "../route";

const AGENT = "76353de0-ac50-4645-9530-8be2db55c7a3";

type Entreprise = { id: number; name: string | null; owner_id: string };

/**
 * Le parc, servi par un faux client qui applique RÉELLEMENT le `.eq("owner_id")`
 * de la route : une réponse figée passerait aussi bien avec la garde qu'après
 * l'avoir retirée.
 */
const brancher = (parc: Entreprise[]) => {
  mockFrom.mockImplementation((table: string) => {
    const ops: Array<{ m: string; args: unknown[] }> = [];
    const resoudre = () => {
      if (table === "user_profiles") return { data: { role: "freelance" }, error: null };
      if (table === "agent_settings") {
        return { data: { can_use_marketing_pipeline: true }, error: null };
      }
      if (table === "entreprises") {
        const ids = (ops.find((o) => o.m === "in")?.args[1] ?? []) as number[];
        const proprio = ops.find((o) => o.m === "eq" && o.args[0] === "owner_id")?.args[1];
        return {
          data: parc.filter((e) => ids.includes(e.id) && (proprio === undefined || e.owner_id === proprio)),
          error: null,
        };
      }
      if (table === "agent_activity_events") return { data: null, error: null };
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        ops.push({ m, args });
        return chain;
      };
    }
    chain.insert = (...args: unknown[]) => {
      mockInsert(table, ...args);
      return Promise.resolve({ data: null, error: null });
    };
    chain.maybeSingle = async () => resoudre();
    chain.then = (suite: (v: unknown) => unknown) => suite(resoudre());
    return chain;
  });
};

const appel = (ids: number[]) =>
  POST(
    new Request("http://localhost/api/agent/marketing-pipeline/plaquette", {
      method: "POST",
      headers: { authorization: "Bearer jeton", "Content-Type": "application/json" },
      body: JSON.stringify({ entreprise_ids: ids }),
    }),
  );

type Reponse = {
  creees?: number;
  deja?: number;
  liens?: Array<{ entreprise_id: number; nom: string | null; url: string; deja: boolean }>;
  echecs?: Array<{ entreprise_id: number; nom: string | null; motif: string }>;
  error?: string;
};

const lire = async (res: Response) => (await res.json()) as Reponse;

/** La réponse de la fonction SQL pour un lot entièrement neuf. */
const toutesNeuves = (ids: number[]) =>
  ids.map((id) => ({ entreprise_id: id, jeton: `${id}`.padStart(32, "a"), deja_prete: false }));

const PARC: Entreprise[] = [
  { id: 1, name: "Couverture Milani", owner_id: AGENT },
  { id: 2, name: "Menuiserie Berthier", owner_id: AGENT },
  { id: 3, name: "Plomberie d'un autre agent", owner_id: "un-autre-agent" },
];

beforeEach(() => {
  __resetServiceClientForTests();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockInsert.mockReset();
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
});

describe("POST /api/agent/marketing-pipeline/plaquette — la garde de propriété", () => {
  it("ne prépare de lien que pour les entreprises de l'agent", async () => {
    brancher(PARC);
    mockRpc.mockResolvedValue({ data: toutesNeuves([1, 2]), error: null });

    const body = await lire(await appel([1, 2, 3]));

    // L'entreprise 3 n'atteint même pas la fonction SQL.
    expect(mockRpc).toHaveBeenCalledWith("assurer_jetons_plaquette", {
      p_entreprise_ids: [1, 2],
      p_cree_par: AGENT,
    });
    expect(body.creees).toBe(2);
    expect(body.echecs).toEqual([
      { entreprise_id: 3, nom: null, motif: "entreprise non attribuée" },
    ]);
  });

  it("ne divulgue pas le nom d'une entreprise qui n'est pas la sienne", async () => {
    // Le motif suffit à l'agent ; le nom, lui, appartient au parc d'un autre.
    brancher(PARC);
    mockRpc.mockResolvedValue({ data: toutesNeuves([1]), error: null });
    const body = await lire(await appel([1, 3]));
    expect(body.echecs?.[0].nom).toBeNull();
  });

  it("refuse le lot quand rien n'est attribué à l'agent", async () => {
    brancher(PARC);
    const res = await appel([3]);
    expect(res.status).toBe(403);
    expect((await lire(res)).error).toBe("entreprise_non_attribuee");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("l'idempotence, et ce qu'elle doit dire", () => {
  it("rejoué sur une sélection déjà préparée, ne crée rien et le dit", async () => {
    brancher(PARC);
    mockRpc.mockResolvedValue({
      data: [
        { entreprise_id: 1, jeton: "a".repeat(32), deja_prete: true },
        { entreprise_id: 2, jeton: "b".repeat(32), deja_prete: true },
      ],
      error: null,
    });

    const body = await lire(await appel([1, 2]));

    expect(body.creees).toBe(0);
    expect(body.deja).toBe(2);
    expect(body.liens).toHaveLength(2);
    expect(body.liens?.every((l) => l.deja)).toBe(true);
  });

  it("ne journalise QUE les créations", async () => {
    // Un événement par reclic ferait croire, en relisant l'historique, qu'on a
    // préparé la cohorte quatre fois.
    brancher(PARC);
    mockRpc.mockResolvedValue({
      data: [
        { entreprise_id: 1, jeton: "a".repeat(32), deja_prete: false },
        { entreprise_id: 2, jeton: "b".repeat(32), deja_prete: true },
      ],
      error: null,
    });

    await appel([1, 2]);

    const journal = mockInsert.mock.calls.filter(([table]) => table === "agent_activity_events");
    expect(journal).toHaveLength(1);
    expect(journal[0][1]).toMatchObject({ entreprise_id: 1, action: "create_plaquette" });
  });

  it("ne compte qu'une fois une entreprise cochée deux fois", async () => {
    // Une même entreprise peut apparaître sur plusieurs lignes du board : sans
    // dédoublonnage, le total annoncé dépasse le nombre de liens fabriqués.
    brancher(PARC);
    mockRpc.mockResolvedValue({ data: toutesNeuves([1]), error: null });
    const body = await lire(await appel([1, 1, 1]));
    expect(mockRpc.mock.calls[0][1]).toEqual({ p_entreprise_ids: [1], p_cree_par: AGENT });
    expect(body.creees).toBe(1);
  });
});

describe("les échecs sont nommés, jamais en bloc", () => {
  it("signale l'entreprise disparue et prépare quand même les autres", async () => {
    brancher(PARC);
    // La fonction SQL joint sur `entreprises` : l'entreprise 2, supprimée entre
    // l'affichage du board et le clic, manque simplement du résultat.
    mockRpc.mockResolvedValue({ data: toutesNeuves([1]), error: null });

    const body = await lire(await appel([1, 2]));

    expect(body.creees).toBe(1);
    expect(body.echecs).toEqual([
      { entreprise_id: 2, nom: "Menuiserie Berthier", motif: "entreprise introuvable" },
    ]);
  });

  it("rend un lien par entreprise, avec son nom et son URL", async () => {
    brancher(PARC);
    mockRpc.mockResolvedValue({ data: toutesNeuves([1]), error: null });
    const body = await lire(await appel([1]));
    expect(body.liens?.[0].nom).toBe("Couverture Milani");
    expect(body.liens?.[0].url).toMatch(/\/plaquette\/a+1$/);
  });
});

describe("la migration non jouée se distingue d'une panne", () => {
  it("répond 503 en nommant le fichier à appliquer", async () => {
    // Un « erreur 500 » enverrait chercher un bug dans le code, là où il n'y en
    // a pas : il manque un fichier SQL, et le message doit dire lequel.
    brancher(PARC);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    const res = await appel([1]);
    expect(res.status).toBe(503);
    expect((await lire(res)).error).toContain("20260816_plaquettes_par_prospect.sql");
  });

  it("laisse une vraie panne remonter en 500", async () => {
    brancher(PARC);
    mockRpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    const res = await appel([1]);
    expect(res.status).toBe(500);
  });
});
