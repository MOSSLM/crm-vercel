/**
 * @jest-environment node
 *
 * CONSIGNER UN ÉCHANGE HORS FILE — ce que ces tests empêchent de reperdre.
 *
 * Trois pièges, et aucun ne se voit à l'exécution :
 *
 *   1. `answered` NE POSE PAS `replied`. C'est l'en-tête de `reply.ts` :
 *      « oui c'est bien nous » est l'autorisation d'envoyer la suite, pas de
 *      l'intérêt pour l'offre. `hasInterest()` se sert de `replied` pour
 *      éteindre les cellules WhatsApp et Appel — le poser ici couperait
 *      exactement les étapes qu'on veut enchaîner, et rien ne le signalerait.
 *   2. SANS ISSUE, LA SÉQUENCE NE BOUGE PAS. Consigner est un geste de mémoire,
 *      pas d'avancement : faire sauter une étape parce que quelqu'un a dit un
 *      mot enverrait des messages que personne n'a décidés.
 *   3. UNE PIÈCE SANS LIEN N'EST PAS JOURNALISÉE. Écrire « démo envoyée » sans
 *      démo publiée ferait croire à un envoi qui n'a pas pu avoir lieu — et
 *      c'est précisément l'inverse du problème que cette route corrige.
 */
import { __resetServiceClientForTests } from "@/app/api/_lib/service-client";

const mockAuthGetUser = jest.fn();
const mockFrom = jest.fn();
const mockSortir = jest.fn();
const mockLiens = jest.fn();
const mockResolveStage = jest.fn();

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

jest.mock("@/lib/automations/engine", () => ({
  sortirDeSequence: (...args: unknown[]) => mockSortir(...args),
}));

// Le module réel tire tout le moteur de rendu de la plaquette. On garde son
// vocabulaire (`PIECES`, `ligneDePiece`) et on ne simule que l'accès base.
jest.mock("@/lib/prospection/hors-scenario", () => ({
  PIECES: ["demo", "plaquette", "audit"],
  ligneDePiece: (piece: string, url: string) => `${piece} : ${url}`,
  liensDesPieces: (...args: unknown[]) => mockLiens(...args),
}));

jest.mock("@/app/api/agent/_lib", () => ({
  resolveStageForRole: (...args: unknown[]) => mockResolveStage(...args),
}));

jest.mock("@/app/api/agent/qualification/_lib", () => ({
  logAgentAction: jest.fn(async () => {}),
}));

import { POST } from "../route";

const AGENT = "76353de0-ac50-4645-9530-8be2db55c7a3";
const AUTRE = "11111111-1111-1111-1111-111111111111";
const ENTREPRISE = 1679;
const INSCRIPTION = "44fd9f11-d9d0-4386-bbe9-2f8adf860fc4";
const AFFAIRE = "5e2eea5f-c138-4aa0-b145-0f5dd521fa1f";

type Op = { table: string; m: string; args: unknown[] };

/**
 * Une base minimale mais fidèle : chaque appel est enregistré avec sa table,
 * et la valeur rendue dépend de la table plutôt que de l'ordre des appels —
 * l'ordre est un détail d'implémentation, la table est le contrat.
 */
const brancher = (opts: { ownerId?: string; inscription?: Record<string, unknown> | null } = {}) => {
  const ops: Op[] = [];
  const owner = opts.ownerId ?? AGENT;
  const inscription =
    opts.inscription === undefined
      ? {
          id: INSCRIPTION,
          automation_id: "0e7a1f30-0000-4000-8000-000000000002",
          current_step: 1,
          next_run_at: "2026-09-03T08:50:54.417Z",
          automation: { name: "S2 — Après la démo", definition: { steps: [{ id: "plqQ" }, { id: "plqWa" }] } },
        }
      : opts.inscription;

  mockFrom.mockImplementation((table: string) => {
    const miennes: Op[] = [];
    const resoudre = () => {
      if (table === "user_profiles") return { data: { role: "freelance" }, error: null };
      if (table === "entreprises") return { data: { id: ENTREPRISE, owner_id: owner }, error: null };
      if (table === "opportunites") return { data: { id: AFFAIRE }, error: null };
      if (table === "contacts") return { data: [], error: null };
      if (table === "sequence_enrollments") return { data: inscription, error: null };
      if (table === "email_logs") return { data: { id: "log-1" }, error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "insert", "update", "upsert"]) {
      chain[m] = (...args: unknown[]) => {
        const op = { table, m, args };
        miennes.push(op);
        ops.push(op);
        return chain;
      };
    }
    chain.maybeSingle = async () => resoudre();
    chain.then = (suite: (v: unknown) => unknown, echec?: (e: unknown) => unknown) => {
      void echec;
      return Promise.resolve(suite(resoudre()));
    };
    return chain;
  });
  return ops;
};

