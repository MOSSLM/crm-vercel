import { mediane, lireMedianeParc, oublierMediane } from "../mediane-parc";

/**
 * Le repère central de la réglette, et le bug qu'il a porté.
 *
 * La médiane portait sur `note_globale` — notre barème de tri — pendant que le
 * repère du prospect était passé à `note_document`, fondé sur la mesure de
 * Google. Deux instruments sur un même axe : médiane maison 77 contre médiane
 * des performances PageSpeed 66 sur le parc, et jusqu'à quarante points d'écart
 * sur un même site. N'importe quel prospect apparaissait très en dessous du
 * parc sans que rien ne l'ait mesuré.
 */
describe("mediane", () => {
  it("prend la valeur du milieu sur un effectif impair", () => {
    expect(mediane([10, 40, 90])).toBe(40);
  });

  it("moyenne les deux du milieu sur un effectif pair, et arrondit", () => {
    expect(mediane([10, 40, 50, 90])).toBe(45);
    expect(mediane([10, 41, 50, 90])).toBe(46);
  });

  it("rend null sur un échantillon vide : pas de repère plutôt qu'un faux", () => {
    expect(mediane([])).toBeNull();
  });
});

describe("lireMedianeParc", () => {
  beforeEach(() => oublierMediane());

  const client = (lignes: unknown[]) =>
    ({
      from: () => ({
        select: () => ({ not: () => Promise.resolve({ data: lignes, error: null }) }),
      }),
    }) as never;

  it("médiane la note du DOCUMENT, pas la note de tri", () => {
    // La ligne porte une note de tri de 90 et aucun axe publiable : si la
    // médiane lisait encore `note_globale`, elle rendrait 90.
    return lireMedianeParc(client([{ entreprise_id: 1, note_globale: 90 }])).then((e) => {
      expect(e.valeur).toBeNull();
      expect(e.effectif).toBe(0);
    });
  });

  it("écarte les lignes sans note publiable au lieu de les compter à zéro", async () => {
    // Une médiane tirée vers le bas par des sites qu'on n'a pas su mesurer
    // flatterait tous les autres — le sens de biais le plus coûteux ici.
    const e = await lireMedianeParc(client([{ entreprise_id: 1, note_globale: 40 }, { entreprise_id: 2, note_globale: 80 }]));
    expect(e.effectif).toBe(0);
  });

  it("ne lève jamais : sans médiane, la réglette s'affiche à deux repères", async () => {
    const casse = { from: () => ({ select: () => ({ not: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) } as never;
    const e = await lireMedianeParc(casse);
    expect(e).toEqual({ valeur: null, effectif: 0 });
  });
});
