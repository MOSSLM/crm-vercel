import {
  CADRE_PAR_DEFAUT,
  cibleContactsDepuisQuotas,
  classifyEtape,
  joursRestants,
  lireCadreSprint,
  progression,
  rythmeRequisCents,
} from "../agent-sprint";

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

describe("lireCadreSprint — le sprint se règle sans redéployer", () => {
  it("retombe sur la campagne du 17 au 26 août quand rien n'est réglé", () => {
    expect(lireCadreSprint({})).toEqual(CADRE_PAR_DEFAUT);
    expect(CADRE_PAR_DEFAUT.deadline).toBe("2026-08-26");
    expect(CADRE_PAR_DEFAUT.cibleContactsJour).toBe(100);
  });

  it("prend les quatre valeurs de l'environnement", () => {
    expect(
      lireCadreSprint({
        SPRINT_OBJECTIF_CENTS: "500000",
        SPRINT_DEBUT: "2026-09-01",
        SPRINT_DEADLINE: "2026-09-30",
        SPRINT_CIBLE_CONTACTS_JOUR: "60",
      }),
    ).toEqual({
      objectifCents: 500000,
      debut: "2026-09-01",
      deadline: "2026-09-30",
      cibleContactsJour: 60,
    });
  });

  // Une faute de frappe dans une variable Vercel ne doit pas vider l'écran :
  // mieux vaut le cadre par défaut qu'un objectif à zéro (100 % dès le départ)
  // ou une échéance « Invalid Date » (rythme requis incalculable).
  it("ignore ce qui n'est pas lisible plutôt que de le propager", () => {
    const cadre = lireCadreSprint({
      SPRINT_OBJECTIF_CENTS: "0",
      SPRINT_DEBUT: "17/08/2026",
      SPRINT_DEADLINE: "2026-08-32",
      SPRINT_CIBLE_CONTACTS_JOUR: "-5",
    });
    expect(cadre).toEqual(CADRE_PAR_DEFAUT);
  });

  it("refuse une échéance antérieure au début", () => {
    const cadre = lireCadreSprint({ SPRINT_DEBUT: "2026-08-17", SPRINT_DEADLINE: "2026-08-10" });
    expect(cadre.deadline).toBe("2026-08-17");
  });
});

describe("cibleContactsDepuisQuotas", () => {
  it("somme les quotas par canal — c'est ça, la cible du jour", () => {
    expect(cibleContactsDepuisQuotas({ call: 20, whatsapp: 60, linkedin: 20 })).toBe(100);
  });

  it("rend null quand rien n'est réglé, pour laisser la variable décider", () => {
    expect(cibleContactsDepuisQuotas(null)).toBeNull();
    expect(cibleContactsDepuisQuotas({})).toBeNull();
    expect(cibleContactsDepuisQuotas({ call: 0 })).toBeNull();
    expect(cibleContactsDepuisQuotas("60")).toBeNull();
  });

  it("compte la cadence RÉELLE de la file, défauts compris", () => {
    // Un réglage partiel ne déplafonne pas les autres canaux : la file
    // planifiera 60 WhatsApp + 20 appels + 20 LinkedIn. La cible du jour doit
    // dire 100, pas 60 — sinon l'écran sprint annonce une journée deux fois
    // plus courte que celle que la file distribue.
    expect(cibleContactsDepuisQuotas({ whatsapp: 60 })).toBe(100);
  });

  it("ignore une valeur illisible sans perdre les autres", () => {
    // `whatsapp` retombe sur son défaut (20), il ne disparaît pas du total.
    expect(cibleContactsDepuisQuotas({ call: 20, whatsapp: "beaucoup" })).toBe(60);
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
