import {
  dayStartIso,
  summarizeMarketingBoard,
  summarizeQualification,
  weekStartIso,
} from "../agent-progress";

describe("summarizeMarketingBoard", () => {
  it("répartit les entreprises sur l'étape en cours et compte les terminées", () => {
    const progress = summarizeMarketingBoard([
      { column: 1 }, // enrichissement
      { column: 1 },
      { column: 3 }, // site démo
      { column: 4 }, // audit
      { column: 5 }, // terminée
    ]);

    expect(progress.total).toBe(5);
    expect(progress.par_etape).toEqual({ enrich: 2, validation: 0, site: 1, audit: 1 });
    expect(progress.terminees).toBe(1);
    expect(progress.en_cours).toBe(4);
  });

  it("compte les étapes franchies, pas les entreprises livrées", () => {
    // 0 + 2 + 4 étapes sur 3 × 4 possibles.
    const progress = summarizeMarketingBoard([{ column: 1 }, { column: 3 }, { column: 5 }]);

    expect(progress.etapes_faites).toBe(6);
    expect(progress.etapes_total).toBe(12);
    expect(progress.pourcentage).toBe(50);
  });

  it("ne divise pas par zéro sur un board vide", () => {
    expect(summarizeMarketingBoard([])).toMatchObject({
      total: 0,
      terminees: 0,
      etapes_faites: 0,
      pourcentage: 0,
    });
  });

  it("borne une colonne absente ou hors plage sur la première étape", () => {
    const progress = summarizeMarketingBoard([{ column: null }, {}, { column: 12 }]);

    expect(progress.par_etape.enrich).toBe(2);
    expect(progress.terminees).toBe(1);
  });
});

describe("summarizeQualification", () => {
  const counts = {
    traitees: 40,
    qualifiees: 30,
    en_attente: 10,
    validees: 27,
    aujourdhui: 6,
    semaine: 18,
    file_restante: 320,
  };

  it("déduit les masquées, les revues et les corrigées", () => {
    const progress = summarizeQualification(counts);

    expect(progress.masquees).toBe(10);
    expect(progress.revues).toBe(30);
    expect(progress.corrigees).toBe(3);
  });

  it("calcule la précision sur les décisions revues et le taux sur le total", () => {
    const progress = summarizeQualification(counts);

    expect(progress.precision).toBe(90); // 27 / 30
    expect(progress.taux_qualification).toBe(75); // 30 / 40
  });

  it("renvoie null plutôt que 0 % quand il n'y a rien à rapporter", () => {
    const progress = summarizeQualification({
      traitees: 0,
      qualifiees: 0,
      en_attente: 0,
      validees: 0,
      aujourdhui: 0,
      semaine: 0,
      file_restante: 12,
    });

    expect(progress.precision).toBeNull();
    expect(progress.taux_qualification).toBeNull();
  });

  it("ne descend jamais sous zéro sur des compteurs incohérents", () => {
    // Une décision peut être prise entre deux `count` : les totaux ne sont pas
    // atomiques, et l'UI ne doit pas afficher -1.
    const progress = summarizeQualification({
      traitees: 10,
      qualifiees: 11,
      en_attente: 12,
      validees: 0,
      aujourdhui: 0,
      semaine: 0,
      file_restante: 0,
    });

    expect(progress.masquees).toBe(0);
    expect(progress.revues).toBe(0);
    expect(progress.corrigees).toBe(0);
  });
});

describe("bornes de temps", () => {
  it("prend minuit à Paris, pas minuit UTC", () => {
    // 22h30 UTC en été = 00h30 le lendemain à Paris (UTC+2).
    const now = new Date("2026-07-27T22:30:00.000Z");

    expect(dayStartIso(now)).toBe("2026-07-27T22:00:00.000Z"); // 28/07 00h00 à Paris
  });

  it("suit le décalage d'hiver", () => {
    // Paris est à UTC+1 en janvier.
    const now = new Date("2026-01-15T10:00:00.000Z");

    expect(dayStartIso(now)).toBe("2026-01-14T23:00:00.000Z"); // 15/01 00h00 à Paris
  });

  it("fait démarrer la semaine le lundi", () => {
    // Mercredi 15 juillet 2026, 10h UTC.
    const now = new Date("2026-07-15T10:00:00.000Z");

    expect(weekStartIso(now)).toBe("2026-07-12T22:00:00.000Z"); // lundi 13/07 00h00 à Paris
  });

  it("garde le dimanche dans la semaine qui s'achève", () => {
    // Dimanche 19 juillet 2026, 20h UTC (22h à Paris).
    const now = new Date("2026-07-19T20:00:00.000Z");

    expect(weekStartIso(now)).toBe("2026-07-12T22:00:00.000Z");
  });
});
