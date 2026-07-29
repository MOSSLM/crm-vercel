import { variableDisplay } from "../variable-display";
import { parseVariablesSource, describeProjectSource, describeStatsSource } from "../../variables-source";

describe("variableDisplay", () => {
  it("shows the company's own value when there is one", () => {
    expect(variableDisplay("12", "15", true)).toEqual({ text: "12", kind: "value" });
  });

  // Le bug observé : la liste affichait « 15 » (l'échantillon du template) pour
  // une variable en réalité vide, contredisant le panneau Diagnostic juste
  // au-dessus qui la signalait comme manquante.
  it("says 'vide' instead of falling back to the sample", () => {
    expect(variableDisplay("", "15", true)).toEqual({ text: "vide", kind: "empty" });
    expect(variableDisplay(undefined, "15", true)).toEqual({ text: "vide", kind: "empty" });
    expect(variableDisplay("   ", "15", true)).toEqual({ text: "vide", kind: "empty" });
  });

  it("shows the sample only when no company is applied", () => {
    expect(variableDisplay(undefined, "15", false)).toEqual({ text: "15", kind: "sample" });
    expect(variableDisplay("12", "15", false)).toEqual({ text: "15", kind: "sample" });
  });

  it("falls back to a dash when there is no sample either", () => {
    expect(variableDisplay(undefined, "", false)).toEqual({ text: "—", kind: "sample" });
  });
});

describe("parseVariablesSource", () => {
  it("reads the __source key", () => {
    const vars = {
      __source: JSON.stringify({
        projectId: "p1",
        projectSource: "site",
        candidates: 3,
        statsSource: "project",
      }),
    };
    expect(parseVariablesSource(vars)).toEqual({
      projectId: "p1",
      projectSource: "site",
      candidates: 3,
      statsSource: "project",
    });
  });

  it("is tolerant: missing, malformed or partial payloads never throw", () => {
    expect(parseVariablesSource(undefined)).toBeNull();
    expect(parseVariablesSource({})).toBeNull();
    expect(parseVariablesSource({ __source: "pas du json" })).toBeNull();
    expect(parseVariablesSource({ __source: "{}" })).toEqual({
      projectId: null,
      projectSource: "none",
      candidates: 0,
      statsSource: "none",
    });
  });
});

describe("descriptions", () => {
  // Ces phrases sont tout l'intérêt du panneau : « vide » doit devenir
  // actionnable sans ouvrir la base.
  it("names the ambiguity when several projects exist", () => {
    expect(
      describeProjectSource({ projectId: "p", projectSource: "ranked", candidates: 3, statsSource: "none" }),
    ).toContain("3");
    expect(
      describeProjectSource({ projectId: "p", projectSource: "site", candidates: 1, statsSource: "none" }),
    ).toBe("projet lié au site");
    expect(
      describeProjectSource({ projectId: null, projectSource: "none", candidates: 0, statsSource: "none" }),
    ).toContain("aucun projet");
  });

  it("names where the key figures came from", () => {
    const base = { projectId: "p", projectSource: "site" as const, candidates: 1 };
    expect(describeStatsSource({ ...base, statsSource: "project" })).toContain("projet");
    expect(describeStatsSource({ ...base, statsSource: "entreprise" })).toContain("fiche entreprise");
    expect(describeStatsSource({ ...base, statsSource: "none" })).toContain("aucun");
  });
});
