/**
 * @jest-environment node
 */
import {
  classerVilles,
  compterFiches,
  densiteReference,
  departementDe,
  indexerCommunes,
  lieuDeRecherche,
  lireAdresse,
  normaliserCommune,
  passagesParCommune,
  type CommuneCandidate,
} from "../prospection";
import { METIERS, metierDuMotCle, metierParTag, verifierAlignement } from "../metiers";

const CLIM = metierParTag("climatisation")!;
const PLOMBERIE = metierParTag("plomberie")!;

const commune = (
  code: string,
  nom: string,
  population: number,
  codesPostaux: string[],
): CommuneCandidate => ({ code, nom, population, lat: 46, lon: 2, codesPostaux });

describe("lireAdresse", () => {
  it("lit le code postal et la commune d'une adresse Google ordinaire", () => {
    expect(lireAdresse("36 Rue Pascal, 77100 Meaux")).toEqual({ cp: "77100", ville: "Meaux" });
  });

  it("accepte la virgule après le code postal", () => {
    // Mesuré : une adresse sur dix porte cette virgule. L'exiger absente
    // perdait 475 fiches sur 3 825 — de la couverture invisible.
    expect(lireAdresse("Croas Ar Born, 29420, Plouvorn")).toEqual({
      cp: "29420",
      ville: "Plouvorn",
    });
  });

  it("écarte la mention CEDEX, qui est du tri postal et non un nom de commune", () => {
    expect(lireAdresse("1 rue X, 33049 Bordeaux Cedex")?.ville).toBe("Bordeaux");
    expect(lireAdresse("1 rue X, 67624 Labège cedex 9")?.ville).toBe("Labège");
  });

  it("rend null quand l'adresse ne porte aucun code postal", () => {
    expect(lireAdresse("Zone artisanale, Bretagne")).toBeNull();
    expect(lireAdresse("")).toBeNull();
    expect(lireAdresse(null)).toBeNull();
  });

  it("rend null quand rien ne suit le code postal", () => {
    expect(lireAdresse("Boîte postale 75017")).toBeNull();
  });
});

describe("normaliserCommune", () => {
  it("réconcilie les graphies d'un même nom", () => {
    // Le tiret devient une ESPACE et non rien : « Saint-Ouen » doit rester
    // proche de « Saint Ouen », pas devenir « saintouen ».
    expect(normaliserCommune("Clermont-Ferrand")).toBe(normaliserCommune("Clermont Ferrand"));
    expect(normaliserCommune("Labège")).toBe("labege");
    expect(normaliserCommune("L'Haÿ-les-Roses")).toBe("l hay les roses");
  });
});

describe("departementDe", () => {
  it("prend deux chiffres en métropole et trois en outre-mer", () => {
    expect(departementDe("75056")).toBe("75");
    expect(departementDe("2A004")).toBe("2A");
    // À deux chiffres, la Guadeloupe et Mayotte tomberaient dans le même
    // département et la règle « une ville par département » n'en garderait
    // qu'une pour tout l'outre-mer.
    expect(departementDe("97411")).toBe("974");
    expect(departementDe("98611")).toBe("986");
  });
});

describe("compterFiches", () => {
  const communes = [
    commune("33281", "Mérignac", 78090, ["33700"]),
    commune("16216", "Mérignac", 805, ["16200"]),
    commune("63113", "Clermont-Ferrand", 147284, ["63000", "63100"]),
  ];
  const index = indexerCommunes(communes);

  it("distingue deux communes homonymes par leur code postal", () => {
    const compte = compterFiches(
      [
        { adresse: "1 rue A, 33700 Mérignac", keyword: "climatisation" },
        { adresse: "2 rue B, 16200 Mérignac", keyword: "climatisation" },
      ],
      index,
      CLIM,
    );
    expect(compte.get("33281")).toBe(1);
    expect(compte.get("16216")).toBe(1);
  });

  it("ne compte que les fiches du métier demandé", () => {
    // Une ville ratissée pour la climatisation reste vierge en plomberie :
    // l'afficher comme couverte reviendrait à ne jamais y retourner.
    const lignes = [
      { adresse: "1 rue A, 63000 Clermont-Ferrand", keyword: "climatisation" },
      { adresse: "2 rue B, 63100 Clermont-Ferrand", keyword: "Climatisation" },
      { adresse: "3 rue C, 63000 Clermont-Ferrand", keyword: "plombier" },
    ];
    expect(compterFiches(lignes, index, CLIM).get("63113")).toBe(2);
    expect(compterFiches(lignes, index, PLOMBERIE).get("63113")).toBe(1);
  });

  it("ignore un mot-clé qui ne relève d'aucun métier", () => {
    // « Réseau Proéco Énergies » est un import de réseau, « serrurier » un
    // essai : les rattacher au hasard gonflerait une couverture inexistante.
    const compte = compterFiches(
      [
        { adresse: "1 rue A, 63000 Clermont-Ferrand", keyword: "Réseau Proéco Énergies" },
        { adresse: "2 rue B, 63000 Clermont-Ferrand", keyword: "serrurier" },
      ],
      index,
      CLIM,
    );
    expect(compte.size).toBe(0);
  });

  it("laisse tomber une fiche dont la commune n'est pas dans la liste", () => {
    const compte = compterFiches(
      [{ adresse: "1 rue A, 12345 Trifouillis", keyword: "climatisation" }],
      index,
      CLIM,
    );
    expect(compte.size).toBe(0);
  });

  it("refuse d'apparier un code postal juste sur une commune du mauvais nom", () => {
    // Un code postal couvre souvent plusieurs communes : sans le contrôle du
    // nom, une fiche d'un village voisin serait portée au crédit de la ville.
    const compte = compterFiches(
      [{ adresse: "1 rue A, 33700 Le Haillan", keyword: "climatisation" }],
      index,
      CLIM,
    );
    expect(compte.size).toBe(0);
  });
});

