import { parseThemeSets, coerceThemeSets } from "../parse-theme-sets";
import { tweaksToCssVars, tweaksDataAttrs, tweaksFontLinkHref } from "../apply-tweaks";

/** Verbatim shape of a skin's theme-apply.js: unquoted keys, single-quoted
 *  values containing double quotes, comments — none of it JSON-parsable. */
const BRUT = `
(function () {
  var GOOGLE = "https://fonts.googleapis.com/css2?family=";

  // Jeux de polices. key → utilisé par theme-tokens.css.
  var FONT_SETS = {
    "Chantier": {
      key: "chantier",
      head: '"Archivo", system-ui, sans-serif',
      body: '"Barlow", system-ui, sans-serif',
      g: "Archivo:wght@400;500&family=Barlow:wght@300;400"
    },
    "Éditorial": {
      key: "editorial", serif: true,
      head: '"Cormorant Garamond", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
      g: "Cormorant+Garamond:wght@400"
    }
  };

  var WEIGHT_SETS = {
    "Chantier": { key: "chantier", head: "800", body: "400" },
    "Normal":   { key: "normal",   head: "500", body: "400" }
  };

  /* rondeurs */
  var CORNER_SETS = {
    "Zéro":  ["0px", "0px", "0px"],
    "Doux":  ["22px", "16px", "999px"]
  };
})();
`;

const AGENCY = `
var FONT_SETS = {
  "Agence": { key: "agence", head: '"Sora", sans-serif', body: '"Manrope", sans-serif', g: "Sora:wght@400" }
};
var CORNER_SETS = { "Agence": ["18px", "14px", "10px"] };
`;

describe("parseThemeSets", () => {
  it("reads a skin's tables out of its theme-apply.js", () => {
    const sets = parseThemeSets(BRUT)!;
    expect(Object.keys(sets.fontSets)).toEqual(["Chantier", "Éditorial"]);
    expect(sets.fontSets["Chantier"]).toEqual({
      key: "chantier",
      head: '"Archivo", system-ui, sans-serif',
      body: '"Barlow", system-ui, sans-serif',
      g: "Archivo:wght@400;500&family=Barlow:wght@300;400",
      serif: false,
    });
    expect(sets.fontSets["Éditorial"].serif).toBe(true);
    expect(sets.weightSets["Chantier"]).toEqual({ key: "chantier", head: "800", body: "400" });
    expect(sets.cornerSets["Doux"]).toEqual(["22px", "16px", "999px"]);
  });

  it("returns null when there is nothing usable to read", () => {
    expect(parseThemeSets("")).toBeNull();
    expect(parseThemeSets("var x = 1;")).toBeNull();
  });

  it("survives a table it cannot parse without losing the others", () => {
    const broken = `var FONT_SETS = { "A": { head: '"X"', body: '"Y"' } }; var CORNER_SETS = { oops`;
    const sets = parseThemeSets(broken)!;
    expect(Object.keys(sets.fontSets)).toEqual(["A"]);
    expect(sets.cornerSets).toEqual({});
  });
});

describe("apply-tweaks with a skin's own tables", () => {
  it("applies Brut's typeface instead of falling back to the first design's", () => {
    const sets = parseThemeSets(BRUT);
    const vars = tweaksToCssVars({ police: "Chantier", epaisseur: "Chantier" }, sets);
    expect(vars["--serif"]).toBe('"Archivo", system-ui, sans-serif');
    expect(vars["--sans"]).toBe('"Barlow", system-ui, sans-serif');
    expect(vars["--w-head"]).toBe("800");
    expect(tweaksDataAttrs({ police: "Chantier" }, sets)["data-font"]).toBe("chantier");
    expect(tweaksFontLinkHref({ police: "Chantier" }, sets)).toContain("Archivo");
  });

  it("regression: without the tables, Chantier silently became Cormorant Garamond", () => {
    const vars = tweaksToCssVars({ police: "Chantier" });
    expect(vars["--serif"]).toContain("Cormorant Garamond");
  });

  it("falls back inside the skin's own table, not to a name it doesn't have", () => {
    // Agency ships no "Éditorial": resolving an unknown value must stay in-skin.
    const sets = parseThemeSets(AGENCY);
    const vars = tweaksToCssVars({ police: "Inconnue", angles: "Inconnu" }, sets);
    expect(vars["--serif"]).toBe('"Sora", sans-serif');
    expect(vars["--r-img"]).toBe("18px");
  });

  it("still resolves shared entries the skin did not redefine", () => {
    const sets = parseThemeSets(AGENCY);
    // "Doux" is a built-in the Agency table doesn't override.
    expect(tweaksToCssVars({ angles: "Doux" }, sets)["--r-pill"]).toBe("999px");
  });

  it("keeps the built-in behaviour when a template has no stored tables", () => {
    expect(tweaksToCssVars({ police: "Net" }, null)["--serif"]).toContain("Space Grotesk");
    expect(tweaksToCssVars({ angles: "Net" }, null)["--r-card"]).toBe("5px");
  });
});

describe("coerceThemeSets", () => {
  it("narrows what was stored in shared_assets, and rejects junk", () => {
    const stored = JSON.parse(JSON.stringify(parseThemeSets(BRUT)));
    expect(coerceThemeSets(stored)!.fontSets["Chantier"].head).toContain("Archivo");
    expect(coerceThemeSets(null)).toBeNull();
    expect(coerceThemeSets({})).toBeNull();
    expect(coerceThemeSets({ fontSets: { A: { head: 1 } } })).toBeNull();
  });
});
