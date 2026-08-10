import {
  CATALOGUE_OBSERVATIONS,
  cleFondement,
  fondementsDe,
  validerObservations,
} from "../observations";
import { validerPreparation, type UniversDicible } from "../preparation";

/**
 * Ces tests protègent le cadre donné à l'agent.
 *
 * Sans eux, la dérive est silencieuse et progressive : une clé inventée qui
 * passe, une unité qui change d'un prospect à l'autre, un nombre qui n'est plus
 * rattaché à rien. On ne s'en aperçoit qu'en rendez-vous, quand le prospect
 * demande d'où sort le chiffre.
 */

describe("le catalogue lui-même", () => {
  it("n'autorise aucune position dans les résultats Google", () => {
    // Un rang relevé une fois, non daté et non reproductible, est la ligne la
    // plus contestable du document : le prospect tape la requête et voit autre
    // chose. Tant qu'on n'a pas de vrai suivi, aucune case ne doit permettre
    // de l'écrire.
    const suspectes = CATALOGUE_OBSERVATIONS.filter((d) =>
      /rang|position.*google|classement|serp/i.test(`${d.cle} ${d.libelle}`),
    );
    expect(suspectes).toEqual([]);
  });

  it("donne à chaque case le moyen pour le prospect de la vérifier lui-même", () => {
    for (const d of CATALOGUE_OBSERVATIONS) {
      expect(d.verification.length).toBeGreaterThan(20);
    }
  });

  it("n'utilise que des unités qu'un artisan lit sans traduction", () => {
    const autorisees = ["secondes", "comptage", "oui_non", "date", "position_ecran"];
    for (const d of CATALOGUE_OBSERVATIONS) {
      expect(autorisees).toContain(d.unite);
    }
  });
});

describe("validerObservations — ce qui ne passe pas", () => {
  it("refuse une clé absente du catalogue", () => {
    const v = validerObservations([{ cle: "taux_de_rebond", valeur: 62 }]);
    expect(v.retenues).toEqual([]);
    expect(v.rejets[0].pourquoi).toMatch(/catalogue/);
  });

  it("refuse une valeur qui ne correspond pas à l'unité déclarée", () => {
    const v = validerObservations([
      { cle: "champs_formulaire", valeur: "beaucoup" },
      { cle: "avis_affiches", valeur: 3 },
      { cle: "certificat_expire_le", valeur: "bientôt" },
    ]);
    expect(v.retenues).toEqual([]);
    expect(v.rejets).toHaveLength(3);
  });

  it("refuse une valeur hors des bornes de plausibilité", () => {
    const v = validerObservations([{ cle: "champs_formulaire", valeur: 400 }]);
    expect(v.retenues).toEqual([]);
    expect(v.rejets[0].pourquoi).toMatch(/bornes/);
  });

  it("refuse un doublon plutôt que d'écraser le premier", () => {
    const v = validerObservations([
      { cle: "champs_formulaire", valeur: 9 },
      { cle: "champs_formulaire", valeur: 3 },
    ]);
    expect(v.retenues).toHaveLength(1);
    expect(v.retenues[0].valeur).toBe("9");
    expect(v.rejets[0].pourquoi).toMatch(/double/);
  });

  it("ne lève jamais sur une entrée informe", () => {
    expect(() => validerObservations("n'importe quoi")).not.toThrow();
    expect(validerObservations(undefined).retenues).toEqual([]);
  });
});

