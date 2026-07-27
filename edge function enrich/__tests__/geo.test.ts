// `geo.ts` est du TypeScript pur (aucun global Deno, aucune I/O), donc testable
// directement depuis la suite Jest du CRM.
//
// Les communes de ces tests sont FICTIVES : on place l'origine à (0, 0) et on
// dérive les coordonnées des candidates depuis une distance en kilomètres, pour
// que chaque cas énonce noir sur blanc la distance et la population qu'il teste.
// Aucune coordonnée réelle n'est utilisée — le but est de vérifier la RÈGLE, pas
// la géographie de la France.
import {
  boundingBox,
  DEFAULT_GEO_SETTINGS,
  haversineKm,
  parisRegionFor,
  PARIS_REGION_DEPARTMENTS,
  PARIS_REGION_LABEL,
  pickSeoCity,
  type CommuneCandidate,
} from "../geo";

const ORIGIN = { lat: 0, lon: 0 };

/** Une commune fictive à `km` au nord de l'origine. 1° de latitude ≈ 111.19 km. */
const cityAt = (nom: string, population: number, km: number): CommuneCandidate => ({
  nom,
  population,
  lat: km / 111.19492664455873,
  lon: 0,
});

describe("haversineKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(ORIGIN, ORIGIN)).toBe(0);
    const a = { lat: 45, lon: 3 };
    const b = { lat: 46, lon: 4 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it("measures one degree of latitude as ~111 km", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1);
  });

  it("places the helper's fixtures at the distance they claim", () => {
    expect(haversineKm(ORIGIN, cityAt("x", 1, 18))).toBeCloseTo(18, 6);
  });
});

describe("boundingBox", () => {
  it("covers the requested radius in both directions", () => {
    const { dLat, dLon } = boundingBox({ lat: 47, lon: 5 }, 60);
    // La boîte doit englober le cercle : jamais plus étroite que le rayon.
    expect(haversineKm({ lat: 47, lon: 5 }, { lat: 47 + dLat, lon: 5 })).toBeGreaterThanOrEqual(60);
    expect(haversineKm({ lat: 47, lon: 5 }, { lat: 47, lon: 5 + dLon })).toBeGreaterThanOrEqual(60);
  });
});

