import {
  bestTemplateMatch,
  rankTemplateMatches,
  targetOptions,
  templateTokens,
} from "@/lib/site-builder/claude-design/match-templates";

/** La famille livrée par un export Claude : une maquette, trois habillages. */
const FAMILY = [
  { id: "c", name: "template CVC - Classique" },
  { id: "b", name: "template CVC - Brut" },
  { id: "a", name: "template CVC - Agence" },
];

const ids = (list: Array<{ template: { id: string } }>) => list.map((m) => m.template.id);

describe("templateTokens", () => {
  it("ne garde que les mots qui identifient un habillage", () => {
    expect(templateTokens("template CVC - Classique")).toEqual(["cvc", "classique"]);
    expect(templateTokens("Template Site Web Design")).toEqual([]);
    expect(templateTokens("CVC Brut (copie) v2")).toEqual(["cvc", "brut"]);
  });

  it("ignore accents et ponctuation", () => {
    expect(templateTokens("Template CVC — Agence")).toEqual(["cvc", "agence"]);
  });
});

describe("rankTemplateMatches", () => {
  it("ne propose que l'habillage visé, pas ses frères", () => {
    const ranked = rankTemplateMatches("template CVC - Classique", FAMILY);
    expect(ids(ranked)).toEqual(["c"]);
    expect(ranked[0].reason).toBe("exact");
  });

  it("retrouve un template renommé plus court", () => {
    const ranked = rankTemplateMatches("template CVC - Brut", [
      { id: "b", name: "Brut" },
      { id: "c", name: "Classique" },
    ]);
    expect(ids(ranked)).toEqual(["b"]);
    expect(ranked[0].reason).toBe("proche");
  });

  it("ignore le mot commun à toute la famille", () => {
    // « CVC » est sur les trois : le retenir rapprocherait Classique de Brut.
    expect(ids(rankTemplateMatches("template CVC - Brut", FAMILY))).toEqual(["b"]);
  });

  it("rapproche par mot distinctif quand les noms ne s'emboîtent pas", () => {
    const ranked = rankTemplateMatches("Plomberie Brut 2026", FAMILY);
    expect(ids(ranked)).toEqual(["b"]);
    expect(ranked[0].reason).toBe("variante");
  });

  it("ne renvoie rien quand aucun nom ne se recoupe", () => {
    expect(rankTemplateMatches("Boulangerie Moderne", FAMILY)).toEqual([]);
  });

  it("ne renvoie rien quand le nom du ZIP n'a que des mots génériques", () => {
    expect(rankTemplateMatches("template design", FAMILY)).toEqual([]);
  });

  it("classe l'exact avant le proche", () => {
    const ranked = rankTemplateMatches("CVC Classique", [
      { id: "long", name: "CVC Classique Premium" },
      { id: "exact", name: "template CVC - Classique" },
    ]);
    expect(ids(ranked)).toEqual(["exact", "long"]);
  });

  it("supporte une liste vide", () => {
    expect(rankTemplateMatches("CVC Classique", [])).toEqual([]);
  });
});

describe("bestTemplateMatch", () => {
  it("désigne la cible évidente", () => {
    expect(bestTemplateMatch("template CVC - Agence", FAMILY)?.id).toBe("a");
  });

  it("refuse de trancher entre deux candidats de même niveau", () => {
    // Deux templates portant le même nom : à l'opérateur de choisir.
    const ambigu = [
      { id: "x", name: "CVC Classique" },
      { id: "y", name: "template CVC - Classique" },
    ];
    expect(bestTemplateMatch("CVC Classique", ambigu)).toBeNull();
  });

  it("renvoie null quand rien ne correspond", () => {
    expect(bestTemplateMatch("Boulangerie", FAMILY)).toBeNull();
  });
});

describe("targetOptions", () => {
  it("ne propose que l'habillage visé et compte ce qu'il masque", () => {
    const o = targetOptions("template CVC - Classique", FAMILY);
    expect(o.targets.map((t) => t.id)).toEqual(["c"]);
    expect(o.hiddenCount).toBe(2);
    expect(o.opened).toBe(false);
    expect(o.reasonById).toEqual({ c: "exact" });
  });

  it("ouvre la liste complète sur demande", () => {
    const o = targetOptions("template CVC - Classique", FAMILY, { showAll: true });
    expect(o.targets.map((t) => t.id)).toEqual(["c", "b", "a"]);
    expect(o.hiddenCount).toBe(0);
    expect(o.opened).toBe(true);
  });

  it("ouvre la liste quand rien ne correspond, plutôt que de ne rien proposer", () => {
    const o = targetOptions("Boulangerie Moderne", FAMILY);
    expect(o.targets).toHaveLength(3);
    expect(o.opened).toBe(true);
    expect(o.reasonById).toEqual({});
  });

  it("ouvre la liste quand la cible déjà choisie sort des correspondances", () => {
    // Sinon le menu afficherait une valeur qu'aucune option ne porte : vide.
    const o = targetOptions("template CVC - Classique", FAMILY, { currentTargetId: "b" });
    expect(o.targets.map((t) => t.id)).toContain("b");
    expect(o.opened).toBe(true);
  });

  it("reste restreint quand la cible choisie fait partie des correspondances", () => {
    const o = targetOptions("template CVC - Classique", FAMILY, { currentTargetId: "c" });
    expect(o.targets.map((t) => t.id)).toEqual(["c"]);
    expect(o.opened).toBe(false);
  });

  it("supporte l'absence de template existant", () => {
    const o = targetOptions("template CVC - Classique", []);
    expect(o).toEqual({ targets: [], reasonById: {}, hiddenCount: 0, opened: true });
  });
});
