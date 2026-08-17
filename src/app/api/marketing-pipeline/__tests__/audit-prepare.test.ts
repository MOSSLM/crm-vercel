import { auditPrepare } from "../_board";
import { getDefaultAuditContent } from "@/lib/audit/default-content";

/**
 * Ce qui autorise un audit à être déclaré « prêt ».
 *
 * L'HISTOIRE QUE CE FICHIER EXISTE POUR NE PAS REVIVRE. Le 12 août 2026,
 * 67 audits ont été créés puis validés en dix secondes — sept à dix secondes
 * entre `created_at` et `updated_at`, le même horodatage à la microseconde pour
 * les 67. Aucun n'avait reçu la moindre rédaction : le bouton de validation en
 * lot ne sélectionnait que `id` et `opportunite_id`, il n'a donc jamais pu
 * savoir ce qu'il validait. Deux audits sur soixante-dix portaient un contenu
 * préparé.
 *
 * Le prédicat testé ici est la seule chose qui distingue un document envoyable
 * d'un gabarit. Il est volontairement grossier — la finesse appartient à
 * `validerPreparation`, qui refuse déjà tout constat sans preuve mesurée. Ici on
 * ne vérifie qu'un fait : une rédaction a eu lieu.
 */
describe("auditPrepare", () => {
  it("refuse le contenu par défaut, qui n'a même pas la clé", () => {
    const defaut = getDefaultAuditContent({ entreprise_nom: "Plomberie Durand" });
    // La garantie de fond : `page3` du contenu par défaut ne porte pas
    // `avant_apres`. Si un jour le défaut se met à en écrire un, ce test tombe
    // — et c'est exactement le moment où le garde-fou cesserait de protéger.
    expect((defaut.page3 as Record<string, unknown>).avant_apres).toBeUndefined();
    expect(auditPrepare((defaut.page3 as Record<string, unknown>).avant_apres)).toBe(false);
  });

  it("refuse un tableau vide", () => {
    expect(auditPrepare([])).toBe(false);
  });

  it("accepte dès qu'une ligne a été rédigée", () => {
    expect(
      auditPrepare([
        { cle: "slow_site", avant: "3,4 s", apres: "moins d'une seconde", precision: "…" },
      ]),
    ).toBe(true);
  });

  /**
   * Les formes abîmées viennent d'en bas — une colonne JSONB relue, une
   * migration à moitié appliquée, un `content` écrit par une version antérieure.
   * Aucune ne doit valoir « préparé » : dans le doute, on ne valide pas.
   */
  it.each([
    ["absent", undefined],
    ["nul", null],
    ["objet", { cle: "slow_site" }],
    ["chaîne", "[]"],
    ["nombre", 3],
    ["booléen", true],
  ])("refuse une valeur %s", (_libelle, valeur) => {
    expect(auditPrepare(valeur)).toBe(false);
  });
});
