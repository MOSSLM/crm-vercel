/**
 * L'écran doit poser la MÊME condition que le moteur : `status === 'on'`.
 *
 * C'est la moitié qui manquait — le tableau proposait un brouillon comme une
 * séquence en service, et l'inscription mourait sur un 409 que rien ne
 * traduisait. Ces tests tiennent les deux bouts : la règle, et ce qu'on en dit.
 */
import { sequenceEtatLabel, sequenceLancable, sequenceOptionLabel } from "../types";
import { errorLabel } from "@/lib/sales-pipeline/error-labels";

describe("sequenceLancable", () => {
  it("n'accepte que les séquences activées", () => {
    expect(sequenceLancable({ status: "on" })).toBe(true);
    for (const status of ["draft", "paused", "off", "error", ""]) {
      expect(sequenceLancable({ status })).toBe(false);
    }
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
