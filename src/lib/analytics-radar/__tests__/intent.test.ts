import { compareIntent, hasSeparateVisitTimes, scoreIntent, type IntentSignals } from "../intent";

const base: IntentSignals = {
  sessions: 0,
  visitors: 0,
  engagementSec: 0,
  pageViews: 0,
  pages: [],
  devices: [],
  hours: [],
  days: [],
  formStarted: false,
  formSubmitted: false,
  auditViewed: false,
  awaitingReply: false,
  replied: false,
};
const sig = (o: Partial<IntentSignals>): IntentSignals => ({ ...base, ...o });

describe("scoreIntent — les cas de la grille commerciale", () => {
  it("aucun signal : rien à faire, et on le dit", () => {
    const v = scoreIntent(base);
    expect(v.tier).toBe("none");
    expect(v.flame).toBe("");
    expect(v.callWhen).toBe("plus_tard");
  });

  it("démo ouverte 8 secondes : tiède, pas chaud", () => {
    const v = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 8, pageViews: 1, pages: ["/"], devices: ["mobile"], hours: [14], days: ["2026-08-13"] }));
    expect(v.tier).toBe("tiede");
    expect(v.flame).toBe("🟡");
    expect(v.reasons.join(" ")).toMatch(/8 s seulement/);
  });

  it("1m42 + services + réalisations + contact : chaud", () => {
    const v = scoreIntent(
      sig({
        sessions: 1,
        visitors: 1,
        engagementSec: 102,
        pageViews: 4,
        pages: ["/", "/services", "/realisations", "/contact"],
        devices: ["desktop"],
        hours: [11],
        days: ["2026-08-13"],
      }),
    );
    expect(["chaud", "tres_chaud"]).toContain(v.tier);
    expect(v.flame).toContain("🔥");
  });

  it("visite à 13h puis retour à 18h : plus chaud qu'une seule visite équivalente", () => {
    const commun = { visitors: 1, engagementSec: 60, pageViews: 2, pages: ["/"], devices: ["mobile"] };
    const uneFois = scoreIntent(sig({ ...commun, sessions: 1, hours: [13], days: ["2026-08-13"] }));
    const deuxFois = scoreIntent(sig({ ...commun, sessions: 2, hours: [13, 18], days: ["2026-08-13"] }));
    expect(deuxFois.score).toBeGreaterThan(uneFois.score);
    expect(deuxFois.reasons.join(" ")).toMatch(/13 h puis 18 h/);
  });

  it("revient depuis un autre appareil le soir : le plus haut niveau", () => {
    const v = scoreIntent(
      sig({
        sessions: 2,
        visitors: 1,
        engagementSec: 150,
        pageViews: 5,
        pages: ["/", "/services", "/contact"],
        devices: ["mobile", "desktop"],
        hours: [12, 20],
        days: ["2026-08-12", "2026-08-13"],
        replied: true,
      }),
    );
    expect(v.tier).toBe("brulant");
    expect(v.flame).toBe("🔥🔥🔥");
    expect(v.callWhen).toBe("aujourdhui");
  });

  it("formulaire envoyé : on appelle maintenant, quoi qu'il arrive par ailleurs", () => {
    const v = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 30, pageViews: 2, pages: ["/"], formStarted: true, formSubmitted: true, hours: [9], days: ["2026-08-13"] }));
    expect(v.callWhen).toBe("maintenant");
    expect(v.reasons.join(" ")).toMatch(/envoyé le formulaire/);
  });

  it("formulaire commencé sans être envoyé : signal fort mais distinct de l'envoi", () => {
    const commence = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 40, pageViews: 2, pages: ["/"], formStarted: true, hours: [9], days: ["2026-08-13"] }));
    const envoye = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 40, pageViews: 2, pages: ["/"], formStarted: true, formSubmitted: true, hours: [9], days: ["2026-08-13"] }));
    expect(envoye.score).toBeGreaterThan(commence.score);
    expect(commence.reasons.join(" ")).toMatch(/sans l'envoyer/);
  });

  it("audit consulté en plus de la démo : compte comme un signal supplémentaire", () => {
    const sans = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 40, pageViews: 2, pages: ["/"], hours: [10], days: ["2026-08-13"] }));
    const avec = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 40, pageViews: 2, pages: ["/"], hours: [10], days: ["2026-08-13"], auditViewed: true }));
    expect(avec.score).toBeGreaterThan(sans.score);
    expect(avec.reasons.join(" ")).toMatch(/audit/);
  });

  it("a répondu mais n'a pas ouvert la démo : à rappeler, sans prétendre qu'il a visité", () => {
    const v = scoreIntent(sig({ replied: true }));
    expect(v.callWhen).toBe("j1");
    expect(v.reasons.join(" ")).toMatch(/pas encore ouverte/);
    expect(v.reasons.join(" ")).not.toMatch(/page|seconde/);
  });

  it("visite la démo sans répondre : signalé comme tel", () => {
    const v = scoreIntent(sig({ sessions: 1, visitors: 1, engagementSec: 45, pageViews: 2, pages: ["/"], hours: [10], days: ["2026-08-13"], awaitingReply: true }));
    expect(v.reasons.join(" ")).toMatch(/ne répond pas/);
  });

  it("ne donne jamais de raison sans mesure derrière", () => {
    const v = scoreIntent(base);
    expect(v.reasons).toEqual(["Aucun signal pour l'instant"]);
  });

  it("classe du plus chaud au moins chaud", () => {
    const rows = [{ score: 12 }, { score: 90 }, { score: 44 }];
    expect([...rows].sort(compareIntent).map((r) => r.score)).toEqual([90, 44, 12]);
  });
});

describe("hasSeparateVisitTimes", () => {
  it("une seule heure ne fait pas un retour", () => {
    expect(hasSeparateVisitTimes([14])).toBe(false);
  });
  it("deux visites rapprochées ne comptent pas comme un vrai retour", () => {
    expect(hasSeparateVisitTimes([14, 15])).toBe(false);
  });
  it("13 h puis 18 h compte", () => {
    expect(hasSeparateVisitTimes([13, 18])).toBe(true);
  });
  it("ne dépend pas de l'ordre", () => {
    expect(hasSeparateVisitTimes([18, 13])).toBe(true);
  });
});
