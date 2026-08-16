import {
  DAILY_QUOTA,
  cadenceEffective,
  countByKind,
  countBySignal,
  dayOfTask,
  firstPlannedTask,
  isLate,
  normaliseQuotas,
  planTasks,
  quotaOf,
  signalOf,
} from "../demarchage-buckets";

const NOW = new Date("2026-08-13T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

type T = {
  id: string;
  kind?: string;
  due_at: string | null;
  in_conversation?: boolean;
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};
const t = (id: string, due: string | null, kind = "whatsapp", intent?: T["intent"]): T => ({
  id,
  kind,
  due_at: due,
  intent,
});

/** Une tâche dont le prospect a déjà répondu — la discussion est ouverte. */
const enDiscussion = (id: string, due: string | null, kind = "whatsapp"): T => ({
  ...t(id, due, kind),
  in_conversation: true,
});

/** N tâches d'un même canal, toutes échues, pour saturer la cadence. */
const lot = (kind: string, n: number, prefix = kind): T[] =>
  Array.from({ length: n }, (_, i) => t(`${prefix}-${i}`, iso("2026-08-10"), kind));

const plan = (tasks: T[], opts: Parameters<typeof planTasks>[1] = {}) =>
  planTasks(tasks, { now: NOW, timeZone: "UTC", ...opts });

/** Les tâches d'un décalage de jour (0 = aujourd'hui) — [] si le jour est absent. */
const jour = (days: ReturnType<typeof plan>, offset: number) =>
  days.find((d) => d.offset === offset)?.tasks ?? [];
const ids = (tasks: T[]) => tasks.map((x) => x.id);

describe("planTasks — la cadence quotidienne", () => {
  it("garde tout aujourd'hui tant que le quota du canal n'est pas atteint", () => {
    const d = plan(lot("whatsapp", 5));
    expect(jour(d, 0)).toHaveLength(5);
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("renvoie à demain ce qui dépasse le quota du jour", () => {
    // 25 WhatsApp en attente, 20 par jour : 20 aujourd'hui, 5 demain.
    const d = plan(lot("whatsapp", 25));
    expect(jour(d, 0)).toHaveLength(DAILY_QUOTA.whatsapp);
    expect(jour(d, 1)).toHaveLength(25 - DAILY_QUOTA.whatsapp);
    expect(jour(d, 2)).toHaveLength(0);
  });

  it("étale sur autant de journées datées que nécessaire", () => {
    const q = DAILY_QUOTA.whatsapp;
    const d = plan(lot("whatsapp", q * 8));
    expect(d).toHaveLength(8);
    d.forEach((journee) => expect(journee.tasks).toHaveLength(q));
    expect(d.map((j) => j.offset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("date chaque journée pour de vrai, dans le fuseau de l'agent", () => {
    const d = plan(lot("whatsapp", DAILY_QUOTA.whatsapp * 3));
    expect(d.map((j) => j.date)).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
  });

  it("garde toujours aujourd'hui, même quand il n'y a rien à y faire", () => {
    expect(plan([]).map((j) => j.date)).toEqual(["2026-08-13"]);
  });

  it("n'invente pas de journée vide entre deux journées pleines", () => {
    // Rien ne peut créer un trou dans le plan, mais rien ne doit non plus
    // ajouter un onglet « 0 act. » pour un jour que la cadence n'a pas atteint.
    const d = plan(lot("whatsapp", 3));
    expect(d).toHaveLength(1);
  });

  it("compte chaque canal séparément — 20 appels ET 20 WhatsApp tiennent le même jour", () => {
    const d = plan([...lot("call", 20), ...lot("whatsapp", 20)]);
    expect(jour(d, 0)).toHaveLength(40);
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("laisse un canal sans tâche à zéro — jamais à son quota", () => {
    // Aucune séquence à l'étape appel : la file ne doit pas inventer 20 appels.
    const d = plan(lot("whatsapp", 30));
    expect(countByKind(jour(d, 0)).call ?? 0).toBe(0);
    expect(countByKind(jour(d, 0)).whatsapp).toBe(DAILY_QUOTA.whatsapp);
  });

  it("décompte ce qui a DÉJÀ été bouclé aujourd'hui du quota du jour", () => {
    // 15 WhatsApp déjà envoyés ce matin : il ne reste que 5 places aujourd'hui.
    const d = plan(lot("whatsapp", 25), { doneToday: { whatsapp: 15 } });
    expect(jour(d, 0)).toHaveLength(5);
    expect(jour(d, 1)).toHaveLength(DAILY_QUOTA.whatsapp);
  });

  it("ferme la journée quand le quota est déjà consommé", () => {
    const d = plan(lot("call", 6), { doneToday: { call: DAILY_QUOTA.call } });
    expect(jour(d, 0)).toHaveLength(0);
    expect(jour(d, 1)).toHaveLength(6);
  });

  it("bascule tout sur demain passé 22 h", () => {
    const soir = new Date("2026-08-13T22:30:00Z");
    const d = planTasks(lot("whatsapp", 25), { now: soir, timeZone: "UTC" });
    expect(jour(d, 0)).toHaveLength(0);
    expect(jour(d, 1)).toHaveLength(DAILY_QUOTA.whatsapp);
    expect(jour(d, 2)).toHaveLength(5);
  });

  it("garde le jour ouvert juste avant la coupure", () => {
    const d = planTasks(lot("whatsapp", 3), { now: new Date("2026-08-13T21:59:00Z"), timeZone: "UTC" });
    expect(jour(d, 0)).toHaveLength(3);
  });

  it("passe les plus anciennes échéances en premier", () => {
    const d = plan([
      t("recent", iso("2026-08-13")),
      t("vieux", iso("2026-08-01")),
      t("moyen", iso("2026-08-07")),
    ]);
    expect(ids(jour(d, 0))).toEqual(["vieux", "moyen", "recent"]);
  });

  it("planifie quand même une tâche sans échéance, en fin de file", () => {
    const d = plan([t("sansdate", null), t("date", iso("2026-08-12"))]);
    expect(ids(jour(d, 0))).toEqual(["date", "sansdate"]);
  });

  it("ne plafonne pas l'attente de réponse : elle ne coûte aucun effort", () => {
    const d = plan(lot("wait", 40));
    expect(jour(d, 0)).toHaveLength(40);
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("n'affecte jamais une tâche à deux journées", () => {
    const tasks = [...lot("whatsapp", 45), ...lot("call", 3), t("chaud", iso("2026-08-30"), "call", { callWhen: "maintenant", score: 90 })];
    const d = plan(tasks);
    const total = d.reduce((n, j) => n + j.tasks.length, 0);
    expect(total).toBe(tasks.length);
  });
});

describe("planTasks — la discussion en cours échappe au plan", () => {
  it("sort du quota un message dont le prospect a déjà répondu", () => {
    // Le cas qui faisait mal : la journée est pleine de premiers contacts, et
    // l'étape « envoie-lui le site démo » — déclenchée par SA réponse — se
    // retrouvait planifiée au lendemain. On ne fait pas attendre un prospect
    // qui vient d'écrire.
    const d = plan([...lot("whatsapp", DAILY_QUOTA.whatsapp), enDiscussion("suite", iso("2026-08-13"))]);
    expect(ids(jour(d, 0))[0]).toBe("suite");
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("n'a aucun plafond : cent discussions restent cent discussions", () => {
    const d = plan(Array.from({ length: 100 }, (_, i) => enDiscussion(`d-${i}`, iso("2026-08-12"))));
    expect(jour(d, 0)).toHaveLength(100);
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("garde les APPELS dans la cadence, même en discussion", () => {
    // Répondre à un message coûte une minute ; passer un appel, dix. Le
    // plafond des appels est une contrainte d'horloge, pas de volume sortant.
    const d = plan([...lot("call", DAILY_QUOTA.call), enDiscussion("appel", iso("2026-08-13"), "call")]);
    expect(countBySignal(jour(d, 0)).conversation).toBe(0);
    expect(ids(jour(d, 1))).toEqual(["appel"]);
  });

  it("ouvre la journée par les signaux, dans l'ordre de priorité", () => {
    const d = plan([
      t("froid", iso("2026-08-01")),
      enDiscussion("discussion", iso("2026-08-13")),
      t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 80 }),
      t("manque", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 75, missed: true }),
    ]);
    expect(ids(jour(d, 0))).toEqual(["manque", "discussion", "chaud", "froid"]);
    expect(firstPlannedTask(d)).toMatchObject({ id: "manque" });
  });

  it("ne bascule pas une attente en discussion : il n'y a rien à y faire", () => {
    const d = plan([{ ...t("w", iso("2026-08-13"), "wait"), in_conversation: true }]);
    expect(countBySignal(jour(d, 0)).conversation).toBe(0);
    expect(ids(jour(d, 0))).toEqual(["w"]);
  });

  it("traite les plus anciennes réponses d'abord", () => {
    const d = plan([
      enDiscussion("recent", iso("2026-08-13")),
      enDiscussion("vieux", iso("2026-08-09")),
    ]);
    expect(ids(jour(d, 0))).toEqual(["vieux", "recent"]);
  });
});

describe("signalOf — les signaux passent devant la cadence", () => {
  it("remonte un prospect chaud en tête, même si sa séquence le prévoit plus tard", () => {
    const d = plan([t("froid", iso("2026-08-13")), t("chaud", iso("2026-08-30"), "call", { callWhen: "maintenant", score: 90 })]);
    expect(ids(jour(d, 0))).toEqual(["chaud", "froid"]);
    expect(d).toHaveLength(1);
  });

  it("considère « aujourd'hui » comme chaud, pas seulement « maintenant »", () => {
    expect(signalOf(t("a", iso("2026-08-30"), "call", { callWhen: "aujourdhui", score: 70 }))).toBe("hot");
  });

  it("ignore le quota du jour : un signal chaud se rappelle même journée pleine", () => {
    const d = plan([...lot("call", DAILY_QUOTA.call), t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 90 })]);
    expect(ids(jour(d, 0))[0]).toBe("chaud");
    expect(jour(d, 0)).toHaveLength(DAILY_QUOTA.call + 1);
  });

  it("ne remonte PAS un signal tiède : J+1 repasse par le plan", () => {
    const tiede = t("tiede", iso("2026-08-14"), "whatsapp", { callWhen: "j1", score: 40 });
    expect(signalOf(tiede)).toBeNull();
    expect(ids(jour(plan([tiede]), 0))).toEqual(["tiede"]);
  });

  it("passe le signal chaud non rappelé avant les chauds du jour", () => {
    const chaud = t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 80 });
    const manque = t("manque", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 75, missed: true });
    expect(signalOf(manque)).toBe("missed");
    expect(signalOf(chaud)).toBe("hot");
    expect(firstPlannedTask(plan([chaud, manque]))).toMatchObject({ id: "manque" });
  });

  it("compte les signaux d'une journée, pour les pastilles de filtre", () => {
    const d = plan([
      enDiscussion("d1", iso("2026-08-13")),
      enDiscussion("d2", iso("2026-08-13")),
      t("chaud", iso("2026-08-13"), "call", { callWhen: "maintenant", score: 80 }),
      t("froid", iso("2026-08-13")),
    ]);
    expect(countBySignal(jour(d, 0))).toEqual({ missed: 0, conversation: 2, hot: 1 });
  });
});

describe("planTasks — la cadence se règle par agent", () => {
  it("tient une campagne à 40 appels par jour quand l'agent est réglé ainsi", () => {
    // Le cas de la campagne : 100 entreprises par jour ne rentrent pas dans les
    // 20 appels du défaut, et ce qui ne rentre pas ne s'affiche pas.
    const d = plan(lot("call", 40), { quotas: { call: 40, whatsapp: 60, linkedin: 20 } });
    expect(jour(d, 0)).toHaveLength(40);
    expect(jour(d, 1)).toHaveLength(0);
  });

  it("étale sur la cadence réglée, pas sur le défaut", () => {
    const d = plan(lot("whatsapp", 90), { quotas: { call: 20, whatsapp: 60, linkedin: 20 } });
    expect(jour(d, 0)).toHaveLength(60);
    expect(jour(d, 1)).toHaveLength(30);
  });

  it("garde le défaut pour les canaux que le réglage ne nomme pas", () => {
    // Un réglage partiel règle ce qu'il nomme : régler les WhatsApp ne doit pas
    // déplafonner les appels au passage.
    const quotas = normaliseQuotas({ whatsapp: 60 })!;
    const d = plan([...lot("whatsapp", 60), ...lot("call", 25)], { quotas });
    expect(countByKind(jour(d, 0)).whatsapp).toBe(60);
    expect(countByKind(jour(d, 0)).call).toBe(DAILY_QUOTA.call);
    expect(countByKind(jour(d, 1)).call).toBe(25 - DAILY_QUOTA.call);
  });

  it("laisse l'attente de réponse hors cadence, quel que soit le réglage", () => {
    const d = plan(lot("wait", 40), { quotas: { call: 40 } });
    expect(jour(d, 0)).toHaveLength(40);
  });

  it("retombe sur le défaut quand aucun réglage n'est fourni", () => {
    expect(quotaOf("call")).toBe(DAILY_QUOTA.call);
    expect(quotaOf("call", { whatsapp: 60 })).toBe(DAILY_QUOTA.call);
    expect(quotaOf("wait", { call: 40 })).toBeNull();
  });
});

describe("normaliseQuotas — un réglage fautif ne doit jamais vider la file", () => {
  it("accepte un réglage propre et le pose sur le défaut", () => {
    expect(normaliseQuotas({ call: 40, whatsapp: 60 })).toEqual({
      ...DAILY_QUOTA,
      call: 40,
      whatsapp: 60,
    });
  });

  it("refuse un quota nul ou négatif — il ferait disparaître la journée entière", () => {
    // Avec un quota de 0, `planTasks` repousserait chaque tâche au lendemain,
    // et le lendemain au surlendemain : la file ne rouvrirait jamais.
    expect(normaliseQuotas({ call: 0 })).toBeNull();
    expect(normaliseQuotas({ call: -5 })).toBeNull();
    const secours = normaliseQuotas({ call: 0 }) ?? DAILY_QUOTA;
    expect(jour(plan(lot("call", 25), { quotas: secours }), 0)).toHaveLength(DAILY_QUOTA.call);
  });

  it("refuse ce qui n'est pas un nombre, et ce qui n'est pas un objet", () => {
    expect(normaliseQuotas({ call: "vingt" })).toBeNull();
    expect(normaliseQuotas({ call: null })).toBeNull();
    expect(normaliseQuotas([40, 20, 20])).toBeNull();
    expect(normaliseQuotas("40")).toBeNull();
    expect(normaliseQuotas(null)).toBeNull();
    expect(normaliseQuotas(undefined)).toBeNull();
    expect(normaliseQuotas({})).toBeNull();
  });

  it("refuse un chiffre hors d'échelle — un zéro de trop n'est pas une cadence", () => {
    expect(normaliseQuotas({ call: 100000 })).toBeNull();
  });

  it("accepte un nombre écrit en toutes lettres numériques, et tronque les décimales", () => {
    // Le jsonb est souvent saisi à la main : `{"call": "40"}` est une bonne
    // intention, pas une faute qu'il faudrait punir d'un retour au défaut.
    expect(normaliseQuotas({ call: "40" })?.call).toBe(40);
    expect(normaliseQuotas({ call: 40.9 })?.call).toBe(40);
  });

  it("ne retient que les canaux valides d'un réglage à moitié fautif", () => {
    // `{"call": 0, "whatsapp": 60}` : les WhatsApp passent, les appels
    // retombent sur le défaut plutôt que d'emporter tout le réglage.
    expect(normaliseQuotas({ call: 0, whatsapp: 60 })).toEqual({ ...DAILY_QUOTA, whatsapp: 60 });
  });

  it("ignore les clés qui ne sont pas des canaux plafonnés", () => {
    expect(normaliseQuotas({ email: 999, wait: 5 })).toBeNull();
    expect(normaliseQuotas({ email: 999, call: 40 })).toEqual({ ...DAILY_QUOTA, call: 40 });
  });
});

describe("cadenceEffective — le plan et le rail lisent le même chiffre", () => {
  it("rend une cadence utilisable quoi qu'on lui donne", () => {
    expect(cadenceEffective({ call: 40 })).toEqual({ ...DAILY_QUOTA, call: 40 });
    expect(cadenceEffective(null)).toEqual(DAILY_QUOTA);
    expect(cadenceEffective({ call: 0 })).toEqual(DAILY_QUOTA);
  });

  it("plafonne la journée à ce que le rail affichera", () => {
    // C'est TOUT l'enjeu de cette fonction : l'écran lit `meta.quotas` pour
    // écrire « /60 » en tête de rail, et le plan doit répartir sur 60. Tant que
    // le plan retombait sur `DAILY_QUOTA`, quarante entreprises du jour
    // basculaient au lendemain derrière un compteur qui annonçait 60.
    const cadence = cadenceEffective({ call: 60 });
    const d = plan(lot("call", 60), { quotas: cadence });
    expect(jour(d, 0)).toHaveLength(60);
    expect(jour(d, 1)).toHaveLength(0);
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

describe("dayOfTask", () => {
  it("retrouve la journée d'une tâche, pour que l'onglet suive la sélection", () => {
    const d = plan(lot("whatsapp", 25));
    expect(dayOfTask(d, "whatsapp-0")).toBe("2026-08-13");
    expect(dayOfTask(d, "whatsapp-24")).toBe("2026-08-14");
    expect(dayOfTask(d, "inconnu")).toBeNull();
  });
});
