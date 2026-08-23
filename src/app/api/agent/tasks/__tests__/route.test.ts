/**
 * @jest-environment node
 *
 * La file de démarchage, côté serveur.
 *
 * CE QUE CE FICHIER GARDE
 * « Ceux qui ne sont pas en séquence, on ne doit pas les voir dans des tâches,
 * même pas d'appels. Dans tous les cas on met en séquence pour avoir des
 * tâches. » Le filtre `enrollment_id IS NOT NULL` est donc de retour — mais la
 * raison a changé de camp : ce n'est plus une décision d'écran, c'est que
 * l'attribution MET EN SÉQUENCE au lieu de semer une tâche d'appel
 * (`mettreEnSequence`, `_assign.ts`). Une tâche sans inscription ne sait dire
 * ni ce qui a été tenté avant, ni ce qui vient après.
 *
 * Ce que ces tests protègent de la bascule inverse : la CADENCE, elle, compte
 * tout ce qui a été bouclé aujourd'hui, séquence ou pas — vingt appels passés
 * ce matin occupent vingt places de la journée, et les oublier rouvrirait une
 * journée déjà pleine.
 *
 * Le faux client Supabase applique RÉELLEMENT les filtres posés par la route
 * (`eq`, `in`, `not ... is null`) sur un petit jeu de lignes, plutôt que de
 * rendre une réponse figée : sans ça, un test passerait aussi bien avec le
 * filtre qu'on vient de retirer.
 */
import { __resetServiceClientForTests } from "@/app/api/_lib/service-client";
import { DAILY_QUOTA } from "@/lib/agent-portal/demarchage-buckets";

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

// GA4 : le module tire `google-auth-library` et le réseau. La route sait déjà
// se passer d'intention (`.catch`), on lui en donne zéro.
jest.mock("@/lib/analytics-radar/site-intent", () => ({
  intentByEnterprise: jest.fn(async () => new Map()),
}));

// Le moteur de séquences n'a rien à faire ici : la reprise d'une inscription
// est testée chez lui, et la faire tourner pour de vrai ferait dépendre ce
// fichier de la moitié du domaine.
const mockAvancer = jest.fn(async () => undefined);
const mockSortir = jest.fn(async () => ({ jobs: 0, tasks: 0 }));
jest.mock("@/lib/automations/engine", () => ({
  advanceEnrollmentAfterTask: (...a: unknown[]) => mockAvancer(...(a as [])),
  sortirDeSequence: (...a: unknown[]) => mockSortir(...(a as [])),
}));

import { GET, PATCH } from "../route";

const AGENT = "76353de0-ac50-4645-9530-8be2db55c7a3";

/** Une opération de la chaîne postgrest, telle que le faux client la retient. */
type Op = { m: string; args: unknown[] };

/** Lit `entreprise.owner_id` aussi bien que `status` sur une ligne. */
const valeurDe = (ligne: Record<string, unknown>, chemin: string): unknown =>
  chemin.split(".").reduce<unknown>((acc, cle) => {
    if (acc == null || typeof acc !== "object") return undefined;
    const noeud = Array.isArray(acc) ? acc[0] : acc;
    return (noeud as Record<string, unknown>)?.[cle];
  }, ligne);

/** Applique à la main les filtres que la route a posés. */
const filtrer = (lignes: Record<string, unknown>[], ops: Op[]) =>
  lignes.filter((ligne) =>
    ops.every((op) => {
      if (op.m === "eq") return valeurDe(ligne, op.args[0] as string) === op.args[1];
      if (op.m === "in") return (op.args[1] as unknown[]).includes(valeurDe(ligne, op.args[0] as string));
      // `.not(col, "is", null)` — le filtre qui cachait le froid.
      if (op.m === "not" && op.args[1] === "is" && op.args[2] === null) {
        return valeurDe(ligne, op.args[0] as string) != null;
      }
      return true;
    }),
  );

type Jeu = {
  taches: Record<string, unknown>[];
  faites: Record<string, unknown>[];
  reglages: Record<string, unknown> | null;
  /** La tâche que la garde de propriété du PATCH doit trouver. */
  garde: Record<string, unknown> | null;
  /** Tables dont toute écriture échoue — pour vérifier le « best effort ». */
  enPanne: readonly string[];
};

const JEU_VIDE: Jeu = { taches: [], faites: [], reglages: null, garde: null, enPanne: [] };

