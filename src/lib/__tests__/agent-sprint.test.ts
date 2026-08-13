import { classifyEtape, joursRestants, progression, rythmeRequisCents } from "../agent-sprint";

describe("classifyEtape — ce qui compte comme argent rentré", () => {
  it("reconnaît l'acompte comme encaissé", () => {
    expect(classifyEtape("Acompte")).toBe("encaisse");
  });

  it("ne compte PAS une signature comme encaissée", () => {
    // Signer n'est pas payer : confondre les deux gonflerait le chiffre.
    expect(classifyEtape("Signature")).toBe("gagne");
    expect(classifyEtape("Client signé")).toBe("gagne");
  });

  it("classe devis et signature comme décisions en cours", () => {
    expect(classifyEtape("Devis")).toBe("en_decision");
  });

  it("traite perdu et lost comme terminaux, dans les deux langues du CRM", () => {
    expect(classifyEtape("Perdu")).toBe("perdu");
    expect(classifyEtape("Lost")).toBe("perdu");
  });

  it("ne classe pas une étape de relance comme gagnée", () => {
    ["Qualifié", "Approche", "Relance 1", "RDV 1", "RDV de vente 2", "En attente", "LM Déployé"].forEach((n) =>
      expect(classifyEtape(n)).toBe("en_cours"),
    );
  });

  it("donne la priorité au perdu, même si l'intitulé parle de signature", () => {
    expect(classifyEtape("Perdu après signature")).toBe("perdu");
  });
});

describe("progression", () => {
  it("va de 0 à 1", () => {
    expect(progression(0, 200000)).toBe(0);
    expect(progression(100000, 200000)).toBe(0.5);
  });

  it("ne dépasse jamais 100 %, même en cas de dépassement", () => {
    expect(progression(500000, 200000)).toBe(1);
  });

  it("ne casse pas sur un objectif nul", () => {
    expect(progression(1000, 0)).toBe(0);
  });
});

describe("joursRestants", () => {
  it("compte les jours pleins jusqu'à l'échéance incluse", () => {
    expect(joursRestants("2026-08-20", new Date("2026-08-13T10:00:00Z"))).toBe(8);
  });

  it("vaut 0 une fois l'échéance passée, jamais un nombre négatif", () => {
    expect(joursRestants("2026-08-20", new Date("2026-08-25T10:00:00Z"))).toBe(0);
  });

  it("tolère une date invalide", () => {
    expect(joursRestants("pas-une-date", new Date())).toBe(0);
  });
});

describe("rythmeRequisCents", () => {
  it("répartit le reste sur les jours restants", () => {
    expect(rythmeRequisCents(0, 200000, 8)).toBe(25000);
  });

  it("ne réclame plus rien une fois l'objectif atteint", () => {
    expect(rythmeRequisCents(200000, 200000, 3)).toBeNull();
    expect(rythmeRequisCents(250000, 200000, 3)).toBeNull();
  });

  it("ne divise pas par zéro le dernier jour", () => {
    expect(rythmeRequisCents(0, 200000, 0)).toBe(200000);
  });
});
