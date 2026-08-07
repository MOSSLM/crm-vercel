// `address.ts` est du TypeScript pur (aucun global Deno, aucune I/O), donc
// testable directement depuis la suite Jest du CRM.
//
// Les adresses ci-dessous sont des formes RÉELLEMENT rencontrées : sortie Google
// Places, saisie libre en capitales, retours à la ligne d'un scrape, code postal
// de boîte postale doublant celui de la commune. Chaque cas dit ce qu'il vérifie.
import {
  isFrenchPostalCode,
  normalizeCommuneName,
  parseFrenchAddress,
  titleCaseCommune,
} from "../address";

describe("isFrenchPostalCode", () => {
  it("accepte les cinq chiffres d'un département existant", () => {
    for (const cp of ["01000", "21800", "75011", "97400", "98000"]) {
      expect(isFrenchPostalCode(cp)).toBe(true);
    }
  });

  it("refuse ce qui n'est pas un code postal français", () => {
    for (const cp of ["", "2180", "218000", "00123", "99120", "21 800", "ABCDE", null, undefined]) {
      expect(isFrenchPostalCode(cp)).toBe(false);
    }
  });
});

describe("titleCaseCommune", () => {
  it("recase un nom crié en capitales", () => {
    expect(titleCaseCommune("QUETIGNY")).toBe("Quetigny");
    expect(titleCaseCommune("SAINT-ETIENNE-DU-ROUVRAY")).toBe("Saint-Etienne-du-Rouvray");
    expect(titleCaseCommune("L'ISLE-SUR-LA-SORGUE")).toBe("L'Isle-sur-la-Sorgue");
    expect(titleCaseCommune("VILLENEUVE-D'ASCQ")).toBe("Villeneuve-d'Ascq");
  });

  it("garde la majuscule de la particule en tête", () => {
    expect(titleCaseCommune("LE MANS")).toBe("Le Mans");
    expect(titleCaseCommune("LES SABLES-D'OLONNE")).toBe("Les Sables-d'Olonne");
  });

  it("ne touche pas à un nom déjà en casse mixte", () => {
    expect(titleCaseCommune("Saint-Étienne")).toBe("Saint-Étienne");
    expect(titleCaseCommune("Quetigny")).toBe("Quetigny");
  });
});

describe("parseFrenchAddress — le cas courant", () => {
  it("lit le code postal et la commune d'une adresse complète", () => {
    expect(parseFrenchAddress("12 rue des Lilas, 21800 Quetigny")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("lit une adresse formatée par Google Places", () => {
    expect(parseFrenchAddress("12 Rue des Lilas, 21800 Quetigny, France")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("recase une adresse saisie en capitales, pays compris", () => {
    expect(parseFrenchAddress("12 RUE DES LILAS 21800 QUETIGNY FRANCE")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("recolle une adresse écrite sur plusieurs lignes", () => {
    expect(parseFrenchAddress("ZA des Prés\n12 rue des Lilas\n21800 Quetigny")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("accepte la commune dans le segment suivant", () => {
    expect(parseFrenchAddress("12 rue des Lilas, 21800, Quetigny")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("accepte la commune AVANT le code postal", () => {
    expect(parseFrenchAddress("12 rue des Lilas, Quetigny 21800")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });
});

describe("parseFrenchAddress — le bruit à écarter", () => {
  it("coupe la mention Cedex et son numéro", () => {
    expect(parseFrenchAddress("12 rue des Lilas, 21801 QUETIGNY CEDEX 3")).toEqual({
      code_postal: "21801",
      ville: "Quetigny",
    });
  });

  it("retient le code postal de la commune, pas celui de la boîte postale", () => {
    expect(
      parseFrenchAddress("BP 45, 21801 Quetigny Cedex, 12 rue des Lilas, 21800 Quetigny"),
    ).toEqual({ code_postal: "21800", ville: "Quetigny" });
  });

  it("ignore la boîte postale collée au nom de la commune", () => {
    expect(parseFrenchAddress("21800 BP 45 Quetigny")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("coupe un téléphone recopié à la suite de la commune", () => {
    expect(parseFrenchAddress("12 rue des Lilas 21800 Quetigny Tél 03 80 12 34 56")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("ne prend pas un téléphone ni un SIRET pour un code postal", () => {
    // Dix et quatorze chiffres : aucun groupe de cinq exactement.
    expect(parseFrenchAddress("Tél 0380123456 — SIRET 12345678900012")).toEqual({
      code_postal: null,
      ville: null,
    });
  });

  it("ne prend pas une année de nom de rue pour un code postal", () => {
    expect(parseFrenchAddress("3 rue du 8 Mai 1945, 21800 Quetigny")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("écarte la parenthèse départementale", () => {
    expect(parseFrenchAddress("12 rue des Lilas, 21800 Quetigny (21)")).toEqual({
      code_postal: "21800",
      ville: "Quetigny",
    });
  });

  it("s'arrête à la commune sans avaler la région", () => {
    expect(
      parseFrenchAddress("21800 Quetigny, Bourgogne-Franche-Comté, France"),
    ).toEqual({ code_postal: "21800", ville: "Quetigny" });
  });
});

describe("parseFrenchAddress — ce qu'il refuse de deviner", () => {
  it("rend le code postal seul quand l'adresse n'a pas de commune", () => {
    expect(parseFrenchAddress("12 rue des Lilas 21800")).toEqual({
      code_postal: "21800",
      ville: null,
    });
  });

  it("ne prend pas la rue pour la commune quand elle précède le code postal", () => {
    expect(parseFrenchAddress("Route de Dijon 21800")).toEqual({
      code_postal: "21800",
      ville: null,
    });
    expect(parseFrenchAddress("Zone artisanale des Prés 21800")).toEqual({
      code_postal: "21800",
      ville: null,
    });
  });

  it("ne rend rien sans code postal — chercher une commune à l'aveugle écrirait la rue", () => {
    expect(parseFrenchAddress("12 rue des Lilas, Quetigny")).toEqual({
      code_postal: null,
      ville: null,
    });
  });

  it("ne rend rien d'une adresse vide ou visiblement cassée", () => {
    for (const raw of ["", "   ", null, undefined, "4(9)", "—"]) {
      expect(parseFrenchAddress(raw)).toEqual({ code_postal: null, ville: null });
    }
  });

  it("ne prend pas le pays pour la commune", () => {
    expect(parseFrenchAddress("12 rue des Lilas, 21800, France")).toEqual({
      code_postal: "21800",
      ville: null,
    });
  });
});

describe("normalizeCommuneName", () => {
  it("plie accents, casse et ponctuation pour comparer deux graphies", () => {
    expect(normalizeCommuneName("Saint-Étienne")).toBe(normalizeCommuneName("SAINT ETIENNE"));
    expect(normalizeCommuneName("L'Isle-sur-la-Sorgue")).toBe(
      normalizeCommuneName("l isle sur la sorgue"),
    );
    expect(normalizeCommuneName(null)).toBe("");
  });
});
