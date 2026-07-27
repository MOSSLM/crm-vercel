// Le module `geo.ts` de l'edge function est du TypeScript pur (aucun global Deno),
// donc testable directement depuis la suite Jest du CRM.
import { bigCityFromCodePostal } from "../geo";

describe("bigCityFromCodePostal", () => {
  it("maps a small commune to the big city of its département", () => {
    expect(bigCityFromCodePostal("21800")).toBe("Dijon"); // Quetigny
    expect(bigCityFromCodePostal("74000")).toBe("Annecy");
    expect(bigCityFromCodePostal("69100")).toBe("Lyon");
  });

  it("returns Paris for every Île-de-France département", () => {
    // Choix SEO assumé : on met Paris en avant, pas la préfecture du département.
    for (const cp of ["75011", "77000", "78000", "91000", "92100", "93100", "94000", "95000"]) {
      expect(bigCityFromCodePostal(cp)).toBe("Paris");
    }
  });

  it("splits Corsica on the 20200 boundary", () => {
    expect(bigCityFromCodePostal("20000")).toBe("Ajaccio");
    expect(bigCityFromCodePostal("20199")).toBe("Ajaccio");
    expect(bigCityFromCodePostal("20200")).toBe("Bastia");
  });

  it("handles overseas départements on their 3-digit prefix", () => {
    expect(bigCityFromCodePostal("97400")).toBe("Saint-Denis");
    expect(bigCityFromCodePostal("97200")).toBe("Fort-de-France");
  });

  it("returns null for anything that is not a 5-digit French postal code", () => {
    expect(bigCityFromCodePostal(null)).toBeNull();
    expect(bigCityFromCodePostal("")).toBeNull();
    expect(bigCityFromCodePostal("1234")).toBeNull();
    expect(bigCityFromCodePostal("CH-1200")).toBeNull();
    // 96 n'est pas un département français.
    expect(bigCityFromCodePostal("96000")).toBeNull();
  });
});
