/**
 * @jest-environment node
 */

/**
 * Verser un lot dans une campagne — la couture entre une population figée et un
 * envoi.
 *
 * ── CE QUE CE TEST EMPÊCHE DE SE REPRODUIRE ──────────────────────────────
 * `lot_id` était validé en `uuid`. Mais un segment porte un uuid et un lot un
 * bigint : « Ajouter depuis un lot » rendait 400 quel que soit le lot choisi.
 * Le seul chaînage qui relie une population préparée à une campagne était mort,
 * et l'erreur ne ressemblait pas à sa cause — le menu envoyait en plus le TEXTE
 * de l'option, faute de `value`, ce qui donnait « Nom (undefined) » à valider
 * comme identifiant.
 *
 * Les deux moitiés du bug tenaient dans le même geste : un champ typé pour
 * l'autre source, et un écran qui lisait une forme que la route ne rend pas.
 */

import { ajoutLeadsSchema } from "../_campagne";

describe("ajouter des leads depuis un lot", () => {
  it("accepte l'identifiant tel qu'un <select> l'envoie — une chaîne de chiffres", () => {
    const lu = ajoutLeadsSchema.safeParse({ origine: "lot", lot_id: "2" });
    expect(lu.success).toBe(true);
    if (lu.success) expect(lu.data.lot_id).toBe(2);
  });

  it("accepte aussi un nombre, pour un appelant qui n'est pas un formulaire", () => {
    const lu = ajoutLeadsSchema.safeParse({ origine: "lot", lot_id: 3 });
    expect(lu.success).toBe(true);
    if (lu.success) expect(lu.data.lot_id).toBe(3);
  });

  it("refuse un uuid — c'est la forme d'un segment, pas celle d'un lot", () => {
    const lu = ajoutLeadsSchema.safeParse({
      origine: "lot",
      lot_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    });
    expect(lu.success).toBe(false);
  });

  it("refuse le texte d'une option sans valeur, la seconde moitié du bug", () => {
    const lu = ajoutLeadsSchema.safeParse({ origine: "lot", lot_id: "Froides (524)" });
    expect(lu.success).toBe(false);
  });
});

describe("les autres sources n'ont pas bougé", () => {
  it("un segment reste un uuid", () => {
    expect(
      ajoutLeadsSchema.safeParse({
        origine: "segment",
        segment_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      }).success,
    ).toBe(true);
    expect(ajoutLeadsSchema.safeParse({ origine: "segment", segment_id: "2" }).success).toBe(false);
  });

  it("une sélection arrive en clair", () => {
    expect(
      ajoutLeadsSchema.safeParse({ origine: "explorateur", entreprise_ids: [1, 2, 3] }).success,
    ).toBe(true);
  });

  it("la reprise ne demande rien : ces prospects sont déjà partis", () => {
    expect(ajoutLeadsSchema.safeParse({ origine: "reprise" }).success).toBe(true);
  });

  it("refuse une origine inventée plutôt que de l'ignorer", () => {
    expect(ajoutLeadsSchema.safeParse({ origine: "csv", entreprise_ids: [1] }).success).toBe(false);
  });
});
