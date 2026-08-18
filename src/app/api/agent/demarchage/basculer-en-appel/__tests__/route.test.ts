/**
 * @jest-environment node
 *
 * « JE PRÉFÈRE L'APPELER ».
 *
 * Ce que ces tests gardent : la bascule change le CANAL, et rien d'autre. Ni
 * l'inscription, ni l'étape, ni l'identifiant de la tâche — sinon l'écran
 * perdrait le prospect au rechargement et la séquence repartirait de travers.
 * Et elle REFUSE quand il n'y a pas de numéro : basculer en appel une fiche
 * qu'on ne peut pas appeler ne déplacerait pas le problème, elle le cacherait.
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

const AGENT = "76353de0-ac50-4645-9530-8be2db55c7a3";
const AUTRE = "11111111-1111-1111-1111-111111111111";

type Op = { m: string; args: unknown[] };

const brancher = (tache: Record<string, unknown> | null) => {
  const ecritures: Op[][] = [];
  mockFrom.mockImplementation((table: string) => {
    const ops: Op[] = [];
    const resoudre = () => {
      if (table === "user_profiles") return { data: { role: "freelance" }, error: null };
      if (ops.some((o) => o.m === "update")) {
        ecritures.push(ops);
        return { data: { id: "t1", kind: "call" }, error: null };
      }
      return { data: tache, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "update", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        ops.push({ m, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => resoudre();
    chain.then = (suite: (v: unknown) => unknown) => suite(resoudre());
    return chain;
  });
  return ecritures;
};

const appel = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/agent/demarchage/basculer-en-appel", {
      method: "POST",
      headers: { authorization: "Bearer jeton", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const TACHE = {
  id: "t1",
  kind: "whatsapp",
  status: "pending",
  entreprise_id: 42,
  assignee_id: null,
  payload: { message: "Bonjour", phone: "0646042876" },
  entreprise: { owner_id: AGENT, telephone: "0450000000", name: "Toiture Martin" },
};

beforeEach(() => {
  __resetServiceClientForTests();
  mockFrom.mockReset();
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
});

describe("POST /api/agent/demarchage/basculer-en-appel", () => {
  it("change le canal, et garde le reste de la charge utile", async () => {
    const ecritures = brancher(TACHE);
    const res = await appel({ task_id: "t1" });
    expect(res.status).toBe(200);

    const patch = ecritures[0].find((o) => o.m === "update")!.args[0] as Record<string, unknown>;
    expect(patch.kind).toBe("call");
    // Le texte préparé par le moteur survit : l'accroche écrite pour ce
    // prospect est très exactement ce qu'on a à lui dire de vive voix.
    expect(patch.payload).toMatchObject({ message: "Bonjour", phone: "0646042876" });
    // Ni l'inscription, ni l'étape, ni le statut ne bougent.
    expect(patch).not.toHaveProperty("enrollment_id");
    expect(patch).not.toHaveProperty("step_id");
    expect(patch).not.toHaveProperty("status");
  });

  it("retombe sur le numéro de l'entreprise quand l'étape n'en portait pas", async () => {
    const ecritures = brancher({ ...TACHE, kind: "email", payload: { message: "Bonjour" } });
    await appel({ task_id: "t1" });
    const patch = ecritures[0].find((o) => o.m === "update")!.args[0] as Record<string, unknown>;
    expect((patch.payload as Record<string, unknown>).phone).toBe("0450000000");
  });

  it("REFUSE quand aucun numéro n'est connu", async () => {
    const ecritures = brancher({
      ...TACHE,
      payload: {},
      entreprise: { owner_id: AGENT, telephone: null, name: "Toiture Martin" },
    });
    const res = await appel({ task_id: "t1" });
    expect(res.status).toBe(409);
    expect(ecritures).toHaveLength(0);
  });

  it("ne fait rien, et le dit, sur une tâche déjà en appel", async () => {
    const ecritures = brancher({ ...TACHE, kind: "call" });
    const res = await appel({ task_id: "t1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deja_en_appel: true });
    expect(ecritures).toHaveLength(0);
  });

  it("refuse une attente de réponse — rien n'en part, il n'y a pas de canal", async () => {
    brancher({ ...TACHE, kind: "wait" });
    expect((await appel({ task_id: "t1" })).status).toBe(400);
  });

  it("ne bascule pas la tâche de quelqu'un d'autre", async () => {
    const ecritures = brancher({
      ...TACHE,
      assignee_id: AUTRE,
      entreprise: { owner_id: AUTRE, telephone: "0450000000", name: "Pas la mienne" },
    });
    expect((await appel({ task_id: "t1" })).status).toBe(404);
    expect(ecritures).toHaveLength(0);
  });

  it("exige un identifiant de tâche", async () => {
    brancher(TACHE);
    expect((await appel({})).status).toBe(400);
  });
});
