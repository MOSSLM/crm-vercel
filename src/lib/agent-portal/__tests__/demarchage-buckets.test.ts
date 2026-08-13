import { bucketTasks, firstNonEmptyBucket } from "../demarchage-buckets";

const NOW = new Date("2026-08-13T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

type T = { id: string; due_at: string | null; intent?: { callWhen: string; score: number } | null };
const t = (id: string, due: string | null, intent?: T["intent"]): T => ({ id, due_at: due, intent });

describe("bucketTasks — la file de démarchage", () => {
  it("range par échéance quand aucun signal n'existe", () => {
    const b = bucketTasks(
      [t("retard", iso("2026-08-10")), t("auj", iso("2026-08-13")), t("demain", iso("2026-08-14")), t("semaine", iso("2026-08-17"))],
      NOW,
      "UTC",
    );
    expect(b.overdue.map((x) => x.id)).toEqual(["retard"]);
    expect(b.today.map((x) => x.id)).toEqual(["auj"]);
    expect(b.tomorrow.map((x) => x.id)).toEqual(["demain"]);
    expect(b.week.map((x) => x.id)).toEqual(["semaine"]);
    expect(b.hot).toEqual([]);
  });

  it("remonte un prospect chaud en tête, même si sa séquence le prévoit plus tard", () => {
    // Le cas qui compte : la séquence a planifié la relance dans 10 jours,
    // mais il vient de rouvrir sa démo. L'information fraîche doit gagner.
    const b = bucketTasks([t("froid", iso("2026-08-13")), t("chaud", iso("2026-08-30"), { callWhen: "maintenant", score: 90 })], NOW, "UTC");
    expect(b.hot.map((x) => x.id)).toEqual(["chaud"]);
    expect(b.later).toEqual([]);
    expect(firstNonEmptyBucket(b)).toMatchObject({ id: "chaud" });
  });

  it("considère « aujourd'hui » comme chaud, pas seulement « maintenant »", () => {
    const b = bucketTasks([t("a", iso("2026-08-30"), { callWhen: "aujourdhui", score: 70 })], NOW, "UTC");
    expect(b.hot).toHaveLength(1);
  });

  it("ne remonte PAS un signal tiède : J+1 reste dans son panier d'échéance", () => {
    const b = bucketTasks([t("tiede", iso("2026-08-14"), { callWhen: "j1", score: 40 })], NOW, "UTC");
    expect(b.hot).toEqual([]);
    expect(b.tomorrow.map((x) => x.id)).toEqual(["tiede"]);
  });

  it("laisse une tâche sans échéance dans « plus tard » plutôt que de la perdre", () => {
    const b = bucketTasks([t("sansdate", null)], NOW, "UTC");
    expect(b.later.map((x) => x.id)).toEqual(["sansdate"]);
  });

  it("n'affecte jamais une tâche à deux paniers", () => {
    const tasks = [t("a", iso("2026-08-10")), t("b", iso("2026-08-30"), { callWhen: "maintenant", score: 90 }), t("c", null)];
    const b = bucketTasks(tasks, NOW, "UTC");
    const total = Object.values(b).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(tasks.length);
  });

  it("propose le panier chaud en premier au chargement", () => {
    const b = bucketTasks([t("retard", iso("2026-08-01")), t("chaud", iso("2026-08-25"), { callWhen: "maintenant", score: 95 })], NOW, "UTC");
    expect(firstNonEmptyBucket(b)).toMatchObject({ id: "chaud" });
  });
});