/**
 * Toutes les requêtes de la route, servies depuis un jeu de lignes en mémoire.
 * Rend les chaînes d'opérations reçues, table par table : c'est ce qui permet
 * de vérifier une ÉCRITURE (le PATCH n'a rien à relire).
 */
const brancher = (jeu: Partial<Jeu>) => {
  const { taches, faites, reglages, garde, enPanne } = { ...JEU_VIDE, ...jeu };
  const opsParTable: Record<string, Op[][]> = {};

  mockFrom.mockImplementation((table: string) => {
    const ops: Op[] = [];
    const resoudre = (): { data: unknown; error: unknown } => {
      (opsParTable[table] ??= []).push(ops);
      if (enPanne.includes(table)) throw new Error("colonne absente");
      const eq = (col: string, val: unknown) =>
        ops.some((o) => o.m === "eq" && o.args[0] === col && o.args[1] === val);
      const ecrit = ops.some((o) => o.m === "update");

      if (table === "user_profiles") return { data: { role: "freelance" }, error: null };
      if (table === "agent_settings") return { data: reglages, error: null };
      if (table === "prospection_tasks") {
        if (ecrit) return { data: { id: "t1", status: "done" }, error: null };
        // La garde de propriété du PATCH cible une tâche par son id.
        if (ops.some((o) => o.m === "eq" && o.args[0] === "id")) return { data: garde, error: null };
        if (eq("status", "done")) return { data: filtrer(faites, ops), error: null };
        // La lecture « dernier appel passé » : aucune ici.
        if (eq("kind", "call")) return { data: [], error: null };
        return { data: filtrer(taches, ops), error: null };
      }
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "gte", "order", "limit", "is", "update", "insert"]) {
      chain[m] = (...args: unknown[]) => {
        ops.push({ m, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => resoudre();
    chain.then = (suite: (v: unknown) => unknown) => suite(resoudre());
    return chain;
  });

  return opsParTable;
};

const appel = (query = "") =>
  GET(
    new Request(`http://localhost/api/agent/tasks${query}`, {
      headers: { authorization: "Bearer jeton" },
    }),
  );

type LigneFile = {
  id: string;
  kind: string;
  cohorte: string | null;
  hors_sequence: boolean;
  in_conversation: boolean;
  premiere_touche_le: string | null;
  sequence: unknown;
};
type Reponse = {
  tasks: LigneFile[];
  meta: { quotas: Record<string, number>; done_today_by_kind: Record<string, number>; cohorte: string | null };
};

const lire = async (res: Response) => (await res.json()) as Reponse;

/**
 * Une tâche SANS inscription — le contre-exemple. Elle ne doit plus jamais
 * ressortir de la file : c'est ce que le premier test vérifie.
 */
const froide = (id: string, cohorte: string | null = "B_sans_site") => ({
  id,
  kind: "call",
  status: "pending",
  title: "Appel",
  due_at: "2026-08-17T09:00:00.000Z",
  contact_id: null,
  entreprise_id: Number(id.replace(/\D/g, "")) || 1,
  opportunite_id: null,
  payload: {},
  enrollment_id: null,
  automation_id: null,
  step_id: null,
  contact: null,
  entreprise: { id: 1, name: "Artisan", ville: "Lyon", telephone: null, owner_id: AGENT, cohorte_demarchage: cohorte },
});

/**
 * Une tâche bouclée aujourd'hui. `touche` est la date de PREMIÈRE touche de son
 * entreprise : c'est elle qui décide si le geste compte dans l'objectif du jour
 * — abordée aujourd'hui, oui ; relancée après l'avoir été la semaine dernière,
 * non.
 */
const faite = (kind: string, touche = new Date().toISOString()) => ({
  kind,
  step_id: null,
  automation_id: null,
  enrollment_id: null,
  status: "done",
  entreprise: { owner_id: AGENT, premiere_touche_le: touche },
});

/** Une tâche de relance, inscrite sur une séquence. */
const enSequence = (id: string, cohorte: string | null = "A_site_faible") => ({
  ...froide(id, cohorte),
  kind: "whatsapp",
  enrollment_id: `enr-${id}`,
  automation_id: null,
});

describe("GET /api/agent/tasks — pas d'inscription, pas de tâche", () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
  });

  /**
   * LE STOCK QU'ON RETIRE : 631 appels en attente au 20/08/2026, semés un par
   * un par l'ancienne attribution, dont 86 sur des entreprises DÉJÀ inscrites
   * ailleurs — c'est-à-dire du travail en double, dans la file d'un agent qui
   * n'avait aucun moyen de le voir.
   */
  it("écarte une tâche qui n'appartient à aucune inscription", async () => {
    brancher({ taches: [froide("t1"), enSequence("t2")] });
    const { tasks } = await lire(await appel());
    expect(tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("ne laisse plus aucune ligne se dire « hors séquence »", async () => {
    brancher({ taches: [enSequence("t2")] });
    const { tasks } = await lire(await appel());
    expect(tasks[0].hors_sequence).toBe(false);
    expect(tasks[0].sequence).not.toBeUndefined();
  });

  it("porte la date de PREMIÈRE TOUCHE de l'entreprise, ou son absence", async () => {
    // C'est elle qui sépare les trois files du poste de travail : sans date, la
    // ligne est un premier contact ; avec, c'est un suivi. La déduire côté
    // écran donnerait une seconde vérité à côté de celle des cohortes.
    brancher({
      taches: [
        enSequence("t1"),
        {
          ...enSequence("t2"),
          entreprise: { ...froide("t2").entreprise, premiere_touche_le: "2026-08-14T10:00:00.000Z" },
        },
      ],
    });
    const { tasks } = await lire(await appel());
    expect(Object.fromEntries(tasks.map((t) => [t.id, t.premiere_touche_le]))).toEqual({
      t1: null,
      t2: "2026-08-14T10:00:00.000Z",
    });
  });

  /**
   * LA CADENCE NE SE FILTRE PAS, ELLE. Une tâche bouclée est du temps d'agent
   * dépensé, qu'elle vienne d'une séquence ou du stock d'avant. Lui appliquer
   * le même filtre qu'à la file rouvrirait une journée déjà pleine.
   */
  it("compte dans la cadence du jour même ce qui n'avait pas d'inscription", async () => {
    brancher({ taches: [enSequence("t1")], faites: [faite("call")] });
    const { meta } = await lire(await appel());
    expect(meta.done_today_by_kind).toEqual({ call: 1 });
  });

  it("ne compte PAS une relance dans l'objectif de premiers contacts", async () => {
    // Le compteur dit « combien d'entreprises j'ai abordées aujourd'hui ».
    // Trois relances J+3 bouclées le matin affichaient « 3 » sans qu'aucune
    // entreprise nouvelle n'ait été abordée.
    brancher({ taches: [], faites: [faite("whatsapp", "2026-08-01T09:00:00.000Z")] });
    const { meta } = await lire(await appel());
    expect(meta.done_today_by_kind).toEqual({});
  });
});

describe("GET /api/agent/tasks — la cohorte, portée et filtrable", () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
  });

  it("porte la cohorte sur chaque ligne de file", async () => {
    brancher({ taches: [enSequence("t1", "B_sans_site"), enSequence("t2", "A_site_faible")] });
    const { tasks } = await lire(await appel());
    expect(Object.fromEntries(tasks.map((t) => [t.id, t.cohorte]))).toEqual({
      t1: "B_sans_site",
      t2: "A_site_faible",
    });
  });

  it("rend `null` pour une entreprise hors campagne", async () => {
    brancher({ taches: [enSequence("t1", null)] });
    const { tasks } = await lire(await appel());
    expect(tasks[0].cohorte).toBeNull();
  });

  it("ne garde qu'une cohorte quand on la demande", async () => {
    brancher({ taches: [enSequence("t1", "B_sans_site"), enSequence("t2", "A_site_faible")] });
    const { tasks, meta } = await lire(await appel("?cohorte=A_site_faible"));
    expect(tasks.map((t) => t.id)).toEqual(["t2"]);
    expect(meta.cohorte).toBe("A_site_faible");
  });

  it("ignore une cohorte inconnue plutôt que de rendre une file vide", async () => {
    // Une faute de frappe dans l'URL ne doit pas laisser croire qu'il n'y a
    // rien à faire aujourd'hui : une file trop large se voit, une file vide se
    // croit.
    brancher({ taches: [enSequence("t1", "B_sans_site")] });
    const { tasks, meta } = await lire(await appel("?cohorte=C_inventee"));
    expect(tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(meta.cohorte).toBeNull();
  });

  it("ne filtre pas la cadence déjà consommée par la cohorte affichée", async () => {
    // Le quota est du temps d'agent, pas un compteur par cohorte : un appel
    // passé à une entreprise de B occupe la même place qu'un appel à A.
    brancher({
      taches: [enSequence("t2", "A_site_faible")],
      faites: [faite("call")],
    });
    const { meta } = await lire(await appel("?cohorte=A_site_faible"));
    expect(meta.done_today_by_kind).toEqual({ call: 1 });
  });
});

describe("PATCH /api/agent/tasks — la première touche", () => {
  const GARDE = {
    id: "t1",
    kind: "call",
    contact_id: null,
    entreprise_id: 42,
    opportunite_id: null,
    step_id: null,
    enrollment_id: null,
    assignee_id: null,
    entreprise: { owner_id: AGENT },
  };

  const patch = (body: Record<string, unknown>) =>
    PATCH(
      new Request("http://localhost/api/agent/tasks", {
        method: "PATCH",
        headers: { authorization: "Bearer jeton", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
  });

  it("horodate l'entreprise au premier « Fait », et une seule fois", () => {
    const ops = brancher({ garde: GARDE });
    return patch({ id: "t1", status: "done" }).then((res) => {
      expect(res.status).toBe(200);
      // DEUX CHAÎNES TOUCHENT `entreprises` DEPUIS LE 23/08 : le journal des
      // gestes lit d'abord `premiere_touche_le` pour savoir s'il devra la
      // retirer en cas d'annulation, puis vient l'écriture. On cherche donc
      // celle qui écrit, au lieu de supposer que c'est la première.
      const ecriture = (ops.entreprises ?? []).find((c) => c.some((o) => o.m === "update")) ?? [];
      const update = ecriture.find((o) => o.m === "update");
      expect((update?.args[0] as Record<string, unknown>)?.premiere_touche_le).toEqual(expect.any(String));
      expect(ecriture).toContainEqual({ m: "eq", args: ["id", 42] });
      // LE garde-fou : sans `is(..., null)`, chaque relance réécrirait la date
      // et l'âge de l'entreprise resterait éternellement à zéro — les deux
      // cohortes deviendraient incomparables.
      expect(ecriture).toContainEqual({ m: "is", args: ["premiere_touche_le", null] });
    });
  });

  it("ne touche à rien pour un « pas le bon moment »", async () => {
    const ops = brancher({ garde: GARDE });
    await patch({ id: "t1", status: "snoozed", snooze_until: "2026-08-20T09:00:00.000Z" });
    expect(ops.entreprises).toBeUndefined();
  });

  it("enregistre le « Fait » même si l'horodatage échoue", async () => {
    // L'agent a passé l'appel : refuser d'enregistrer son travail parce qu'une
    // colonne de mesure résiste serait le pire échange possible.
    brancher({ garde: GARDE, enPanne: ["entreprises"] });
    const res = await patch({ id: "t1", status: "done" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done" });
  });

  it("ne cherche pas d'entreprise quand la tâche n'en porte pas", async () => {
    const ops = brancher({ garde: { ...GARDE, entreprise_id: null, assignee_id: AGENT, entreprise: null } });
    await patch({ id: "t1", status: "done" });
    expect(ops.entreprises).toBeUndefined();
  });
});

/**
 * CE QUE DEVIENT LA SÉQUENCE — la distinction qui manquait.
 *
 * Une issue qui ARRÊTE annonce « plus rien ne part » sous le bouton. Elle ne
 * faisait pourtant rien de tel : la tâche se fermait avec son issue, puis
 * l'inscription était avancée comme après n'importe quel geste. Un prospect qui
 * venait de dire non recevait donc la relance J+3, puis la J+7.
 */
describe("PATCH /api/agent/tasks — l'issue décide du sort de la séquence", () => {
  const EN_SEQUENCE = {
    id: "t1",
    kind: "whatsapp",
    contact_id: null,
    entreprise_id: 42,
    opportunite_id: null,
    step_id: "s1",
    enrollment_id: "enr-1",
    assignee_id: null,
    payload: { message: "Bonjour" },
    entreprise: { owner_id: AGENT },
  };

  const patch = (body: Record<string, unknown>) =>
    PATCH(
      new Request("http://localhost/api/agent/tasks", {
        method: "PATCH",
        headers: { authorization: "Bearer jeton", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockAvancer.mockClear();
    mockSortir.mockClear();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
  });

  it("sort de la séquence sur une issue qui arrête, au lieu d'enchaîner", async () => {
    brancher({ garde: EN_SEQUENCE });
    await patch({ id: "t1", status: "done", step_outcome: "not_interested", note: "pas le budget" });
    // « stop » et pas « hors_canal » : quelqu'un a répondu non. Le prospect ne
    // doit pas revenir dans le stock à démarcher.
    expect(mockSortir).toHaveBeenCalledWith(expect.anything(), "enr-1", "stop");
    expect(mockAvancer).not.toHaveBeenCalled();
  });

  it("enchaîne l'étape suivante sur une issue qui continue", async () => {
    brancher({ garde: EN_SEQUENCE });
    await patch({ id: "t1", status: "done", step_outcome: "no_answer" });
    expect(mockAvancer).toHaveBeenCalledWith("enr-1");
    expect(mockSortir).not.toHaveBeenCalled();
  });

  it("arrête aussi depuis une tâche ANNULÉE — c'est « pas sur ce canal »", async () => {
    // Rien n'est parti : la tâche est `skipped`, donc elle ne fait avancer
    // personne. Elle peut en revanche fermer la séquence, et c'est le seul
    // moyen d'arrêter des relances sur un canal où le prospect n'est pas.
    brancher({ garde: EN_SEQUENCE });
    await patch({ id: "t1", status: "skipped", step_outcome: "blocked" });
    // « Bloqué / mauvais numéro » met le numéro en blacklist : c'est un arrêt,
    // pas un canal à remplacer.
    expect(mockSortir).toHaveBeenCalledWith(expect.anything(), "enr-1", "stop");
    expect(mockAvancer).not.toHaveBeenCalled();
  });

  it("ne touche jamais à la séquence pour une mise de côté", async () => {
    // Ranger n'est ni un oui ni un non : la séquence reste où elle est, garée
    // sur son étape, et repart quand la tâche revient.
    brancher({ garde: EN_SEQUENCE });
    await patch({
      id: "t1",
      status: "snoozed",
      snooze_until: "2026-09-15T09:00:00.000Z",
      step_outcome: "later",
    });
    expect(mockSortir).not.toHaveBeenCalled();
    expect(mockAvancer).not.toHaveBeenCalled();
  });

  it("écrit la date de retour ET le motif sur la tâche mise de côté", async () => {
    // Sans `due_at` déplacé, la tâche resterait dans la file du jour ; sans le
    // motif dans le payload, on rouvrirait la fiche dans trois semaines sans
    // savoir pourquoi on l'avait rangée.
    const ops = brancher({ garde: EN_SEQUENCE });
    await patch({
      id: "t1",
      status: "snoozed",
      snooze_until: "2026-09-15T09:00:00.000Z",
      note: "En congés jusqu'au 15",
    });
    const update = (ops.prospection_tasks ?? [])
      .flat()
      .find((o) => o.m === "update")?.args[0] as Record<string, unknown>;
    expect(update.due_at).toBe("2026-09-15T09:00:00.000Z");
    expect(update.payload).toMatchObject({
      // Le message d'origine survit : on fusionne le payload, on ne l'écrase pas.
      message: "Bonjour",
      mise_de_cote: { jusquau: "2026-09-15T09:00:00.000Z", motif: "En congés jusqu'au 15" },
    });
  });

  it("refuse un statut qui n'existe pas plutôt que de l'écrire", async () => {
    // `status` finit tel quel dans la colonne : une valeur inventée sortirait la
    // tâche de la file sans qu'aucun écran ne sache la retrouver.
    brancher({ garde: EN_SEQUENCE });
    const res = await patch({ id: "t1", status: "archive" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agent/tasks — les quotas de l'agent", () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: AGENT } }, error: null });
  });

  it("annonce le défaut quand l'agent n'a rien réglé", async () => {
    brancher({ reglages: null });
    const { meta } = await lire(await appel());
    expect(meta.quotas).toEqual(DAILY_QUOTA);
  });

  it("annonce la cadence réglée par l'agent", async () => {
    brancher({ reglages: { quotas_demarchage: { call: 40, whatsapp: 60 } } });
    const { meta } = await lire(await appel());
    expect(meta.quotas).toEqual({ ...DAILY_QUOTA, call: 40, whatsapp: 60 });
  });

  it("retombe sur le défaut devant un réglage aberrant", async () => {
    // Un objectif nul n'afficherait plus un rythme mais une barre de progression
    // absurde, et `quotaOf` rendrait « /0 » en tête de file.
    brancher({ reglages: { quotas_demarchage: { call: 0, whatsapp: -3 } } });
    const { meta } = await lire(await appel());
    expect(meta.quotas).toEqual(DAILY_QUOTA);
  });

  it("survit à une colonne absente : la file ne dépend pas du réglage", async () => {
    brancher({ reglages: null });
    const res = await appel();
    expect(res.status).toBe(200);
  });
});
