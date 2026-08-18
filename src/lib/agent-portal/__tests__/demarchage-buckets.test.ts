import {
  DAILY_QUOTA,
  cadenceEffective,
  countByKind,
  countBySignal,
  dayOfTask,
  estPremierContact,
  firstPlannedTask,
  hasSignal,
  isLate,
  isSetAside,
  joursReels,
  normaliseQuotas,
  ordreDePassage,
  quotaOf,
  separerFile,
  signalOf,
  signalsOf,
} from "../demarchage-buckets";

const NOW = new Date("2026-08-13T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

type T = {
  id: string;
  kind?: string;
  status?: string;
  due_at: string | null;
  in_conversation?: boolean;
  premiere_touche_le?: string | null;
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};

/** Un premier contact : personne n'a jamais touché cette entreprise. */
const t = (id: string, due: string | null, kind = "whatsapp", intent?: T["intent"]): T => ({
  id,
  kind,
  due_at: due,
  intent,
});

/** Une relance : l'entreprise a déjà été abordée. */
const relance = (id: string, due: string | null, kind = "whatsapp"): T => ({
  ...t(id, due, kind),
  premiere_touche_le: iso("2026-08-01"),
});

/** Une tâche dont le prospect a déjà répondu — la discussion est ouverte. */
const enDiscussion = (id: string, due: string | null, kind = "whatsapp"): T => ({
  ...relance(id, due, kind),
  in_conversation: true,
});

/** Une tâche mise de côté : replanifiée à une date, pas fermée. */
const deCote = (id: string, retour: string, kind = "whatsapp"): T => ({
  ...relance(id, retour, kind),
  status: "snoozed",
  due_at: iso(retour),
});

/** N tâches d'un même canal, toutes échues. */
const lot = (kind: string, n: number, prefix = kind): T[] =>
  Array.from({ length: n }, (_, i) => t(`${prefix}-${i}`, iso("2026-08-10"), kind));

const cal = (tasks: T[]) => joursReels(tasks, { now: NOW, timeZone: "UTC" });
const jour = (days: ReturnType<typeof cal>, offset: number) =>
  days.find((d) => d.offset === offset)?.tasks ?? [];
const ids = (tasks: T[]) => tasks.map((x) => x.id);

/**
 * LES DEUX FILES.
 *
 * Ce que ces tests protègent : un premier contact et une relance ne se
 * travaillent pas pareil, et la frontière n'est pas une heuristique — c'est
 * `premiere_touche_le`, la même colonne que celle qui sert à comparer les
 * cohortes. Se tromper de côté se paie soit par un stock de prospects neufs
 * noyé dans les relances du jour, soit par une discussion ouverte rangée avec
 * les inconnus.
 */
describe("estPremierContact — jamais touchée par personne", () => {
  it("range une entreprise sans première touche dans les premiers contacts", () => {
    expect(estPremierContact(t("a", iso("2026-08-13")))).toBe(true);
  });

  it("sort tout ce qui a déjà été abordé", () => {
    expect(estPremierContact(relance("a", iso("2026-08-13")))).toBe(false);
  });

  it("n'appelle jamais premier contact une attente de réponse", () => {
    // On n'attend une réponse qu'après avoir écrit : la première touche a eu
    // lieu, même si la colonne n'a pas encore été relue.
    expect(estPremierContact({ id: "w", kind: "wait", due_at: iso("2026-08-13") })).toBe(false);
  });

  it("ni une discussion ouverte", () => {
    expect(
      estPremierContact({ id: "d", kind: "whatsapp", due_at: null, in_conversation: true }),
    ).toBe(false);
  });
});

describe("separerFile — deux files, jamais un mélange", () => {
  it("répartit chaque ligne d'un côté ou de l'autre, sans en perdre", () => {
    const tasks = [t("neuf1", iso("2026-08-13")), relance("suivi1", iso("2026-08-13")), t("neuf2", null)];
    const { premiers, relances } = separerFile(tasks);
    expect(ids(premiers).sort()).toEqual(["neuf1", "neuf2"]);
    expect(ids(relances)).toEqual(["suivi1"]);
    expect(premiers.length + relances.length).toBe(tasks.length);
  });

  it("rend les premiers contacts DANS l'ordre de passage", () => {
    const { premiers } = separerFile([
      t("recent", iso("2026-08-13")),
      t("vieux", iso("2026-08-01")),
      t("chaud", iso("2026-08-30"), "call", { callWhen: "maintenant", score: 90 }),
    ]);
    expect(ids(premiers)).toEqual(["chaud", "vieux", "recent"]);
  });

  it("ne plafonne rien : cent premiers contacts restent cent", () => {
    // C'est le point de la refonte. L'ancien plan en gardait vingt et poussait
    // les quatre-vingts autres au lendemain — il cachait le travail qu'on
    // venait de décider de faire.
    const { premiers } = separerFile(lot("whatsapp", 100));
    expect(premiers).toHaveLength(100);
  });
});

/**
 * LE CALENDRIER DES RELANCES.
 *
 * Chaque ligne à la date où elle est due, l'échu replié sur aujourd'hui. Rien
 * n'est déplacé pour tenir dans un quota : c'est toute la différence avec le
 * plan qu'il remplace.
 */
describe("joursReels — la date est la date", () => {
  it("garde aujourd'hui, même vide", () => {
    expect(cal([]).map((j) => j.date)).toEqual(["2026-08-13"]);
  });

  it("place chaque relance à son jour", () => {
    const d = cal([
      relance("auj", iso("2026-08-13")),
      relance("dem", iso("2026-08-14")),
      relance("j7", iso("2026-08-20")),
    ]);
    expect(ids(jour(d, 0))).toEqual(["auj"]);
    expect(ids(jour(d, 1))).toEqual(["dem"]);
    expect(ids(jour(d, 7))).toEqual(["j7"]);
  });

  it("replie l'échu sur aujourd'hui — une relance en retard est du travail du jour", () => {
    const d = cal([relance("vieux", iso("2026-08-01")), relance("hier", iso("2026-08-12"))]);
    expect(ids(jour(d, 0))).toEqual(["vieux", "hier"]);
    expect(d).toHaveLength(1);
  });

  it("n'invente aucune journée vide entre deux journées pleines", () => {
    const d = cal([relance("auj", iso("2026-08-13")), relance("loin", iso("2026-08-20"))]);
    expect(d.map((j) => j.offset)).toEqual([0, 7]);
  });

  it("ne déplace RIEN pour tenir un quota", () => {
    // Quarante relances dues aujourd'hui sont quarante relances aujourd'hui :
    // sans plafond, on répond à qui a réagi.
    const d = cal(Array.from({ length: 40 }, (_, i) => relance(`r${i}`, iso("2026-08-13"))));
    expect(jour(d, 0)).toHaveLength(40);
    expect(d).toHaveLength(1);
  });

  it("range une mise de côté au jour de son retour", () => {
    const d = cal([deCote("range", "2026-08-20")]);
    expect(ids(jour(d, 0))).toEqual([]);
    expect(ids(jour(d, 7))).toEqual(["range"]);
  });

  it("ouvre la journée par les signaux, dans l'ordre de priorité", () => {
    const d = cal([
      relance("froid", iso("2026-08-01")),
      enDiscussion("discussion", iso("2026-08-13")),
      { ...relance("chaud", iso("2026-08-13"), "call"), intent: { callWhen: "maintenant", score: 80 } },
      {
        ...relance("manque", iso("2026-08-13"), "call"),
        intent: { callWhen: "maintenant", score: 75, missed: true },
      },
    ]);
    expect(ids(jour(d, 0))).toEqual(["manque", "discussion", "chaud", "froid"]);
    expect(firstPlannedTask(d)).toMatchObject({ id: "manque" });
  });

  it("passe une tâche sans échéance dans la journée du jour, en dernier", () => {
    const d = cal([relance("sansdate", null), relance("date", iso("2026-08-12"))]);
    expect(ids(jour(d, 0))).toEqual(["date", "sansdate"]);
  });
});

describe("ordreDePassage — un tri, pas un plan", () => {
  it("ne retire ni ne regroupe rien", () => {
    const tasks = lot("whatsapp", 37);
    expect(ordreDePassage(tasks)).toHaveLength(37);
  });

  it("passe les signaux devant, puis la plus ancienne échéance", () => {
    expect(
      ids(
        ordreDePassage([
          t("recent", iso("2026-08-13")),
          t("vieux", iso("2026-08-01")),
          t("chaud", iso("2026-08-30"), "call", { callWhen: "aujourdhui", score: 70 }),
        ]),
      ),
    ).toEqual(["chaud", "vieux", "recent"]);
  });
});

/**
 * LES SIGNAUX SE CUMULENT.
 *
 * C'est le défaut que ces tests ferment : `signalOf` n'en rendait qu'un — le
 * premier de la liste de priorité — et la pastille « Chauds » ne comptait donc
 * pas les prospects chauds déjà en discussion. Le filtre annonçait trois leads
 * quand la journée en portait huit, et le prospect disparaissait de « Chauds »
 * au moment précis où il devenait intéressant : quand il répondait.
 */
describe("signalsOf — un prospect peut être plusieurs choses à la fois", () => {
  const chaudEtEnDiscussion: T = {
    ...enDiscussion("d", iso("2026-08-13")),
    intent: { callWhen: "maintenant", score: 90 },
  };

  it("rend TOUS les signaux portés", () => {
    expect(signalsOf(chaudEtEnDiscussion)).toEqual(["conversation", "hot"]);
  });

  it("garde un dominant pour la teinte et l'ordre", () => {
    expect(signalOf(chaudEtEnDiscussion)).toBe("conversation");
  });

  it("répond « oui » aux deux questions de filtre, pas seulement à la dominante", () => {
    expect(hasSignal(chaudEtEnDiscussion, "conversation")).toBe(true);
    expect(hasSignal(chaudEtEnDiscussion, "hot")).toBe(true);
    expect(hasSignal(chaudEtEnDiscussion, "missed")).toBe(false);
  });

  it("cumule les trois quand les trois sont vraies", () => {
    const tout: T = {
      ...enDiscussion("x", iso("2026-08-13")),
      intent: { callWhen: "maintenant", score: 90, missed: true },
    };
    expect(signalsOf(tout)).toEqual(["missed", "conversation", "hot"]);
  });

  it("ne bascule pas une attente en discussion : il n'y a rien à y faire", () => {
    expect(
      signalsOf({ id: "w", kind: "wait", due_at: iso("2026-08-13"), in_conversation: true }),
    ).toEqual([]);
  });

  it("considère « aujourd'hui » comme chaud, pas seulement « maintenant »", () => {
    expect(signalOf(t("a", iso("2026-08-30"), "call", { callWhen: "aujourdhui", score: 70 }))).toBe("hot");
  });

  it("ne remonte PAS un signal tiède", () => {
    expect(signalOf(t("tiede", iso("2026-08-14"), "whatsapp", { callWhen: "j1", score: 40 }))).toBeNull();
  });
});

describe("countBySignal — le compte des pastilles est le compte réel", () => {
  it("compte un prospect dans CHAQUE pastille qu'il mérite", () => {
    // La somme des pastilles peut dépasser le nombre de lignes, et c'est exact :
    // deux chauds dont un en discussion font bien deux chauds.
    const par = countBySignal([
      { ...enDiscussion("d", iso("2026-08-13")), intent: { callWhen: "maintenant", score: 90 } },
      { ...relance("c", iso("2026-08-13"), "call"), intent: { callWhen: "maintenant", score: 80 } },
    ]);
    expect(par).toEqual({ missed: 0, conversation: 1, hot: 2 });
  });

  it("ne compte rien là où il n'y a rien", () => {
    expect(countBySignal(lot("whatsapp", 3))).toEqual({ missed: 0, conversation: 0, hot: 0 });
  });
});

describe("countByKind", () => {
  it("compte chaque canal séparément", () => {
    expect(countByKind([...lot("call", 3), ...lot("whatsapp", 5)])).toEqual({ call: 3, whatsapp: 5 });
  });
});

/**
 * LA MISE DE CÔTÉ — ni un oui, ni un non.
 *
 * Un prospect qu'on range NE REVIENT PAS avant sa date. La lecture du STATUT
 * est ce qui distingue le geste d'une simple échéance future : sans elle, toute
 * relance planifiée passerait pour une mise de côté.
 */
describe("isSetAside — reconnaître un prospect rangé", () => {
  it("reconnaît une tâche replanifiée à une date à venir", () => {
    expect(isSetAside(deCote("a", "2026-09-10"), NOW, "UTC")).toBe(true);
  });

  it("ne range que ce qui a été rangé EXPRÈS", () => {
    expect(isSetAside(relance("r", iso("2026-08-20")), NOW, "UTC")).toBe(false);
  });

  it("cesse de la ranger le jour où elle revient", () => {
    expect(isSetAside(deCote("a", "2026-08-13"), NOW, "UTC")).toBe(false);
    expect(isSetAside(deCote("b", "2026-08-01"), NOW, "UTC")).toBe(false);
  });

  it("ne range pas une tâche sans échéance", () => {
    expect(isSetAside({ id: "a", kind: "call", status: "snoozed", due_at: null }, NOW, "UTC")).toBe(
      false,
    );
  });
});

describe("isLate — l'échéance dépassée reste dite, sur la ligne", () => {
  it("marque une relance dont la date est passée", () => {
    expect(isLate(relance("a", iso("2026-08-10")), NOW, "UTC")).toBe(true);
  });

  it("ne marque pas une tâche du jour ni une tâche à venir", () => {
    expect(isLate(relance("a", iso("2026-08-13")), NOW, "UTC")).toBe(false);
    expect(isLate(relance("b", iso("2026-08-20")), NOW, "UTC")).toBe(false);
  });

  it("ne marque jamais une attente de réponse : son `due_at` n'est qu'une mise en pause", () => {
    expect(isLate({ id: "w", kind: "wait", due_at: iso("2026-07-01") }, NOW, "UTC")).toBe(false);
  });

  it("ne marque pas une tâche sans échéance", () => {
    expect(isLate(relance("a", null), NOW, "UTC")).toBe(false);
  });
});

/**
 * L'OBJECTIF QUOTIDIEN — un rythme affiché, plus un plafond.
 *
 * Le réglage vient d'un `jsonb` libre : il se relit, il ne se croit pas. Une
 * valeur aberrante coûte le retour au défaut, jamais un « /0 » à l'écran.
 */
describe("normaliseQuotas", () => {
  it("accepte un réglage propre et le pose sur le défaut", () => {
    expect(normaliseQuotas({ call: 40, whatsapp: 60 })).toEqual({
      ...DAILY_QUOTA,
      call: 40,
      whatsapp: 60,
    });
  });

  it("refuse un objectif nul ou négatif", () => {
    expect(normaliseQuotas({ call: 0 })).toBeNull();
    expect(normaliseQuotas({ call: -5 })).toBeNull();
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

  it("refuse un chiffre hors d'échelle — un zéro de trop n'est pas un rythme", () => {
    expect(normaliseQuotas({ call: 100000 })).toBeNull();
  });

  it("accepte un nombre écrit en toutes lettres numériques, et tronque les décimales", () => {
    expect(normaliseQuotas({ call: "40" })?.call).toBe(40);
    expect(normaliseQuotas({ call: 40.9 })?.call).toBe(40);
  });

  it("ne retient que les canaux valides d'un réglage à moitié fautif", () => {
    expect(normaliseQuotas({ call: 0, whatsapp: 60 })).toEqual({ ...DAILY_QUOTA, whatsapp: 60 });
  });

  it("ignore les clés qui ne sont pas des canaux à objectif", () => {
    expect(normaliseQuotas({ email: 999, wait: 5 })).toBeNull();
    expect(normaliseQuotas({ email: 999, call: 40 })).toEqual({ ...DAILY_QUOTA, call: 40 });
  });
});

describe("cadenceEffective / quotaOf", () => {
  it("rend un objectif utilisable quoi qu'on lui donne", () => {
    expect(cadenceEffective({ call: 40 })).toEqual({ ...DAILY_QUOTA, call: 40 });
    expect(cadenceEffective(null)).toEqual(DAILY_QUOTA);
    expect(cadenceEffective({ call: 0 })).toEqual(DAILY_QUOTA);
  });

  it("retombe canal par canal sur le défaut", () => {
    expect(quotaOf("call")).toBe(DAILY_QUOTA.call);
    expect(quotaOf("call", { whatsapp: 60 })).toBe(DAILY_QUOTA.call);
    expect(quotaOf("wait", { call: 40 })).toBeNull();
  });
});

describe("dayOfTask", () => {
  it("retrouve la journée d'une tâche, pour que le calendrier suive la sélection", () => {
    const d = cal([relance("auj", iso("2026-08-13")), deCote("range", "2026-08-20")]);
    expect(dayOfTask(d, "auj")).toBe("2026-08-13");
    expect(dayOfTask(d, "range")).toBe("2026-08-20");
    expect(dayOfTask(d, "inconnu")).toBeNull();
  });
});