describe("densiteReference", () => {
  const communes = [
    commune("A", "A", 100_000, ["10000"]),
    commune("B", "B", 100_000, ["20000"]),
    commune("C", "C", 100_000, ["30000"]),
    commune("D", "D", 100_000, ["40000"]),
  ];

  it("prend la médiane et non la moyenne des villes couvertes", () => {
    // Mesuré : Perpignan porte 70 fiches pour 120 000 habitants, six fois la
    // densité habituelle. À la moyenne, elle relèverait l'étalon à elle seule
    // et ferait passer toutes les autres villes pour sous-couvertes.
    const fiches = new Map([["A", 10], ["B", 20], ["C", 300]]);
    expect(densiteReference(fiches, communes)).toBe(20);
  });

  it("ignore les villes sans aucune fiche : elles ne disent rien de la densité", () => {
    // D est à zéro. La compter ramènerait l'étalon vers le bas à chaque ville
    // qu'on n'a pas encore visitée — l'étalon se dégraderait tout seul.
    const fiches = new Map([["A", 10], ["B", 30]]);
    expect(densiteReference(fiches, communes)).toBe(20);
  });

  it("rend null quand le métier n'a jamais rien rendu", () => {
    expect(densiteReference(new Map(), communes)).toBeNull();
  });
});

describe("passagesParCommune", () => {
  const communes = [
    commune("87085", "Limoges", 129937, ["87000"]),
    commune("63113", "Clermont-Ferrand", 147284, ["63000"]),
  ];

  it("reconnaît la ville derrière « Limoges, France »", () => {
    const etats = passagesParCommune(
      [{ lieu: "Limoges, France", motsCles: ["climatisation"], rapide: false }],
      communes,
      CLIM,
    );
    expect(etats.get("87085")).toBe("complete");
  });

  it("ne retient pas une recherche lancée pour un autre métier", () => {
    const etats = passagesParCommune(
      [{ lieu: "Limoges, France", motsCles: ["plombier"], rapide: true }],
      communes,
      CLIM,
    );
    expect(etats.size).toBe(0);
  });

  it("laisse la passe complète l'emporter sur la rapide, quel que soit l'ordre", () => {
    const rapide = { lieu: "Limoges, France", motsCles: ["climatisation"], rapide: true };
    const complete = { lieu: "Limoges, France", motsCles: ["climatisation"], rapide: false };
    expect(passagesParCommune([rapide, complete], communes, CLIM).get("87085")).toBe("complete");
    expect(passagesParCommune([complete, rapide], communes, CLIM).get("87085")).toBe("complete");
  });

  it("rattrape la graphie sans tiret d'un lieu saisi à la main", () => {
    const etats = passagesParCommune(
      [{ lieu: "Clermont Ferrand, France", motsCles: ["clim"], rapide: true }],
      communes,
      CLIM,
    );
    expect(etats.get("63113")).toBe("rapide");
  });
});

