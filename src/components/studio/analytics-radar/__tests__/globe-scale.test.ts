import {
  BASE_KM,
  LOW_VOLUME_TOTAL,
  MAX_KM,
  PER_VISIT_KM,
  reliefKm,
  SHADES,
  SHARE_STOPS,
  shadeIndex,
} from "../globe-scale";

// Ces tests gardent l'échelle du globe honnête : la légende affichée à
// l'écran annonce « +100 km par visite » et « 10 % et plus = plus foncé ».
// Si quelqu'un retouche la courbe ou les seuils sans toucher la légende, le
// dashboard affirmerait une échelle qu'il n'applique pas — exactement le
// genre de chiffre inventé que cette page doit s'interdire.

describe("relief du globe", () => {
  it("ajoute exactement PER_VISIT_KM par visite (strictement linéaire)", () => {
    expect(reliefKm(0)).toBe(BASE_KM);
    expect(reliefKm(1)).toBe(BASE_KM + PER_VISIT_KM);
    expect(reliefKm(3)).toBe(BASE_KM + 3 * PER_VISIT_KM);
    // La 5e visite doit ajouter autant que la 1re — c'est ce que dit la légende.
    expect(reliefKm(5) - reliefKm(4)).toBe(PER_VISIT_KM);
    expect(reliefKm(2) - reliefKm(1)).toBe(reliefKm(9) - reliefKm(8));
  });

  it("plafonne pour ne pas dépasser l'échelle du globe", () => {
    expect(reliefKm(10_000)).toBe(MAX_KM);
  });

  it("ne descend jamais sous le relief de fond", () => {
    expect(reliefKm(-5)).toBe(BASE_KM);
  });
});

describe("nuances par part de visites", () => {
  it("met tout au plus foncé tant que le volume est faible", () => {
    const darkest = SHADES.length - 1;
    expect(shadeIndex(0.001, true)).toBe(darkest);
    expect(shadeIndex(0.9, true)).toBe(darkest);
  });

  it("classe la part de visites en nuances croissantes", () => {
    expect(shadeIndex(0.005, false)).toBe(0);
    expect(shadeIndex(0.5, false)).toBe(SHADES.length - 1);
    // 10 % (le seuil annoncé dans la légende) doit atteindre la plus foncée.
    expect(shadeIndex(0.1, false)).toBe(SHADES.length - 1);
  });

  it("est monotone : plus de part ne donne jamais une nuance plus claire", () => {
    let prev = -1;
    for (let share = 0; share <= 0.2; share += 0.002) {
      const i = shadeIndex(share, false);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  it("a une borne de moins que de nuances, sinon une nuance serait inatteignable", () => {
    expect(SHARE_STOPS).toHaveLength(SHADES.length - 1);
  });

  it("garde des bornes strictement croissantes", () => {
    const sorted = [...SHARE_STOPS].sort((a, b) => a - b);
    expect(SHARE_STOPS).toEqual(sorted);
    expect(new Set(SHARE_STOPS).size).toBe(SHARE_STOPS.length);
  });

  it("n'active la graduation qu'à partir d'un volume où elle veut dire quelque chose", () => {
    // Propriété visée : au seuil d'activation, UNE visite isolée ne suffit
    // plus à décrocher la nuance la plus foncée. En dessous, elle y arriverait
    // par accident (1 visite sur 3 = 33 %), d'où le passage tout-foncé.
    const darkestStop = SHARE_STOPS[SHARE_STOPS.length - 1];
    expect(1 / LOW_VOLUME_TOTAL).toBeLessThan(darkestStop);
    expect(shadeIndex(1 / LOW_VOLUME_TOTAL, false)).toBeLessThan(SHADES.length - 1);
  });
});
