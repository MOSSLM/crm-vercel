import {
  DAILY_QUOTA,
  bucketOfTask,
  bucketTasks,
  countByKind,
  firstNonEmptyBucket,
  isLate,
} from "../demarchage-buckets";

const NOW = new Date("2026-08-13T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

type T = {
  id: string;
  kind?: string;
  due_at: string | null;
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};
const t = (id: string, due: string | null, kind = "whatsapp", intent?: T["intent"]): T => ({
  id,
  kind,
  due_at: due,
  intent,
});

/** N tâches d'un même canal, toutes échues, pour saturer la cadence. */
const lot = (kind: string, n: number, prefix = kind): T[] =>
  Array.from({ length: n }, (_, i) => t(`${prefix}-${i}`, iso("2026-08-10"), kind));

const plan = (tasks: T[], opts: Parameters<typeof bucketTasks>[1] = {}) =>
  bucketTasks(tasks, { now: NOW, timeZone: "UTC", ...opts });

describe("bucketTasks — la cadence quotidienne", () => {
  it("garde tout aujourd'hui tant que le quota du canal n'est pas atteint", () => {
    const b = plan(lot("whatsapp", 5));
    expect(b.today).toHaveLength(5);
    expect(b.tomorrow).toHaveLength(0);
  });

  it("renvoie à demain ce qui dépasse le quota du jour", () => {
    // 25 WhatsApp en attente, 20 par jour : 20 aujourd'hui, 5 demain.
    const b = plan(lot("whatsapp", 25));
    expect(b.today).toHaveLength(DAILY_QUOTA.whatsapp);
    expect(b.tomorrow).toHaveLength(25 - DAILY_QUOTA.whatsapp);
    expect(b.week).toHaveLength(0);
  });

  it("étale au-delà de demain, puis dans « cette semaine » et « plus tard »", () => {
    const q = DAILY_QUOTA.whatsapp;
    // 8 journées pleines : aujourd'hui, demain, 5 jours de semaine, 1 au-delà.
    const b = plan(lot("whatsapp", q * 8));
    expect(b.today).toHaveLength(q);
    expect(b.tomorrow).toHaveLength(q);
    expect(b.week).toHaveLength(q * 5);
    expect(b.later).toHaveLength(q);
  });

  it("compte chaque canal séparément — 20 appels ET 20 WhatsApp tiennent le même jour", () => {
    const b = plan([...lot("call", 20), ...lot("whatsapp", 20)]);
    expect(b.today).toHaveLength(40);
    expect(b.tomorrow).toHaveLength(0);
  });

  it("laisse un canal sans tâche à zéro — jamais à son quota", () => {
    // Aucune séquence à l'étape appel : la file ne doit pas inventer 20 appels.
    const b = plan(lot("whatsapp", 30));
    expect(countByKind(b.today).call ?? 0).toBe(0);
    expect(countByKind(b.today).whatsapp).toBe(DAILY_QUOTA.whatsapp);
  });

  it("décompte ce qui a DÉJÀ été bouclé aujourd'hui du quota du jour", () => {
    // 15 WhatsApp déjà envoyés ce matin : il ne reste que 5 places aujourd'hui.
    const b = plan(lot("whatsapp", 25), { doneToday: { whatsapp: 15 } });
    expect(b.today).toHaveLength(5);
    expect(b.tomorrow).toHaveLength(DAILY_QUOTA.whatsapp);
  });

  it("ferme la journée quand le quota est déjà consommé", () => {
    const b = plan(lot("call", 6), { doneToday: { call: DAILY_QUOTA.call } });
    expect(b.today).toHaveLength(0);
    expect(b.tomorrow).toHaveLength(6);
  });

  it("bascule tout sur demain passé 22 h", () => {
    const soir = new Date("2026-08-13T22:30:00Z");
    const b = bucketTasks(lot("whatsapp", 25), { now: soir, timeZone: "UTC" });
    expect(b.today).toHaveLength(0);
    expect(b.tomorrow).toHaveLength(DAILY_QUOTA.whatsapp);
    expect(b.week).toHaveLength(5);
  });

  it("garde le jour ouvert juste avant la coupure", () => {
    const b = bucketTasks(lot("whatsapp", 3), { now: new Date("2026-08-13T21:59:00Z"), timeZone: "UTC" });
    expect(b.today).toHaveLength(3);
  });

  it("passe les plus anciennes échéances en premier", () => {
    const b = plan([
      t("recent", iso("2026-08-13")),
      t("vieux", iso("2026-08-01")),
      t("moyen", iso("2026-08-07")),
    ]);
    expect(b.today.map((x) => x.id)).toEqual(["vieux", "moyen", "recent"]);
  });

  it("planifie quand même une tâche sans échéance, en fin de file", () => {
    const b = plan([t("sansdate", null), t("date", iso("2026-08-12"))]);
    expect(b.today.map((x) => x.id)).toEqual(["date", "sansdate"]);
  });

  it("ne plafonne pas l'attente de réponse : elle ne coûte aucun effort", () => {
    const b = plan(lot("wait", 40));
    expect(b.today).toHaveLength(40);
    expect(b.tomorrow).toHaveLength(0);
  });

  it("n'affecte jamais une tâche à deux paniers", () => {
    const tasks = [...lot("whatsapp", 45), ...lot("call", 3), t("chaud", iso("2026-08-30"), "call", { callWhen: "maintenant", score: 90 })];
    const b = plan(tasks);
    const total = Object.values(b).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(tasks.length);
  });
});

describe("bucketTasks — les signaux passent devant la cadence", () => {
  it("remonte un prospect chaud en tête, même si sa séquence le prévoit plus tard", () => {
    const b = plan([t("froid", iso("2026-08-13")), t("chaud", iso("2026-08-30"), "call", { callWhen: "maintenant", score: 90 })]);
    expect(b.hot.map((x) => x.id)).toEqual(["chaud"]);
    expect(b.later).toEqual([]);
    expect(firstNonEmptyBucket(b)).toMatchObject({ id: "chaud" });
  });

  it("considère « aujourd'hui » comme chaud, pas seulement « maintenant »", () => {
    const b = plan([t("a", iso("2026-08-30"), "call", { callWhen: "aujourdhui", score: 70 })]);
    expect(b.hot).toHaveLength(1);
  });

  it("ignore le quota du jour : un signal chaud se rappelle même journée pleine", () => {
    const b = plan([...lot("call", DAILY_QUOTA.call), t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 90 })]);
    expect(b.hot.map((x) => x.id)).toEqual(["chaud"]);
    expect(b.today).toHaveLength(DAILY_QUOTA.call);
  });

  it("ne remonte PAS un signal tiède : J+1 repasse par le plan", () => {
    const b = plan([t("tiede", iso("2026-08-14"), "whatsapp", { callWhen: "j1", score: 40 })]);
    expect(b.hot).toEqual([]);
    expect(b.today.map((x) => x.id)).toEqual(["tiede"]);
  });

  it("passe le signal chaud non rappelé avant les chauds du jour", () => {
    const b = plan([
      t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 80 }),
      t("manque", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 75, missed: true }),
    ]);
    expect(b.missed.map((x) => x.id)).toEqual(["manque"]);
    expect(b.hot.map((x) => x.id)).toEqual(["chaud"]);
    expect(firstNonEmptyBucket(b)).toMatchObject({ id: "manque" });
  });
});

