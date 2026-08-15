import { render, waitFor } from "@testing-library/react";
import { CarteFrance } from "../CarteFrance";
import type { DeptGeometry } from "@/lib/carte/geo";

/**
 * Les noms de villes sur la carte du territoire.
 *
 * Ce qui se vérifie ici sans navigateur : qu'ils sont bien rendus HORS du
 * groupe zoomé. À l'intérieur, le texte grossirait avec le zoom — illisible à
 * k = 12 — et c'est le genre de défaut qu'aucune erreur ne signale.
 */
jest.mock("@/lib/carte/communes", () => {
  const reel = jest.requireActual("@/lib/carte/communes");
  return {
    ...reel,
    chargerCommunes: jest.fn(async () => [
      { code: "69123", nom: "Lyon", lat: 45.758, lon: 4.835, population: 519127 },
      { code: "75056", nom: "Paris", lat: 48.8589, lon: 2.347, population: 2103778 },
      { code: "13055", nom: "Marseille", lat: 43.2803, lon: 5.3806, population: 886040 },
    ]),
  };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Un « département » carré, suffisant pour caler la projection sur la France. */
const GEOMETRIES: DeptGeometry[] = [
  {
    code: "00",
    bbox: [-1, 42, 8, 51],
    feature: {
      type: "Feature",
      properties: { code: "00" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1, 42],
            [-1, 51],
            [8, 51],
            [8, 42],
            [-1, 42],
          ],
        ],
      },
    },
  },
];

const rendre = () =>
  render(
    <CarteFrance
      departements={[]}
      geometries={GEOMETRIES}
      fiches={[]}
      mode="points"
      selection={null}
      onSelect={() => {}}
      ficheActive={null}
      onFicheActive={() => {}}
    />,
  );

describe("CarteFrance — repères de villes", () => {
  it("écrit les noms des villes chargées", async () => {
    const { container } = rendre();
    await waitFor(() => {
      expect(container.querySelectorAll("text.carte-ville-nom").length).toBeGreaterThan(0);
    });
    const noms = [...container.querySelectorAll("text.carte-ville-nom")].map((n) => n.textContent);
    expect(noms).toContain("Paris");
  });

  it("les pose hors du groupe zoomé, pour que le texte ne grossisse pas au zoom", async () => {
    const { container } = rendre();
    await waitFor(() => {
      expect(container.querySelector("g.carte-villes")).not.toBeNull();
    });
    const villes = container.querySelector("g.carte-villes")!;
    expect(villes.closest("g.carte-zoom")).toBeNull();
  });
});
