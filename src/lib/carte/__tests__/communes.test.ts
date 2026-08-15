/**
 * @jest-environment node
 */
import { placerEtiquettes, type EtiquetteCommune } from "../communes";
import { orienterPourD3 } from "../geo";

const ville = (
  nom: string,
  population: number,
  x: number,
  y: number,
): EtiquetteCommune => ({ code: nom, nom, population, lat: 0, lon: 0, x, y });

const VUE = { largeur: 800, hauteur: 600 };

describe("placerEtiquettes", () => {
  it("laisse la ville la plus peuplée l'emporter quand deux noms se disputent la place", () => {
    // Deux villes à trois pixels l'une de l'autre : une seule peut être écrite.
    const retenues = placerEtiquettes(
      [ville("Bourg", 800, 400, 300), ville("Métropole", 500000, 403, 300)],
      VUE,
    );
    expect(retenues.map((c) => c.nom)).toEqual(["Métropole"]);
  });

  it("écrit les deux dès qu'elles ont chacune leur place", () => {
    const retenues = placerEtiquettes(
      [ville("Bourg", 800, 100, 100), ville("Métropole", 500000, 600, 400)],
      VUE,
    );
    expect(retenues.map((c) => c.nom).sort()).toEqual(["Bourg", "Métropole"]);
  });

  it("libère des noms à mesure que le zoom écarte les villes", () => {
    // Même jeu de villes, projeté deux fois : resserré, puis étalé par un zoom.
    const serre = [
      ville("A", 900, 400, 300),
      ville("B", 800, 404, 300),
      ville("C", 700, 408, 300),
    ];
    const etale = [
      ville("A", 900, 100, 100),
      ville("B", 800, 400, 300),
      ville("C", 700, 700, 500),
    ];
    expect(placerEtiquettes(serre, VUE)).toHaveLength(1);
    expect(placerEtiquettes(etale, VUE)).toHaveLength(3);
  });

  it("n'écrit rien hors de la scène", () => {
    // Un nom à moitié dehors serait tronqué, et occuperait de la place pour rien.
    expect(placerEtiquettes([ville("Ailleurs", 9000, -50, 300)], VUE)).toHaveLength(0);
    expect(placerEtiquettes([ville("Ailleurs", 9000, 400, 900)], VUE)).toHaveLength(0);
  });

  it("plafonne le nombre de noms, même sur une scène vide et grande", () => {
    const beaucoup = Array.from({ length: 200 }, (_, i) =>
      ville(`V${i}`, 1000 - i, 30 + (i % 20) * 38, 30 + Math.floor(i / 20) * 55),
    );
    expect(placerEtiquettes(beaucoup, VUE, 10, 12)).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// Enroulement des polygones — cf. `orienterPourD3`
// ---------------------------------------------------------------------------

describe("orienterPourD3", () => {
  /** Carré d'un degré, décrit en sens ANTI-HORAIRE (convention GeoJSON / OSM). */
  const antiHoraire = {
    type: "Polygon" as const,
    coordinates: [
      [
        [1, 45],
        [2, 45],
        [2, 46],
        [1, 46],
        [1, 45],
      ],
    ],
  };

  it("retourne une enveloppe donnée dans le sens d'OpenStreetMap", () => {
    // Sans ce retournement, d3-geo comprend « toute la sphère SAUF ce carré » :
    // mesuré sur Limoges, 2,4 × 10²⁰ px² projetés au lieu de 130 066.
    const oriente = orienterPourD3(antiHoraire)!;
    const anneau = (oriente.coordinates as number[][][])[0];
    expect(anneau[0]).toEqual([1, 45]);
    expect(anneau[1]).toEqual([1, 46]);
  });

  it("laisse tel quel ce qui est déjà dans le bon sens", () => {
    const horaire = {
      type: "Polygon" as const,
      coordinates: [[...antiHoraire.coordinates[0]].reverse()],
    };
    expect(orienterPourD3(horaire)).toEqual(horaire);
  });

  it("oriente les trous à l'inverse de l'enveloppe", () => {
    const avecTrou = {
      type: "Polygon" as const,
      coordinates: [
        antiHoraire.coordinates[0],
        [
          [1.2, 45.2],
          [1.8, 45.2],
          [1.8, 45.8],
          [1.2, 45.8],
          [1.2, 45.2],
        ],
      ],
    };
    const anneaux = orienterPourD3(avecTrou)!.coordinates as number[][][];
    const aire = (a: number[][]) => {
      let s = 0;
      for (let i = 0, n = a.length, j = n - 1; i < n; j = i++) s += a[j][0] * a[i][1] - a[i][0] * a[j][1];
      return s / 2;
    };
    expect(aire(anneaux[0])).toBeLessThan(0);
    expect(aire(anneaux[1])).toBeGreaterThan(0);
  });

  it("ignore ce qu'il ne sait pas orienter plutôt que de le déformer", () => {
    expect(orienterPourD3(null)).toBeNull();
    expect(orienterPourD3({ type: "LineString", coordinates: [] })).toBeNull();
  });
});
