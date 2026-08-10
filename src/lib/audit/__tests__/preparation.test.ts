import { nombresDe, validerPreparation, type UniversDicible } from "../preparation";

/**
 * Ces tests gardent la dernière porte du dispositif.
 *
 * Tout le reste du chantier consiste à ne dire que ce qu'on a mesuré. Si un
 * modèle peut écrire n'importe quoi au dernier étage, le reste ne sert à rien.
 */

function univers(over: Partial<UniversDicible> = {}): UniversDicible {
  return {
    preuvesEnEchec: new Set(["ttfb", "viewport", "formulaire"]),
    constatsEmis: new Set(["slow_site", "outdated_or_not_mobile"]),
    offresProposables: new Set(["site_demo_cle_en_main", "GMB_RELANCE_AVIS"]),
    nombres: new Set(["3.4", "1043", "43"]),
    ...over,
  };
}

const CARTE_VALIDE = {
  cle: "slow_site",
  fonde_sur: ["ttfb"],
  avant: "3,4 s",
  titre: "Votre serveur met 3,4 secondes à répondre",
  texte:
    "Au-delà de deux secondes, la moitié des visiteurs referment avant d'avoir vu votre offre. Votre serveur en met 3,4.",
};

describe("nombresDe", () => {
  it("normalise virgules et espaces fins", () => {
    expect(nombresDe("3,4 s et 1 043 ms")).toEqual(["3.4", "1043"]);
  });
});

describe("règle 1 — pas de carte sans fondement mesuré", () => {
  it("accepte une carte adossée à une preuve en échec", () => {
    const v = validerPreparation({ cartes: [CARTE_VALIDE] }, univers());
    expect(v.retenue?.cartes).toHaveLength(1);
    expect(v.rejets).toEqual([]);
  });

  it("rejette une carte dont la preuve n'est pas en échec", () => {
    const carte = { ...CARTE_VALIDE, fonde_sur: ["canonical"] };
    const v = validerPreparation({ cartes: [carte] }, univers());
    expect(v.retenue).toBeNull();
    expect(v.rejets[0].regle).toBe(1);
  });
});

describe("règle 2 — pas d'offre inventée", () => {
  it("retire un code inconnu sans jeter le reste", () => {
    const v = validerPreparation(
      { cartes: [CARTE_VALIDE], offres: ["site_demo_cle_en_main", "OFFRE_FANTOME"] },
      univers(),
    );
    expect(v.retenue?.offres).toEqual(["site_demo_cle_en_main"]);
    expect(v.rejets.find((r) => r.regle === 2)?.quoi).toBe("OFFRE_FANTOME");
  });
});

describe("règle 3 — pas de chiffre hors dossier", () => {
  it("rejette une carte qui invente une mesure", () => {
    const carte = { ...CARTE_VALIDE, texte: "Votre serveur met 9,7 secondes à répondre, c'est énorme." };
    const v = validerPreparation({ cartes: [carte] }, univers());
    expect(v.retenue).toBeNull();
    expect(v.rejets[0].regle).toBe(3);
    expect(v.rejets[0].pourquoi).toContain("9.7");
  });

  it("laisse passer une année et un petit délai", () => {
    // Sans cette tolérance, aucune phrase naturelle ne passerait, et la règle
    // finirait désactivée — ce qui reviendrait à ne pas l'avoir.
    const carte = {
      ...CARTE_VALIDE,
      texte: "Votre site date de 2016 et nous livrons le nouveau en 7 jours. Il répond en 3,4 secondes.",
    };
    expect(validerPreparation({ cartes: [carte] }, univers()).retenue?.cartes).toHaveLength(1);
  });

  it("écarte une intro qui invente, sans perdre les cartes", () => {
    const v = validerPreparation(
      { cartes: [CARTE_VALIDE], intro: "Vous perdez 87 % de vos visiteurs, c'est mesuré et sans appel." },
      univers(),
    );
    expect(v.retenue?.cartes).toHaveLength(1);
    expect(v.retenue?.intro).toBeUndefined();
    expect(v.rejets.some((r) => r.quoi === "intro/accroche")).toBe(true);
  });
});

describe("règle 4 — un rejet n'est jamais un blocage", () => {
  it("rend `null` plutôt que de lever, pour que l'appelant retombe sur le catalogue", () => {
    const v = validerPreparation({ cartes: [{ ...CARTE_VALIDE, fonde_sur: ["inexistant"] }] }, univers());
    expect(v.retenue).toBeNull();
    expect(v.rejets.length).toBeGreaterThan(0);
  });

  it("ne lève pas sur une structure invalide", () => {
    expect(() => validerPreparation({ nimporte: "quoi" }, univers())).not.toThrow();
    expect(validerPreparation({ nimporte: "quoi" }, univers()).retenue).toBeNull();
  });
});

describe("plafond de cartes", () => {
  it("refuse au-delà de trois — un audit qui accable dilue", () => {
    const quatre = Array.from({ length: 4 }, () => CARTE_VALIDE);
    expect(validerPreparation({ cartes: quatre }, univers()).retenue).toBeNull();
  });
});

describe("la colonne « avant » et le refus de l'« après »", () => {
  it("exige la valeur mesurée : sans elle il n'y a pas de comparaison", () => {
    const { avant: _, ...sansAvant } = CARTE_VALIDE;
    const v = validerPreparation({ cartes: [sansAvant] }, univers());
    expect(v.retenue).toBeNull();
  });

  it("soumet « avant » à la règle du dossier comme le reste", () => {
    // C'est le champ où ça compte le plus : la valeur que le prospect va
    // vérifier lui-même sur son téléphone.
    const v = validerPreparation({ cartes: [{ ...CARTE_VALIDE, avant: "9,8 s" }] }, univers());
    expect(v.retenue).toBeNull();
    expect(v.rejets.some((r) => r.regle === 3)).toBe(true);
  });

  it("REJETTE une soumission qui tente d'écrire l'après", () => {
    // On ne mesure pas le site démo : sa colonne est la seule du document qui
    // promette un résultat, et rien ne pourrait vérifier ce qu'un modèle y
    // écrirait. L'ignorer en silence laisserait l'agent croire sa valeur
    // retenue — mieux vaut un rejet nommé qu'un malentendu.
    const v = validerPreparation(
      { cartes: [{ ...CARTE_VALIDE, apres: "0,3 s garanties" }] },
      univers(),
    );
    expect(v.retenue).toBeNull();
  });
});
