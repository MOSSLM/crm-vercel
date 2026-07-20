import { tweaksToCssVars, tweaksDataAttrs, tweaksFontLinkHref, tweakEnabled } from "../apply-tweaks";

describe("tweaksToCssVars", () => {
  it("maps base colors when present", () => {
    const vars = tweaksToCssVars({ fond: "#FAF6EF", sombre: "#0B2440", accent: "#5B9BD5", accentChaud: "#C97B5A" });
    expect(vars["--cream"]).toBe("#FAF6EF");
    expect(vars["--night"]).toBe("#0B2440");
    expect(vars["--azur"]).toBe("#5B9BD5");
    expect(vars["--terra"]).toBe("#C97B5A");
  });

  it("resolves corners from `angles` (port of theme-apply.js CORNER_SETS)", () => {
    expect(tweaksToCssVars({ angles: "Net" })["--r-card"]).toBe("5px");
    expect(tweaksToCssVars({ angles: "Zéro" })["--r-img"]).toBe("0px");
    // unknown / missing → Doux fallback
    expect(tweaksToCssVars({})["--r-pill"]).toBe("999px");
  });

  it("resolves weights from `epaisseur`", () => {
    const vars = tweaksToCssVars({ epaisseur: "Gras" });
    expect(vars["--w-head"]).toBe("800");
    expect(vars["--w-body"]).toBe("600");
  });

  it("resolves fonts from `police`", () => {
    const vars = tweaksToCssVars({ police: "Net" });
    expect(vars["--serif"]).toContain("Space Grotesk");
    expect(vars["--sans"]).toContain("DM Sans");
  });
});

describe("tweaksDataAttrs", () => {
  it("returns the html data-* attrs the template's CSS gates on", () => {
    const attrs = tweaksDataAttrs({ police: "Moderne", epaisseur: "Léger" });
    expect(attrs["data-font"]).toBe("moderne");
    expect(attrs["data-weight"]).toBe("leger");
    expect(attrs["data-font-serif"]).toBe("0"); // Moderne is sans-serif
    expect(tweaksDataAttrs({ police: "Éditorial" })["data-font-serif"]).toBe("1");
  });

  it("omits the section-hide flags by default (sections shown)", () => {
    const attrs = tweaksDataAttrs({});
    expect(attrs).not.toHaveProperty("data-hide-certifs");
    expect(attrs).not.toHaveProperty("data-hide-marques");
    // an explicit OFF must not emit the flag either (string "false" reads OFF)
    const off = tweaksDataAttrs({ masquerCertifications: false, masquerMarques: "false" });
    expect(off).not.toHaveProperty("data-hide-certifs");
    expect(off).not.toHaveProperty("data-hide-marques");
  });

  it("emits present-only hide flags when the section toggles are ON", () => {
    const attrs = tweaksDataAttrs({ masquerCertifications: true, masquerMarques: true });
    expect(attrs["data-hide-certifs"]).toBe("");
    expect(attrs["data-hide-marques"]).toBe("");
  });

  it("hides only the toggled section", () => {
    const attrs = tweaksDataAttrs({ masquerCertifications: true });
    expect(attrs["data-hide-certifs"]).toBe("");
    expect(attrs).not.toHaveProperty("data-hide-marques");
  });
});

describe("tweakEnabled", () => {
  it("reads real booleans", () => {
    expect(tweakEnabled(true)).toBe(true);
    expect(tweakEnabled(false)).toBe(false);
  });
  it("treats only true-ish strings as ON ('false' is OFF)", () => {
    expect(tweakEnabled("true")).toBe(true);
    expect(tweakEnabled("1")).toBe(true);
    expect(tweakEnabled("on")).toBe(true);
    expect(tweakEnabled("false")).toBe(false);
    expect(tweakEnabled("")).toBe(false);
    expect(tweakEnabled(undefined)).toBe(false);
    expect(tweakEnabled(0)).toBe(false);
  });
});

describe("tweaksFontLinkHref", () => {
  it("builds the Google Fonts URL for the chosen typeface", () => {
    const href = tweaksFontLinkHref({ police: "Magazine" });
    expect(href).toContain("fonts.googleapis.com");
    expect(href).toContain("Playfair+Display");
    expect(href).toContain("display=swap");
  });
});
