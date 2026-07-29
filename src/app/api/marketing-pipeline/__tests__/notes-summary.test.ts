/**
 * Compteurs de tickets posés sur chaque ligne du board. Deux exigences :
 * regrouper correctement par opportunité (seuls les tickets non résolus
 * comptent, et leur étape sert à badger la bonne carte), et ne JAMAIS faire
 * tomber le board quand la migration des notes n'est pas encore appliquée.
 */

const select = jest.fn();
const from = jest.fn(() => ({ select }));

jest.mock("@/app/api/_lib/service-client", () => ({
  getServiceClient: () => ({ from }),
}));

import { noteSummaries } from "../_notes";

type Row = { opportunite_id: string; subject: string | null; status: string | null };

/** `.select(...).in(...)` renvoie la réponse canned. */
const respond = (data: Row[] | null, error: { code?: string; message?: string } | null = null) => {
  select.mockReturnValue({ in: () => Promise.resolve({ data, error }) });
};

beforeEach(() => {
  select.mockReset();
  from.mockClear();
});

describe("noteSummaries", () => {
  it("ne compte comme « ouvert » que ce qui n'est pas résolu", async () => {
    respond([
      { opportunite_id: "o1", subject: "site", status: "open" },
      { opportunite_id: "o1", subject: "audit", status: "in_progress" },
      { opportunite_id: "o1", subject: "site", status: "resolved" },
      { opportunite_id: "o2", subject: "enrichment", status: "resolved" },
    ]);

    const m = await noteSummaries(["o1", "o2"]);
    expect(m.get("o1")).toEqual({ open: 2, total: 3, open_subjects: ["site", "audit"] });
    // Un ticket clos reste visible dans le total, mais ne badge plus la ligne.
    expect(m.get("o2")).toEqual({ open: 0, total: 1, open_subjects: [] });
  });

  it("ne répète pas une étape qui porte plusieurs tickets ouverts", async () => {
    respond([
      { opportunite_id: "o1", subject: "site", status: "open" },
      { opportunite_id: "o1", subject: "site", status: "open" },
    ]);
    expect((await noteSummaries(["o1"])).get("o1")?.open_subjects).toEqual(["site"]);
  });

  it("retombe sur un sujet connu quand la valeur est inattendue", async () => {
    respond([{ opportunite_id: "o1", subject: "n'importe quoi", status: null }]);
    // `status` absent vaut « ouvert » : un ticket sans statut ne doit pas
    // disparaître silencieusement du board.
    expect((await noteSummaries(["o1"])).get("o1")).toEqual({
      open: 1,
      total: 1,
      open_subjects: ["other"],
    });
  });

  it("renvoie une map vide quand la table n'existe pas encore", async () => {
    respond(null, { code: "42P01", message: 'relation "marketing_pipeline_notes" does not exist' });
    await expect(noteSummaries(["o1"])).resolves.toEqual(new Map());
  });

  it("n'interroge pas la base sans opportunité", async () => {
    await expect(noteSummaries([])).resolves.toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });
});