describe("validerObservations — ce qui passe, et comment ça se juge", () => {
  it("juge un comptage contre son seuil, dans le bon sens", () => {
    const trop = validerObservations([{ cle: "champs_formulaire", valeur: 9 }]);
    expect(trop.retenues[0]).toMatchObject({ valeur: "9", seuil: "4", verdict: "probleme" });

    const correct = validerObservations([{ cle: "champs_formulaire", valeur: 3 }]);
    expect(correct.retenues[0].verdict).toBe("ok");

    // `sens: min` — ici c'est le manque qui pose problème.
    const peu = validerObservations([{ cle: "photos_realisations", valeur: 1 }]);
    expect(peu.retenues[0].verdict).toBe("probleme");
  });

  it("formate les positions et les dates comme on les lit", () => {
    const v = validerObservations([
      { cle: "position_telephone", valeur: 4 },
      { cle: "certificat_expire_le", valeur: "2026-03-14" },
    ]);
    expect(v.retenues[0].valeur).toBe("4ᵉ écran");
    expect(v.retenues[1].valeur).toBe("14/03/2026");
  });

  it("ne retient comme fondements que les observations en échec", () => {
    const v = validerObservations([
      { cle: "champs_formulaire", valeur: 9 }, // problème
      { cle: "avis_affiches", valeur: true }, // bonne nouvelle
    ]);
    expect(v.retenues).toHaveLength(2);
    // Une bonne nouvelle s'écrit, mais ne fonde pas une carte de constat.
    expect(fondementsDe(v.retenues)).toEqual(["obs:champs_formulaire"]);
  });
});

describe("validerPreparation — l'observation élargit l'univers", () => {
  const universVide: UniversDicible = {
    preuvesEnEchec: new Set(),
    constatsEmis: new Set(),
    offresProposables: new Set(),
    nombres: new Set(),
  };

  const carte = {
    cle: "form_not_accessible",
    fonde_sur: [cleFondement("champs_formulaire")],
    avant: "9 champs",
    titre: "Votre formulaire demande 9 champs",
    texte:
      "Neuf cases à remplir au clavier d’un téléphone, dont plusieurs facultatives. Un formulaire court capte la demande au moment où l’envie est là.",
  };

  it("accepte une carte fondée sur une observation, et son chiffre avec", () => {
    const v = validerPreparation(
      {
        cartes: [carte],
        observations: [{ cle: "champs_formulaire", valeur: 9 }],
      },
      universVide,
    );

    expect(v.retenue?.cartes).toHaveLength(1);
    expect(v.observations).toHaveLength(1);
    expect(v.rejets).toEqual([]);
  });

  it("fait tomber la carte quand l'observation qui la fonde est refusée", () => {
    // L'ordre est ce qui compte : les observations sont jugées d'abord, donc une
    // carte adossée à une clé inventée n'a plus rien pour tenir.
    const v = validerPreparation(
      {
        cartes: [{ ...carte, fonde_sur: ["obs:taux_de_rebond"] }],
        observations: [{ cle: "taux_de_rebond", valeur: 62 }],
      },
      universVide,
    );

    expect(v.retenue).toBeNull();
    expect(v.rejets.map((r) => r.regle).sort()).toEqual([1, 4]);
  });

  it("garde les observations même quand aucune carte ne survit", () => {
    const v = validerPreparation(
      {
        cartes: [{ ...carte, fonde_sur: ["cle_qui_nexiste_pas"] }],
        observations: [{ cle: "champs_formulaire", valeur: 9 }],
      },
      universVide,
    );

    expect(v.retenue).toBeNull();
    // Une visite du site a été payée pour ce chiffre : le perdre obligerait à
    // recommencer au prochain essai.
    expect(v.observations).toHaveLength(1);
  });

  it("ne modifie pas l'univers qu'on lui passe", () => {
    const univers: UniversDicible = {
      preuvesEnEchec: new Set(["cta"]),
      constatsEmis: new Set(),
      offresProposables: new Set(),
      nombres: new Set(),
    };
    validerPreparation(
      { cartes: [carte], observations: [{ cle: "champs_formulaire", valeur: 9 }] },
      univers,
    );

    // Le dossier est lu une fois et peut servir à plusieurs tentatives : une
    // observation acceptée sur la première ne doit pas rester valable sur la
    // seconde, où elle n'aurait pas été soumise.
    expect([...univers.preuvesEnEchec]).toEqual(["cta"]);
    expect(univers.nombres.size).toBe(0);
  });

  it("rejette toujours un chiffre qu'aucune observation ne justifie", () => {
    const v = validerPreparation(
      {
        cartes: [{ ...carte, texte: carte.texte.replace("Neuf", "Quarante-deux") + " 42 %." }],
        observations: [{ cle: "champs_formulaire", valeur: 9 }],
      },
      universVide,
    );
    expect(v.retenue).toBeNull();
    expect(v.rejets.some((r) => r.regle === 3)).toBe(true);
  });
});
