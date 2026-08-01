import {
  ORIGIN_ALL,
  ORIGIN_NONE,
  filterDemosByTemplate,
  siteLabel,
  splitClaudeSpaces,
  templateOrigin,
  templateOriginLabel,
} from "@/lib/site-builder/claude-spaces";

const tpl = (id: string, name: string, source?: string) => ({
  id,
  name,
  is_template: true,
  source_template_id: source ?? null,
});
const demo = (id: string, name: string, source: string | null) => ({
  id,
  name,
  is_template: false,
  source_template_id: source,
});

describe("splitClaudeSpaces", () => {
  it("range les modèles d'un côté et les démos de l'autre", () => {
    const { templates, demos } = splitClaudeSpaces([
      tpl("t1", "Plombier"),
      demo("d1", "Dupont", "t1"),
      demo("d2", "Martin", "t1"),
      tpl("t2", "Couvreur"),
    ]);

    expect(templates.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(demos.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("compte les démos issues de chaque template", () => {
    const { demoCountByTemplate } = splitClaudeSpaces([
      tpl("t1", "Plombier"),
      tpl("t2", "Couvreur"),
      demo("d1", "Dupont", "t1"),
      demo("d2", "Martin", "t1"),
      demo("d3", "Durand", "t2"),
      demo("d4", "Legacy", null),
    ]);

    expect(demoCountByTemplate).toEqual({ t1: 2, t2: 1 });
  });

  it("compte les variantes de template à part des démos", () => {
    // Un template dupliqué porte lui aussi source_template_id : le confondre
    // avec une démo ferait afficher « 2 sites créés » là où il n'y en a qu'un.
    const { demoCountByTemplate, variantCountByTemplate, templates } = splitClaudeSpaces([
      tpl("t1", "Plombier"),
      tpl("t1b", "Plombier (copie)", "t1"),
      demo("d1", "Dupont", "t1"),
    ]);

    expect(demoCountByTemplate).toEqual({ t1: 1 });
    expect(variantCountByTemplate).toEqual({ t1: 1 });
    expect(templates.map((t) => t.id)).toEqual(["t1", "t1b"]);
  });

  it("traite un site sans is_template comme une démo", () => {
    const { templates, demos } = splitClaudeSpaces([{ id: "d1", name: "Sans flag" }]);
    expect(templates).toHaveLength(0);
    expect(demos.map((d) => d.id)).toEqual(["d1"]);
  });

  it("indexe les noms par id", () => {
    const { nameById } = splitClaudeSpaces([tpl("t1", "Plombier"), demo("d1", "Dupont", "t1")]);
    expect(nameById).toEqual({ t1: "Plombier", d1: "Dupont" });
  });
});

describe("siteLabel", () => {
  it("remplace un nom vide ou absent", () => {
    expect(siteLabel({ id: "a", name: "  " })).toBe("Sans nom");
    expect(siteLabel({ id: "a" })).toBe("Sans nom");
    expect(siteLabel({ id: "a", name: " Plombier " })).toBe("Plombier");
  });
});

describe("templateOrigin", () => {
  const nameById = { t1: "Plombier" };

  it("résout le template quand il est toujours là", () => {
    expect(templateOrigin(demo("d1", "Dupont", "t1"), nameById)).toEqual({
      kind: "known",
      id: "t1",
      name: "Plombier",
    });
  });

  it("distingue un lien cassé d'une absence de lien", () => {
    expect(templateOrigin(demo("d1", "Dupont", "t9"), nameById)).toEqual({ kind: "missing", id: "t9" });
    expect(templateOrigin(demo("d2", "Legacy", null), nameById)).toEqual({ kind: "unknown" });
  });

  it("étiquette chaque cas", () => {
    expect(templateOriginLabel({ kind: "known", id: "t1", name: "Plombier" })).toBe("Plombier");
    expect(templateOriginLabel({ kind: "missing", id: "t9" })).toBe("Template supprimé");
    expect(templateOriginLabel({ kind: "unknown" })).toBe("Origine inconnue");
  });
});

describe("filterDemosByTemplate", () => {
  const nameById = { t1: "Plombier", t2: "Couvreur" };
  const demos = [
    demo("d1", "Dupont", "t1"),
    demo("d2", "Martin", "t2"),
    demo("d3", "Legacy", null),
    demo("d4", "Orphelin", "t9"),
  ];

  it("ne filtre rien sur ORIGIN_ALL", () => {
    expect(filterDemosByTemplate(demos, ORIGIN_ALL, nameById)).toHaveLength(4);
  });

  it("garde les démos d'un template donné", () => {
    expect(filterDemosByTemplate(demos, "t1", nameById).map((d) => d.id)).toEqual(["d1"]);
  });

  it("regroupe sous ORIGIN_NONE les démos sans template exploitable", () => {
    expect(filterDemosByTemplate(demos, ORIGIN_NONE, nameById).map((d) => d.id)).toEqual(["d3", "d4"]);
  });
});
