import { aUneFicheGoogle, lienGoogle, lienMaps } from "../lien-google";

const FICHE = "https://www.google.com/maps/place/Climat+Gaz+33/data=!4m7";

describe("lienGoogle", () => {
  it("ouvre la fiche Google quand elle est connue", () => {
    expect(lienGoogle({ name: "Climat Gaz", ville: "Bordeaux", google_url: FICHE })).toBe(FICHE);
  });

  it("accepte le doublon historique google_maps_url", () => {
    expect(lienGoogle({ name: "Climat Gaz", google_maps_url: FICHE })).toBe(FICHE);
  });

  it("préfère google_url quand les deux sont là", () => {
    const autre = "https://www.google.com/maps/place/Autre";
    expect(lienGoogle({ google_url: FICHE, google_maps_url: autre })).toBe(FICHE);
  });

  it("retombe sur une recherche nom + ville sans fiche", () => {
    expect(lienGoogle({ name: "Climat Gaz", ville: "Bordeaux" })).toBe(
      "https://www.google.com/search?q=Climat%20Gaz%20Bordeaux",
    );
  });

  it("ignore une fiche vide ou blanche", () => {
    expect(lienGoogle({ name: "Climat Gaz", google_url: "   " })).toContain("/search?q=");
  });

  it("échappe les caractères spéciaux du nom", () => {
    expect(lienGoogle({ name: "Cousin Éco & Fils", ville: "Poitiers" })).toBe(
      "https://www.google.com/search?q=Cousin%20%C3%89co%20%26%20Fils%20Poitiers",
    );
  });

  it("ne casse pas sur un prospect sans nom ni ville", () => {
    expect(lienGoogle({})).toBe("https://www.google.com/search?q=");
  });
});

describe("aUneFicheGoogle", () => {
  it("distingue la fiche de la recherche", () => {
    expect(aUneFicheGoogle({ google_url: FICHE })).toBe(true);
    expect(aUneFicheGoogle({ google_maps_url: FICHE })).toBe(true);
    expect(aUneFicheGoogle({ name: "Climat Gaz" })).toBe(false);
    expect(aUneFicheGoogle({ google_url: "  " })).toBe(false);
  });
});

describe("lienMaps", () => {
  it("ouvre la fiche quand elle est connue", () => {
    expect(lienMaps({ google_maps_url: FICHE })).toBe(FICHE);
  });

  it("retombe sur une recherche cartographique", () => {
    expect(lienMaps({ name: "Climat Gaz", ville: "Bordeaux" })).toBe(
      "https://www.google.com/maps/search/Climat%20Gaz%20Bordeaux",
    );
  });
});
