import {
  SERVICE_TAGS_TAXONOMY,
  buildServiceTagCatalog,
  collectServiceTags,
  isServiceTagAllowed,
} from "../serviceTags";

/**
 * Le menu déroulant de la fiche doit proposer TOUS les tags autorisés — pas
 * seulement ceux qu'une entreprise porte déjà.
 */
describe("collectServiceTags", () => {
  it("propose toute la taxonomie même sans aucune entreprise", () => {
    const tags = collectServiceTags({});
    for (const tag of SERVICE_TAGS_TAXONOMY) expect(tags).toContain(tag);
  });

  it("ajoute les tags réellement portés par les entreprises", () => {
    expect(collectServiceTags({ used: ["Bornes IRVE"] })).toContain("Bornes IRVE");
  });

  it("ajoute les tags connus des Paramètres, même posés sur aucune entreprise", () => {
    const tags = collectServiceTags({ settings: [{ tag: "Désembouage", allowed: true }] });
    expect(tags).toContain("Désembouage");
  });

  it("garde les tags bloqués : les Paramètres doivent pouvoir les réautoriser", () => {
    expect(collectServiceTags({ settings: [{ tag: "chauffage", allowed: false }] })).toContain(
      "chauffage",
    );
  });

  it("ne retient qu'une graphie par tag, celle des entreprises", () => {
    const tags = collectServiceTags({ used: ["Climatisation", "climatisation"] });
    expect(tags.filter((t) => t.toLowerCase() === "climatisation")).toEqual(["Climatisation"]);
  });

  it("réunit les graphies équivalentes malgré accents et tirets", () => {
    const tags = collectServiceTags({ used: ["Pompe à chaleur", "pompe-a-chaleur"] });
    expect(tags.filter((t) => t.toLowerCase().startsWith("pompe"))).toEqual(["Pompe à chaleur"]);
  });

  it("écarte les étiquettes d'annuaire qui ne sont pas des services", () => {
    expect(collectServiceTags({ used: ["Artisanat", "Chauffagiste"] })).not.toContain("Artisanat");
  });

  it("trie en français, sans se laisser piéger par les accents", () => {
    const tags = collectServiceTags({ used: ["Zonage", "Éclairage"] });
    expect(tags.indexOf("Éclairage")).toBeLessThan(tags.indexOf("Zonage"));
  });

  it("ignore les entrées vides", () => {
    expect(collectServiceTags({ used: ["", "   "], settings: [{ tag: null }] })).toEqual(
      [...SERVICE_TAGS_TAXONOMY].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    );
  });
});

describe("buildServiceTagCatalog", () => {
  it("retire les tags bloqués dans les Paramètres", () => {
    const tags = buildServiceTagCatalog({ settings: [{ tag: "chauffage", allowed: false }] });
    expect(tags).not.toContain("chauffage");
    expect(tags).toContain("plomberie");
  });

  it("bloque toutes les graphies d'un tag interdit", () => {
    const tags = buildServiceTagCatalog({
      used: ["Climatisation"],
      settings: [{ tag: "climatisation", allowed: false }],
    });
    expect(tags.some((t) => t.toLowerCase() === "climatisation")).toBe(false);
  });

  it("laisse passer un tag sans ligne dans l'allowlist", () => {
    expect(buildServiceTagCatalog({ used: ["Bornes IRVE"], settings: [] })).toContain("Bornes IRVE");
  });
});

describe("isServiceTagAllowed", () => {
  it("autorise par défaut un tag absent de l'allowlist", () => {
    expect(isServiceTagAllowed("Bornes IRVE", [])).toBe(true);
    expect(isServiceTagAllowed("Bornes IRVE", null)).toBe(true);
  });

  it("reconnaît le blocage quelle que soit la graphie", () => {
    expect(isServiceTagAllowed("Pompe à chaleur", [{ tag: "pompe-a-chaleur", allowed: false }])).toBe(
      false,
    );
  });

  it("suit le catalogue quand deux graphies se contredisent : bloqué l'emporte", () => {
    const settings = [
      { tag: "climatisation", allowed: false },
      { tag: "Climatisation", allowed: true },
    ];
    expect(isServiceTagAllowed("Climatisation", settings)).toBe(false);
    expect(buildServiceTagCatalog({ used: ["Climatisation"], settings })).not.toContain(
      "Climatisation",
    );
  });
});