const appel = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/agent/demarchage/echange", {
      method: "POST",
      headers: { authorization: "Bearer jeton", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const BASE = { entreprise_id: ENTREPRISE, canal: "whatsapp", note: "Pas besoin de refaire le site." };

const ecrites = (ops: Op[], table: string, m: string) =>
  ops.filter((o) => o.table === table && o.m === m).map((o) => o.args[0] as Record<string, unknown>);

beforeEach(() => {
  __resetServiceClientForTests();
  mockFrom.mockReset();
  mockSortir.mockReset().mockResolvedValue({ jobs: 0, tasks: 0 });
  mockLiens.mockReset().mockResolvedValue({});
  mockResolveStage.mockReset().mockResolvedValue({ id: 91, ordre: 90 });
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
});

describe("POST /api/agent/demarchage/echange", () => {
  it("refuse un échange sans note : c'est le seul livrable du geste", async () => {
    brancher();
    const res = await appel({ entreprise_id: ENTREPRISE, note: "   " });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalledWith("email_logs");
  });

  it("refuse une entreprise qui n'est pas au caller — le mur est côté serveur", async () => {
    brancher({ ownerId: AUTRE });
    const res = await appel(BASE);
    expect(res.status).toBe(403);
  });

  it("écrit ce qu'il a dit en entrant, sur le canal de l'échange", async () => {
    const ops = brancher();
    const res = await appel(BASE);
    expect(res.status).toBe(200);

    const [entrant] = ecrites(ops, "email_logs", "insert");
    expect(entrant).toMatchObject({
      entreprise_id: ENTREPRISE,
      direction: "entrant",
      channel: "whatsapp",
      body_text: "Pas besoin de refaire le site.",
    });
  });

  it("sans issue, ne touche NI la séquence NI l'affaire", async () => {
    const ops = brancher();
    await appel(BASE);
    expect(mockSortir).not.toHaveBeenCalled();
    expect(mockResolveStage).not.toHaveBeenCalled();
    expect(ecrites(ops, "sequence_enrollments", "update")).toHaveLength(0);
    expect(ecrites(ops, "opportunites", "update")).toHaveLength(0);
  });

  it("« pas intéressé » arrête la séquence et range l'affaire en perdu", async () => {
    const ops = brancher();
    const res = await appel({ ...BASE, issue: "not_interested" });
    expect(res.status).toBe(200);

    expect(mockSortir).toHaveBeenCalledWith(expect.anything(), INSCRIPTION, "stop");
    expect(mockResolveStage).toHaveBeenCalledWith(expect.anything(), AFFAIRE, "perdu");
    expect(ecrites(ops, "opportunites", "update")[0]).toMatchObject({ stage_id: 91 });
    expect(ecrites(ops, "sales_pipeline_state", "upsert")[0]).toMatchObject({ replied: true });
  });

  // LE PIÈGE DE `reply.ts`, verrouillé ici. Un accusé de réception n'est pas de
  // l'intérêt : poser `replied` éteindrait les cellules WhatsApp et Appel du
  // tableau, c'est-à-dire les étapes que la séquence s'apprête à jouer.
  it("« il a répondu » ne pose PAS replied, et ne touche pas la séquence", async () => {
    const ops = brancher();
    await appel({ ...BASE, issue: "answered" });
    expect(ecrites(ops, "sales_pipeline_state", "upsert")).toHaveLength(0);
    expect(mockSortir).not.toHaveBeenCalled();
    // L'affaire, elle, avance jusqu'à « contacté » — ce qui est vrai.
    expect(mockResolveStage).toHaveBeenCalledWith(expect.anything(), AFFAIRE, "contacte");
  });

  it("« mettre de côté » repousse le réveil de la séquence sans la fermer", async () => {
    const ops = brancher();
    const quand = "2026-09-20T07:00:00.000Z";
    await appel({ ...BASE, issue: "later", revient_le: quand });

    expect(mockSortir).not.toHaveBeenCalled();
    expect(ecrites(ops, "sequence_enrollments", "update")[0]).toMatchObject({ next_run_at: quand });
    expect(ecrites(ops, "prospection_tasks", "update")[0]).toMatchObject({
      status: "snoozed",
      due_at: quand,
    });
  });

  it("refuse une mise de côté sans date : elle n'aurait aucun réveil", async () => {
    brancher();
    const res = await appel({ ...BASE, issue: "later" });
    expect(res.status).toBe(400);
  });

  it("journalise les pièces qui ont un lien, et rend celles qui n'en ont pas", async () => {
    mockLiens.mockResolvedValue({ plaquette: "https://app.exemple/plaquette/abc" });
    const ops = brancher();
    const res = await appel({ ...BASE, pieces: ["demo", "plaquette"] });
    const corps = (await res.json()) as { pieces_journalisees: string[]; pieces_sans_lien: string[] };

    expect(corps.pieces_journalisees).toEqual(["plaquette"]);
    expect(corps.pieces_sans_lien).toEqual(["demo"]);

    const sortants = ecrites(ops, "email_logs", "insert").filter((l) => l.direction === "sortant");
    expect(sortants).toHaveLength(1);
    expect(sortants[0].body_text).toContain("https://app.exemple/plaquette/abc");
  });

  it("consigne aussi sans aucune séquence vivante — l'appel à froid n'en a pas", async () => {
    const ops = brancher({ inscription: null });
    const res = await appel({ ...BASE, issue: "not_interested" });
    expect(res.status).toBe(200);
    expect(mockSortir).not.toHaveBeenCalled();
    expect(ecrites(ops, "email_logs", "insert")).toHaveLength(1);
  });
});