describe("classerVilles", () => {
  const communes = [
    commune("13055", "Marseille", 886_040, ["13001"]),
    commune("13001", "Aix-en-Provence", 147_000, ["13100"]),
    commune("06088", "Nice", 357_737, ["06000"]),
    commune("44109", "Nantes", 327_734, ["44000"]),
    commune("66136", "Perpignan", 120_000, ["66000"]),
  ];
  // Perpignan est la seule ville couverte : elle fixe l'étalon à 50 fiches
  // pour 100 000 habitants.
  const fiches = Array.from({ length: 60 }, () => ({
    adresse: "1 rue A, 66000 Perpignan",
    keyword: "climatisation",
  }));

  const classer = (extra: Partial<Parameters<typeof classerVilles>[0]> = {}) =>
    classerVilles({ communes, fiches, recherches: [], metier: CLIM, ...extra });

  it("met en tête la ville peuplée dont on n'a rien, pas la plus grosse couverte", () => {
    const villes = classer();
    expect(villes[0].nom).toBe("Marseille");
    expect(villes[0].fiches).toBe(0);
    expect(villes[0].attendu).toBe(443); // 50 × 886 040 / 100 000
  });

  it("écarte une ville déjà ratissée en entier pour ce métier", () => {
    // La reproposer ferait rejouer une heure de crawl pour zéro fiche neuve.
    const villes = classer({
      recherches: [{ lieu: "Marseille, France", motsCles: ["climatisation"], rapide: false }],
    });
    expect(villes.map((v) => v.nom)).not.toContain("Marseille");
  });

  it("garde une ville seulement survolée, et le dit", () => {
    const villes = classer({
      recherches: [{ lieu: "Nice, France", motsCles: ["climatisation"], rapide: true }],
    });
    expect(villes.find((v) => v.nom === "Nice")?.passage).toBe("rapide");
  });

  it("balaie les départements avant d'en reprendre un", () => {
    // Trié sur le seul manque, Aix (147 000 hab.) passerait devant Nantes et
    // Montpellier : trois cartes des Bouches-du-Rhône en tête, dont les tuiles
    // se recouvrent. Aix attend donc son tour, après le tour de France.
    // Perpignan est déjà couverte à sa densité de référence : elle sort du
    // classement, et il ne reste que trois départements à balayer.
    const departements = classer().map((v) => v.departement);
    expect(departements).toEqual(["13", "06", "44", "13"]);
  });

  it("ne perd aucune ville : la seconde d'un département revient plus loin", () => {
    // C'est ce qui rend la page deux possible. Tronquer à une ville par
    // département faisait disparaître les 388 autres.
    const villes = classer();
    expect(villes.filter((v) => v.departement === "13").map((v) => v.nom)).toEqual([
      "Marseille",
      "Aix-en-Provence",
    ]);
    expect(villes.map((v) => v.nom)).toContain("Aix-en-Provence");
    expect(villes.indexOf(villes.find((v) => v.nom === "Aix-en-Provence")!)).toBe(
      villes.length - 1,
    );
  });

  it("écarte une ville dont on a déjà tout ce qu'on attendait", () => {
    // Perpignan est à sa densité de référence : il n'y manque rien.
    expect(classer().map((v) => v.nom)).not.toContain("Perpignan");
  });

  it("classe par population quand le métier n'a jamais rien rendu nulle part", () => {
    // Sans étalon, « où chercher en premier ? » n'a qu'une réponse possible.
    // Aix ferme la marche : elle est seconde de son département, pas dernière
    // par la taille.
    const villes = classerVilles({
      communes,
      fiches: [],
      recherches: [],
      metier: metierParTag("chauffage")!,
    });
    expect(villes.map((v) => v.nom)).toEqual([
      "Marseille",
      "Nice",
      "Nantes",
      "Perpignan",
      "Aix-en-Provence",
    ]);
  });

  it("respecte la limite demandée", () => {
    expect(classer({ limite: 2 })).toHaveLength(2);
  });
});

describe("lieuDeRecherche", () => {
  it("s'en tient au nom quand il est sans équivoque", () => {
    // « Marseille, 13001, France » ferait géocoder le 1ᵉʳ arrondissement au
    // lieu de la ville entière : le code postal n'est PAS une précision gratuite.
    expect(lieuDeRecherche({ nom: "Marseille", codePostal: "13001", homonyme: false })).toBe(
      "Marseille, France",
    );
  });

  it("ajoute le code postal quand deux communes portent le même nom", () => {
    expect(lieuDeRecherche({ nom: "Saint-Denis", codePostal: "93200", homonyme: true })).toBe(
      "Saint-Denis, 93200, France",
    );
  });
});

describe("vocabulaire métier", () => {
  it("ne propose que des métiers que le CRM sait ranger", () => {
    // Un métier hors taxonomie poserait sur les fiches un tag qu'aucune page du
    // template ne reconnaît — la page du service disparaîtrait en silence.
    expect(verifierAlignement()).toEqual({ enTrop: [], manquants: [] });
  });

  it("recompte les graphies déjà en base sous le bon métier", () => {
    expect(metierDuMotCle("Climatisation")).toBe(metierParTag("climatisation"));
    expect(metierDuMotCle("clim")).toBe(metierParTag("climatisation"));
    expect(metierDuMotCle("plombier")).toBe(metierParTag("plomberie"));
    expect(metierDuMotCle("VMC")).toBe(metierParTag("ventilation"));
    expect(metierDuMotCle("electricien")).toBe(metierParTag("électricité"));
  });

  it("ne rattache pas ce qui n'est pas un métier", () => {
    expect(metierDuMotCle("Réseau Proéco Énergies")).toBeNull();
    expect(metierDuMotCle("serrurier")).toBeNull();
    expect(metierDuMotCle("")).toBeNull();
    expect(metierDuMotCle(null)).toBeNull();
  });

  it("cherche avec le mot qu'on tape, pas avec le mot qu'on range", () => {
    // Taper « plomberie » dans Maps rend des magasins de sanitaire ; « plombier »
    // rend les artisans qu'on démarche.
    expect(metierParTag("plomberie")?.motCle).toBe("plombier");
    expect(metierParTag("ventilation")?.motCle).toBe("VMC");
    expect(metierParTag("chauffage")?.motCle).toBe("chauffagiste");
  });

  it("donne un mot-clé non vide à chaque métier", () => {
    for (const metier of METIERS) {
      expect(metier.motCle.trim().length).toBeGreaterThan(0);
    }
  });
});
