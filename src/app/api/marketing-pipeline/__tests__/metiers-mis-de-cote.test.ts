/**
 * Le pipeline marketing ne montre pas les métiers mis de côté.
 *
 * CE QUE CE TEST PROTÈGE. La demande n'était pas « un filtre de plus » : « si
 * il y a isolation je veux plus que ça se voit dans marketing pipeline, ça les
 * exclut complet. Sinon je me mets à faire des actions en lot même sur eux
 * alors qu'il faut pas. » Une case à cocher se décoche, et « tout
 * sélectionner » ne se souvient d'aucun filtre — la seule exclusion qui tient
 * est celle qui retire la carte AVANT qu'elle existe.
 *
 * Le deuxième cas est aussi important que le premier : sans réglages, on
 * n'écarte personne. Un tableau amputé en silence coûte plus cher qu'un tableau
 * trop large, parce qu'on cherche la fiche, on la croit perdue, et on la recrée.
 */
import { retirerMetiersMisDeCote } from "@/app/api/marketing-pipeline/_board";
import type { ServiceTagSetting } from "@/utils/serviceTags";

const reglages: ServiceTagSetting[] = [
  { tag: "Isolation des murs par l'extérieur", allowed: true, demarchable: false },
  { tag: "Fenêtres de toit", allowed: true, demarchable: false },
  { tag: "Pompe à chaleur : chauffage", allowed: true, demarchable: true },
];

const fiche = (id: number, ...service_tags: string[]) => ({ id, service_tags });

describe("retirerMetiersMisDeCote", () => {
  it("retire la fiche du tableau, elle ne peut donc pas être sélectionnée", () => {
    const { gardees, masquees } = retirerMetiersMisDeCote(
      [
        fiche(1, "Pompe à chaleur : chauffage"),
        fiche(2, "Isolation des murs par l'extérieur"),
        fiche(3, "climatisation"),
      ],
      reglages,
    );
    expect(gardees.map((f) => f.id)).toEqual([1, 3]);
    expect(masquees).toBe(1);
  });

  it("retire aussi celles qui font un métier vendu à côté", () => {
    // Sans exception : un poseur d'isolation recevrait une démo où son métier
    // principal n'a aucune page — pire qu'aucune démo.
    const { gardees, masquees } = retirerMetiersMisDeCote(
      [fiche(1, "Pompe à chaleur : chauffage", "Fenêtres de toit")],
      reglages,
    );
    expect(gardees).toHaveLength(0);
    expect(masquees).toBe(1);
  });

  it("garde une fiche sans aucun tag", () => {
    // L'absence n'est pas une information tant que l'enrichissement n'est pas
    // passé : 196 des 524 garées sont dans ce cas.
    const { gardees } = retirerMetiersMisDeCote([fiche(1)], reglages);
    expect(gardees).toHaveLength(1);
  });

  it("n'écarte PERSONNE quand les réglages manquent", () => {
    for (const absents of [null, undefined, []]) {
      const { gardees, masquees } = retirerMetiersMisDeCote(
        [fiche(1, "Isolation des murs par l'extérieur")],
        absents,
      );
      expect(gardees).toHaveLength(1);
      expect(masquees).toBe(0);
    }
  });

  it("nomme les métiers responsables, dédoublonnés et triés", () => {
    // L'écran doit pouvoir dire QUOI rouvrir : « 93 masquées » sans le motif
    // envoie chercher un bug là où il y a une décision.
    const { metiers } = retirerMetiersMisDeCote([], [
      ...reglages,
      { tag: "Fenêtres de toit", allowed: true, demarchable: false },
    ]);
    expect(metiers).toEqual(["Fenêtres de toit", "Isolation des murs par l'extérieur"]);
  });
});
