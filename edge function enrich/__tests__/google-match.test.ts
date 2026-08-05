import {
  extractLatLngFromUrl,
  isV1PlaceId,
  looksLikeSameBusiness,
  resolvePlaceId,
} from "../google";

/**
 * Ce garde-fou décide si les avis Google trouvés par recherche texte
 * appartiennent bien à l'entreprise qu'on enrichit.
 *
 * L'enjeu n'est pas cosmétique : `searchPlaceId` demande `maxResultCount: 1`,
 * donc un « oui » trop facile publie les avis 5 étoiles d'un tiers — avec les
 * noms de ses vrais clients — sur le site d'une autre entreprise. Une recherche
 * qui ne trouve pas le bon établissement doit échouer, pas se rabattre sur le
 * voisin.
 */
describe("looksLikeSameBusiness", () => {
  it("accepte quand un mot significatif du nom concorde", () => {
    expect(
      looksLikeSameBusiness("Plomberie Durand", "Annecy", "Durand Plomberie SARL", "12 rue X, Annecy"),
    ).toBe(true);
  });

  it("accepte malgré accents, casse et ponctuation", () => {
    expect(
      looksLikeSameBusiness("CLIM' ÉNERGIE", "Lyon", "Clim Energie", "3 av. Y, Lyon"),
    ).toBe(true);
  });

  /**
   * Le cas qui motivait la correction : même ville, nom sans rapport. Avant, la
   * ville suffisait et ce résultat était accepté.
   */
  it("refuse un homonyme géographique dont le nom ne concorde pas", () => {
    expect(
      looksLikeSameBusiness("Clim Concept", "Lyon", "Boulangerie Saint-Jean", "5 rue Z, Lyon"),
    ).toBe(false);
  });

  it("refuse même quand l'adresse trouvée contient la bonne ville", () => {
    expect(
      looksLikeSameBusiness("Eco Energies 17", "La Rochelle", "Garage Martin", "8 bd A, La Rochelle"),
    ).toBe(false);
  });

  it("refuse quand la ville concorde mais qu'aucun nom n'est exploitable", () => {
    // Aucun token de longueur suffisante dans le nom : rien à comparer, donc non.
    expect(looksLikeSameBusiness("A B", "Lyon", "Tout Autre Chose", "1 rue B, Lyon")).toBe(false);
  });

  /**
   * L'adresse ne valide jamais seule, mais elle autorise un sigle court à
   * compter — « ADS », « BTP », « SNC » sont des noms d'entreprise courants.
   */
  it("tolère un sigle de 3 lettres quand l'adresse confirme la ville", () => {
    expect(looksLikeSameBusiness("ADS Chauffage", "Dijon", "ADS", "4 rue C, Dijon")).toBe(true);
  });

  it("refuse ce même sigle sans confirmation d'adresse", () => {
    expect(looksLikeSameBusiness("ADS Chauffage", null, "ADS", null)).toBe(false);
  });

  it("ne se laisse pas avoir par un mot générique trop court", () => {
    expect(looksLikeSameBusiness("Le Plombier", "Nice", "La Pizzeria", "2 rue D, Nice")).toBe(false);
  });
});

describe("isV1PlaceId", () => {
  it("accepte un identifiant v1", () => {
    expect(isV1PlaceId("ChIJd8BlQ2BZwokRAFUEcm_qrcA")).toBe(true);
  });

  it("rejette l'ancien format ftid, que l'API v1 refuse", () => {
    expect(isV1PlaceId("0x47e66e1f06e2b70f:0x40b82c3688c9460")).toBe(false);
  });

  it("rejette le vide et le trop court", () => {
    expect(isV1PlaceId(null)).toBe(false);
    expect(isV1PlaceId("")).toBe(false);
    expect(isV1PlaceId("abc")).toBe(false);
  });
});

describe("resolvePlaceId", () => {
  it("préfère l'identifiant stocké", () => {
    expect(resolvePlaceId("ChIJabcdefghijklmnop", "https://maps.google.com/x", null)).toBe(
      "ChIJabcdefghijklmnop",
    );
  });

  it("retombe sur l'URL quand rien n'est stocké", () => {
    expect(
      resolvePlaceId(null, "https://www.google.com/maps/place/?q=place_id:ChIJ0123456789abcdefgh", null),
    ).toBe("ChIJ0123456789abcdefgh");
  });

  it("rend null quand aucune source ne porte d'identifiant", () => {
    expect(resolvePlaceId(null, "https://exemple.fr", null)).toBeNull();
  });
});

describe("extractLatLngFromUrl", () => {
  it("lit le format @lat,lng", () => {
    expect(extractLatLngFromUrl("https://maps.google.com/maps/@48.8566,2.3522,17z")).toEqual({
      lat: 48.8566,
      lng: 2.3522,
    });
  });

  it("lit le format !3d!4d", () => {
    expect(extractLatLngFromUrl("https://g.co/x!3d45.7640!4d4.8357")).toEqual({
      lat: 45.764,
      lng: 4.8357,
    });
  });

  it("rend null sans coordonnées", () => {
    expect(extractLatLngFromUrl("https://exemple.fr")).toBeNull();
    expect(extractLatLngFromUrl(null)).toBeNull();
  });
});
