import { constatsDe } from "../pagespeed";

/**
 * Ce que ces tests protègent : la liste des constats Google est ce qu'on montre
 * au prospect, et c'est Google qui la formule. Trois façons de la rendre fausse,
 * toutes silencieuses :
 *
 *   1. annoncer comme « problème » un audit que Lighthouse déclare sans objet ;
 *   2. perdre `total-byte-weight` en filtrant sur `scoreDisplayMode` ;
 *   3. mettre en tête un constat sans gain, et reléguer les 3,7 s récupérables
 *      dans le « et X autres améliorations » que personne ne lit.
 *
 * La forme de l'objet reproduit celle observée sur l'API — `details.overallSavingsMs`,
 * `details.overallSavingsBytes`, `displayValue` déjà formaté en français.
 */

const LIGHTHOUSE = {
  audits: {
    "render-blocking-insight": {
      title: "Requêtes de blocage du rendu",
      score: 0,
      scoreDisplayMode: "metricSavings",
      displayValue: "Économies estimées : 3 650 ms",
      details: { overallSavingsMs: 3650, items: [{}, {}, {}] },
    },
    "unused-javascript": {
      title: "Réduisez les ressources JavaScript inutilisées",
      score: 0.25,
      scoreDisplayMode: "metricSavings",
      displayValue: "Économies estimées : 1 040 Kio",
      details: { overallSavingsBytes: 1_064_960, items: [{}, {}] },
    },
    "total-byte-weight": {
      title: "Évitez d'énormes charges utiles de réseau",
      score: 0.4,
      // Marqué « informative » selon les versions : c'est le score qui tranche,
      // sinon on perdrait le constat le plus parlant du lot.
      scoreDisplayMode: "informative",
      displayValue: "La taille totale était de 5 104 Kio",
      details: {},
    },
    "image-alt": {
      title: "Les éléments d'image possèdent des attributs `[alt]`",
      score: 0,
      scoreDisplayMode: "binary",
      details: { items: [{}, {}, {}, {}] },
    },
    "tap-targets": {
      title: "Les cibles tactiles ont une taille et un espacement adaptés",
      score: 0.6,
      scoreDisplayMode: "binary",
      details: { items: [{}] },
    },
    // Réussi : n'a rien à faire dans la liste.
    "viewport": {
      title: "Comporte une balise `<meta name=\"viewport\">`",
      score: 1,
      scoreDisplayMode: "binary",
    },
    // Sans objet sur ce site : ce n'est pas un défaut.
    "canonical": {
      title: "Le document possède un élément `rel=canonical` valide",
      score: null,
      scoreDisplayMode: "notApplicable",
    },
    // À vérifier à la main : Lighthouse ne se prononce pas, nous non plus.
    "structured-data": {
      title: "Les données structurées sont valides",
      score: null,
      scoreDisplayMode: "manual",
    },
    // Purement informatif, sans note : rien à en conclure.
    "network-requests": {
      title: "Requêtes réseau",
      score: null,
      scoreDisplayMode: "informative",
      details: { items: [{}, {}] },
    },
  },
};

describe("constatsDe", () => {
  const constats = constatsDe(LIGHTHOUSE);
  const ids = constats.map((c) => c.id);

  it("ne retient que les audits réellement en échec", () => {
    expect(ids).not.toContain("viewport");
    expect(ids).not.toContain("canonical");
    expect(ids).not.toContain("structured-data");
    expect(ids).not.toContain("network-requests");
    expect(constats).toHaveLength(5);
  });

  it("garde un audit `informative` qui porte un score — total-byte-weight", () => {
    expect(ids).toContain("total-byte-weight");
  });

  it("place les gains chiffrés en tête, du plus fort au plus faible", () => {
    expect(ids.slice(0, 2)).toEqual(["render-blocking-insight", "unused-javascript"]);
  });

  it("reprend les mots de Google sans les reformuler", () => {
    expect(constats[0]).toMatchObject({
      titre: "Requêtes de blocage du rendu",
      valeur: "Économies estimées : 3 650 ms",
      gainMs: 3650,
      elements: 3,
      verdict: "probleme",
    });
  });

  it("distingue le rouge de l'orange comme Google le fait", () => {
    expect(constats.find((c) => c.id === "unused-javascript")?.verdict).toBe("probleme");
    expect(constats.find((c) => c.id === "tap-targets")?.verdict).toBe("moyen");
  });

  it("laisse `valeur` et les gains à null plutôt que de mettre zéro", () => {
    const alt = constats.find((c) => c.id === "image-alt");
    expect(alt).toMatchObject({ valeur: null, gainMs: null, gainOctets: null, elements: 4 });
  });

  it("ne bronche pas sur une réponse sans audits", () => {
    expect(constatsDe({})).toEqual([]);
  });
});