describe("pickSeoCity", () => {
  it("picks a nearby metropolis (cas Quetigny → Dijon)", () => {
    const pick = pickSeoCity(ORIGIN, [cityAt("Grande", 150000, 5)]);
    expect(pick).toMatchObject({ nom: "Grande", rule: "metro" });
    expect(pick?.distanceKm).toBeCloseTo(5, 3);
  });

  it("prefers the bigger city when both are within the comfortable radius", () => {
    // Le cas qui motive toute cette règle : une table département → ville
    // renvoyait la préfecture (34k, plus loin) alors que la ville de 45k est à
    // la fois plus proche et plus importante.
    const pick = pickSeoCity(ORIGIN, [
      cityAt("Quarante-Cinq-Mille", 45000, 18),
      cityAt("Trente-Quatre-Mille", 34000, 40),
    ]);
    expect(pick).toMatchObject({ nom: "Quarante-Cinq-Mille", rule: "largest_nearby" });
  });

  it("still prefers the bigger city when the smaller one is closer", () => {
    // Deux villes dans le rayon confortable : la population tranche, pas la
    // distance — sinon une petite ville toute proche masquerait la vraie
    // agglomération de référence.
    const pick = pickSeoCity(ORIGIN, [
      cityAt("Vingt-Deux-Mille", 22000, 8),
      cityAt("Quarante-Cinq-Mille", 45000, 30),
    ]);
    expect(pick?.nom).toBe("Quarante-Cinq-Mille");
  });

  it("lets a metropolis win over a closer mid-size town", () => {
    const pick = pickSeoCity(ORIGIN, [
      cityAt("Petite", 21000, 15),
      cityAt("Metropole", 250000, 28),
    ]);
    expect(pick).toMatchObject({ nom: "Metropole", rule: "metro" });
  });

  it("keeps the company's own city when it is already a big one", () => {
    // « Si c'est déjà dans une grande ville, on laisse » : la commune de
    // l'entreprise est une candidate comme une autre, à distance 0.
    const pick = pickSeoCity(ORIGIN, [
      cityAt("Sur-Place", 120000, 0),
      cityAt("Voisine", 130000, 29),
    ]);
    expect(pick?.nom).toBe("Sur-Place");
    expect(pick?.distanceKm).toBeCloseTo(0, 6);
  });

  it("falls back to the closest city beyond the comfortable radius", () => {
    const pick = pickSeoCity(ORIGIN, [
      cityAt("Loin-Grosse", 80000, 55),
      cityAt("Loin-Proche", 25000, 42),
    ]);
    expect(pick).toMatchObject({ nom: "Loin-Proche", rule: "closest" });
  });

  it("returns null when nothing qualifies", () => {
    // Trop petites, ou trop loin : l'appelant enchaîne sur ses propres replis.
    expect(pickSeoCity(ORIGIN, [])).toBeNull();
    expect(pickSeoCity(ORIGIN, [cityAt("Village", 900, 5)])).toBeNull();
    expect(pickSeoCity(ORIGIN, [cityAt("Tres-Loin", 300000, 120)])).toBeNull();
  });

  it("ignores candidates with unusable coordinates", () => {
    const broken = { nom: "Cassee", population: 200000, lat: NaN, lon: 0 };
    expect(pickSeoCity(ORIGIN, [broken, cityAt("Bonne", 40000, 20)])?.nom).toBe("Bonne");
  });

  it("is deterministic on ties", () => {
    // Même population, même distance : l'ordre d'entrée ne doit pas changer le
    // résultat, sinon deux runs sur les mêmes données divergent.
    const a = cityAt("Alpha", 40000, 20);
    const b = cityAt("Beta", 40000, 20);
    expect(pickSeoCity(ORIGIN, [a, b])?.nom).toBe(pickSeoCity(ORIGIN, [b, a])?.nom);
  });

  it("honours custom thresholds", () => {
    // Les seuils viennent d'`enrichment_geo_settings` : on doit pouvoir viser
    // plus large sans toucher au code.
    const wide = { ...DEFAULT_GEO_SETTINGS, bigCityPopulation: 5000, preferredRadiusKm: 80, maxRadiusKm: 100 };
    const pick = pickSeoCity(ORIGIN, [cityAt("Bourg", 6000, 70)], wide);
    expect(pick).toMatchObject({ nom: "Bourg", rule: "largest_nearby" });
    expect(pickSeoCity(ORIGIN, [cityAt("Bourg", 6000, 70)])).toBeNull();
  });
});

describe("parisRegionFor", () => {
  it("renvoie « Région parisienne » pour les 8 départements franciliens", () => {
    for (const dept of PARIS_REGION_DEPARTMENTS) {
      expect(parisRegionFor(`${dept}000`)).toBe(PARIS_REGION_LABEL);
    }
    // Le cas qui a motivé la règle : Évry-Courcouronnes, à 25,6 km de Montreuil
    // et 26,0 km de Paris — l'arbitrage par distance renvoyait Montreuil.
    expect(parisRegionFor("91000")).toBe(PARIS_REGION_LABEL);
  });

  it("laisse la main au calcul géographique hors Île-de-France", () => {
    // 76 = Rouen/Le Havre, 21 = Dijon : c'est là que l'arbitrage par distance a
    // du sens et doit continuer de décider.
    expect(parisRegionFor("76000")).toBeNull();
    expect(parisRegionFor("21800")).toBeNull();
    // 60 (Oise) et 45 (Loiret) touchent l'Île-de-France mais n'en font pas partie.
    expect(parisRegionFor("60100")).toBeNull();
    expect(parisRegionFor("45000")).toBeNull();
  });

  it("ignore un code postal absent ou mal formé", () => {
    expect(parisRegionFor(null)).toBeNull();
    expect(parisRegionFor("")).toBeNull();
    expect(parisRegionFor("75")).toBeNull();
    expect(parisRegionFor("7501")).toBeNull();
    expect(parisRegionFor("750011")).toBeNull();
    expect(parisRegionFor("ABCDE")).toBeNull();
  });

  it("tolère les espaces autour du code postal", () => {
    expect(parisRegionFor(" 93100 ")).toBe(PARIS_REGION_LABEL);
  });
});
