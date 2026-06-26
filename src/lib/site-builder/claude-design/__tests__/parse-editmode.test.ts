import { parseEditmode, mergeTweaksDefaults } from "../parse-editmode";

const INDEX_TWEAKS = `
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "fond": "#FAF6EF",
  "accent": "#5B9BD5",
  "police": "Éditorial",
  "angles": "Doux"
}/*EDITMODE-END*/;
function TweaksApp(){}
`;

const SERVICE_TWEAKS = `
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "fond": "#000000",
  "stepperStyle": "Pile",
  "proStyle": "Deck"
}/*EDITMODE-END*/;
`;

describe("parseEditmode", () => {
  it("extracts the defaults object between the markers", () => {
    expect(parseEditmode(INDEX_TWEAKS)).toEqual({
      fond: "#FAF6EF",
      accent: "#5B9BD5",
      police: "Éditorial",
      angles: "Doux",
    });
  });

  it("returns {} when the markers are missing or the body is invalid", () => {
    expect(parseEditmode("const x = 1;")).toEqual({});
    expect(parseEditmode("/*EDITMODE-BEGIN*/ not json /*EDITMODE-END*/")).toEqual({});
    expect(parseEditmode("")).toEqual({});
  });
});

describe("mergeTweaksDefaults", () => {
  it("keeps the first value for shared keys and adds page-specific extras", () => {
    const merged = mergeTweaksDefaults([parseEditmode(INDEX_TWEAKS), parseEditmode(SERVICE_TWEAKS)]);
    expect(merged.fond).toBe("#FAF6EF"); // index wins
    expect(merged.stepperStyle).toBe("Pile");
    expect(merged.proStyle).toBe("Deck");
  });
});