describe("isLate — l'échéance dépassée reste dite, sur la ligne", () => {
  it("marque une relance dont la date est passée", () => {
    expect(isLate(t("a", iso("2026-08-10")), NOW, "UTC")).toBe(true);
  });

  it("ne marque pas une tâche du jour ni une tâche à venir", () => {
    expect(isLate(t("a", iso("2026-08-13")), NOW, "UTC")).toBe(false);
    expect(isLate(t("b", iso("2026-08-20")), NOW, "UTC")).toBe(false);
  });

  it("ne marque jamais une attente de réponse : son `due_at` n'est qu'une mise en pause", () => {
    expect(isLate(t("w", iso("2026-07-01"), "wait"), NOW, "UTC")).toBe(false);
  });

  it("ne marque pas une tâche sans échéance", () => {
    expect(isLate(t("a", null), NOW, "UTC")).toBe(false);
  });
});

describe("bucketOfTask", () => {
  it("retrouve le panier d'une tâche, pour que l'onglet suive la sélection", () => {
    const b = plan(lot("whatsapp", 25));
    expect(bucketOfTask(b, "whatsapp-0")).toBe("today");
    expect(bucketOfTask(b, "whatsapp-24")).toBe("tomorrow");
    expect(bucketOfTask(b, "inconnu")).toBeNull();
  });
});
