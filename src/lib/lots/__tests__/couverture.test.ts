/**
 * La couverture d'un lot — et surtout l'ORDRE des gestes.
 *
 * Le test qui compte est celui du prochain geste : chercher la présence web de
 * mille entreprises qu'on n'a pas encore rapprochées du registre, c'est
 * chercher sur des noms faux. L'ordre du plan de lissage n'est pas un confort
 * d'affichage, c'est ce qui empêche un travail inutile.
 */
import {
  AXES,
  avancement,
  axeDe,
  lireCouverture,
  manque,
  parAvancement,
  pretADemarcher,
  prochainGeste,
  taux,
  type Couverture,
  type LigneCouverture,
} from "@/lib/lots/couverture";

const lot = (total: number, couverts: Partial<Couverture["couverts"]> = {}): Couverture => ({
  lotId: 1,
  nom: "Essai",
  note: null,
  creeLe: "2026-08-21T10:00:00Z",
  total,
  couverts: {
    siret: total,
    donnees: total,
    constat: total,
    demo: total,
    audit: total,
    proprietaire: total,
    sequence: total,
    ...couverts,
  },
});

describe("lireCouverture", () => {
  it("lit les comptes rendus en chaîne par PostgREST", () => {
    // Les `bigint` reviennent en chaîne au-delà d'une certaine taille. Lus
    // tels quels, « 524 - "358" » vaut NaN et la colonne s'affiche vide.
    const ligne: LigneCouverture = {
      lot_id: "2",
      nom: "Froides",
      note: null,
      cree_le: "2026-08-21T10:48:34Z",
      total: "524",
      avec_siret: "358",
      avec_donnees: 358,
      avec_constat: "318",
      avec_demo: 0,
      avec_audit: 0,
      avec_proprietaire: "524",
      en_sequence: 524,
    };
    const c = lireCouverture(ligne);
    expect(c.lotId).toBe(2);
    expect(c.total).toBe(524);
    expect(c.couverts.siret).toBe(358);
    expect(manque(c, "siret")).toBe(166);
    expect(manque(c, "demo")).toBe(524);
  });

  it("ramène à zéro ce qui n'est pas un nombre", () => {
    const c = lireCouverture({
      lot_id: 1, nom: "x", note: null, cree_le: "", total: "abc",
      avec_siret: "", avec_donnees: 0, avec_constat: 0, avec_demo: 0,
      avec_audit: 0, avec_proprietaire: 0, en_sequence: 0,
    });
    expect(c.total).toBe(0);
    expect(c.couverts.siret).toBe(0);
  });
});

describe("manque et taux", () => {
  it("ne rend jamais un manque négatif", () => {
    // Une ligne fille comptée deux fois donnerait un couvert supérieur au
    // total ; « -3 manquantes » n'aide personne.
    expect(manque({ ...lot(10), couverts: { ...lot(10).couverts, siret: 13 } }, "siret")).toBe(0);
  });

  it("dit qu'un lot vide est couvert, pas qu'il est vide de couverture", () => {
    // À zéro entreprise il ne manque rien à personne. Rendre 0 afficherait du
    // rouge et enverrait chercher un travail inexistant.
    expect(taux(lot(0), "demo")).toBe(1);
    expect(manque(lot(0), "demo")).toBe(0);
  });

  it("compte la part réellement couverte", () => {
    expect(taux(lot(500, { demo: 125 }), "demo")).toBe(0.25);
  });
});

describe("prochainGeste", () => {
  it("désigne le PREMIER trou dans l'ordre du plan, pas le plus gros", () => {
    // 166 SIRET manquants contre 524 démos : c'est quand même le SIRET
    // d'abord, sinon on cherche des sites sur des noms qu'on n'a pas validés.
    const c = lot(524, { siret: 358, donnees: 358, constat: 318, demo: 0, audit: 0 });
    expect(prochainGeste(c)?.cle).toBe("siret");
  });

  it("passe au suivant quand l'axe est plein", () => {
    const c = lot(524, { constat: 318, demo: 0 });
    expect(prochainGeste(c)?.cle).toBe("constat");
  });

  it("ne rend rien quand tout est couvert", () => {
    expect(prochainGeste(lot(50))).toBeNull();
  });

  it("ne rend rien sur un lot vide", () => {
    expect(prochainGeste(lot(0))).toBeNull();
  });
});

describe("pretADemarcher", () => {
  it("ignore l'audit, l'attribution et la séquence", () => {
    // L'audit ne concerne que ceux qui ont déjà un site ; attribuer et
    // inscrire sont des gestes de lancement, pas de préparation.
    expect(pretADemarcher(lot(20, { audit: 0, proprietaire: 0, sequence: 0 }))).toBe(true);
  });

  it("refuse dès qu'une démo manque", () => {
    expect(pretADemarcher(lot(20, { demo: 19 }))).toBe(false);
  });

  it("refuse un lot vide — il n'y a rien à démarcher", () => {
    expect(pretADemarcher(lot(0))).toBe(false);
  });
});

describe("parAvancement", () => {
  it("classe sur la moyenne des quatre axes, pas sur le nombre d'axes pleins", () => {
    // `presque` n'a aucun axe complet mais il est à 99 % partout ; `moitie` a
    // deux axes pleins et deux vides. C'est `presque` qu'on veut voir en tête.
    const presque = { ...lot(100, { siret: 99, donnees: 99, constat: 99, demo: 99 }), nom: "presque" };
    const moitie = { ...lot(100, { siret: 100, donnees: 100, constat: 0, demo: 0 }), nom: "moitie" };
    expect(parAvancement([moitie, presque]).map((c) => c.nom)).toEqual(["presque", "moitie"]);
  });

  it("départage deux lots égaux par la taille", () => {
    const petit = { ...lot(10), lotId: 1, nom: "petit" };
    const gros = { ...lot(900), lotId: 2, nom: "gros" };
    expect(parAvancement([petit, gros]).map((c) => c.nom)).toEqual(["gros", "petit"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const entree = [lot(10, { demo: 0 }), lot(10)];
    const copie = [...entree];
    parAvancement(entree);
    expect(entree).toEqual(copie);
  });

  it("mesure l'avancement sur les quatre axes de préparation", () => {
    expect(avancement(lot(100, { siret: 100, donnees: 100, constat: 0, demo: 0 }))).toBe(0.5);
  });
});

describe("le catalogue des axes", () => {
  it("suit l'ordre du plan de lissage", () => {
    expect(AXES.map((a) => a.cle)).toEqual([
      "siret", "donnees", "constat", "demo", "audit", "proprietaire", "sequence",
    ]);
  });

  it("donne à chaque axe un geste et un endroit où le lancer", () => {
    for (const a of AXES) {
      expect(a.geste.trim()).not.toBe("");
      expect(a.ou.trim()).not.toBe("");
      expect(a.aide.trim()).not.toBe("");
    }
  });

  it("rend null sur une clé inconnue plutôt que de lever", () => {
    expect(axeDe("plaquette")).toBeNull();
    expect(axeDe("demo")?.colonne).toBe("Démo");
  });
});
