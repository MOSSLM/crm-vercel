/**
 * L'écran doit poser la MÊME condition que le moteur : `status === 'on'`.
 *
 * C'est la moitié qui manquait — le tableau proposait un brouillon comme une
 * séquence en service, et l'inscription mourait sur un 409 que rien ne
 * traduisait. Ces tests tiennent les deux bouts : la règle, et ce qu'on en dit.
 */
import { aDemarcher, inscriptionFinLabel, inscriptionVivante, sequenceEtatLabel, sequenceLancable, sequenceOptionLabel } from "../types";
import { errorLabel } from "@/lib/sales-pipeline/error-labels";

describe("sequenceLancable", () => {
  it("n'accepte que les séquences activées", () => {
    expect(sequenceLancable({ status: "on" })).toBe(true);
    for (const status of ["draft", "paused", "off", "error", ""]) {
      expect(sequenceLancable({ status })).toBe(false);
    }
  });
});

describe("inscriptionVivante", () => {
  /**
   * La régression qui a motivé ces deux fonctions : un prospect passé en
   * rendez-vous sort de sa séquence, son inscription passe à `finished`, et le
   * tableau — qui ne lisait que les vivantes — le remettait dans « pas encore
   * en séquence », le stock qu'on attribue à un agent. Il repartait donc en
   * démarchage le lendemain de sa dernière relance.
   */
  it("ne compte que ce qui travaille encore", () => {
    expect(inscriptionVivante({ status: "active" })).toBe(true);
    expect(inscriptionVivante({ status: "paused" })).toBe(true);
  });

  it("une séquence terminée n'est pas une séquence en cours", () => {
    for (const status of ["finished", "replied", "exited"]) {
      expect(inscriptionVivante({ status })).toBe(false);
    }
  });

  it("mais « terminée » n'est pas « jamais inscrite » — c'est tout le sujet", () => {
    const finie = { status: "finished" };
    expect(inscriptionVivante(finie)).toBe(false);
    expect(finie).not.toBeNull();
    expect(inscriptionVivante(null)).toBe(false);
    expect(inscriptionVivante(undefined)).toBe(false);
  });
});

describe("inscriptionFinLabel", () => {
  it("se tait tant que l'inscription court", () => {
    expect(inscriptionFinLabel("active")).toBeNull();
    expect(inscriptionFinLabel("paused")).toBeNull();
  });

  it("distingue les trois fins — elles ne se relancent pas pareil", () => {
    expect(inscriptionFinLabel("finished")).toBe("séquence terminée");
    expect(inscriptionFinLabel("replied")).toBe("a répondu");
    expect(inscriptionFinLabel("exited")).toBe("sortie de séquence");
  });

  it("nomme le motif de sortie quand on le connaît", () => {
    expect(inscriptionFinLabel("exited", "hors_canal")).toBe("pas joignable sur ce canal");
    expect(inscriptionFinLabel("exited", "stop")).toBe("arrêtée — le prospect a dit non");
    expect(inscriptionFinLabel("exited", "reattribution")).toBe("retirée à son agent");
  });
});

describe("aDemarcher", () => {
  /**
   * LA LIGNE DE PARTAGE. Ce n'est pas « a une inscription », c'est « a reçu
   * quelque chose ». Un numéro sans compte WhatsApp sort de la séquence sans
   * qu'un seul message soit parti : ce prospect est intact, il appartient au
   * stock qu'on attribue. Celui qui a dit non, non.
   */
  it("le stock, c'est jamais inscrite ET sortie sans que rien ne parte", () => {
    expect(aDemarcher(null)).toBe(true);
    expect(aDemarcher(undefined)).toBe(true);
    expect(aDemarcher({ status: "exited", exitReason: "hors_canal" })).toBe(true);
    expect(aDemarcher({ status: "exited", exitReason: "reattribution" })).toBe(true);
  });

  it("un prospect qui a dit non n'y retourne pas", () => {
    expect(aDemarcher({ status: "exited", exitReason: "stop" })).toBe(false);
    expect(aDemarcher({ status: "exited", exitReason: "archive" })).toBe(false);
  });

  it("une séquence menée à son terme n'est pas du stock", () => {
    expect(aDemarcher({ status: "finished", exitReason: null })).toBe(false);
    expect(aDemarcher({ status: "replied", exitReason: null })).toBe(false);
  });

  it("une inscription vivante non plus — elle travaille", () => {
    expect(aDemarcher({ status: "active", exitReason: null })).toBe(false);
    expect(aDemarcher({ status: "paused", exitReason: null })).toBe(false);
  });

  it("un motif inconnu vaut arrêt — on préfère oublier que relancer un refus", () => {
    expect(aDemarcher({ status: "exited", exitReason: null })).toBe(false);
    expect(aDemarcher({ status: "exited", exitReason: "motif_futur" })).toBe(false);
  });
});

describe("sequenceEtatLabel", () => {
  it("ne dit rien d'une séquence en service", () => {
    expect(sequenceEtatLabel("on")).toBeNull();
  });

  it("sépare le brouillon de la pause — ils ne se réparent pas pareil", () => {
    expect(sequenceEtatLabel("draft")).toBe("brouillon");
    expect(sequenceEtatLabel("paused")).toBe("en pause");
  });

  it("suffixe le nom dans les listes déroulantes, et seulement s'il y a lieu", () => {
    expect(sequenceOptionLabel({ name: "WhatsApp seul", status: "draft" })).toBe("WhatsApp seul — brouillon");
    expect(sequenceOptionLabel({ name: "WhatsApp seul", status: "on" })).toBe("WhatsApp seul");
  });
});

describe("errorLabel", () => {
  it("traduit le code que l'API renvoie sur une séquence inactive", () => {
    expect(errorLabel("sequence_inactive")).toMatch(/Séquence inactive/);
    expect(errorLabel("sequence_inactive")).toMatch(/Automatisations/);
  });

  it("nomme la séquence quand l'appelant la connaît", () => {
    expect(errorLabel("sequence_inactive", "WhatsApp seul")).toBe(
      "« WhatsApp seul » — Séquence inactive — activez-la dans Automatisations › Séquences.",
    );
  });

  it("ne colle pas un nom de séquence sur une erreur qui n'en parle pas", () => {
    expect(errorLabel("prospect_non_attribue", "WhatsApp seul")).toBe("Ce prospect ne vous est pas attribué.");
  });

  it("reste lisible sur un code inconnu", () => {
    expect(errorLabel("bidule_inconnu")).toBe("Action impossible");
    expect(errorLabel(undefined)).toBe("Action impossible");
  });
});
