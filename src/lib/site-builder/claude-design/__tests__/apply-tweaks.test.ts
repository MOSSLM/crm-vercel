import { tweaksToCssVars, tweaksDataAttrs, tweaksFontLinkHref, tweakEnabled, tweaksExtrasScript } from "../apply-tweaks";

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

  it("maps the card-float sliders onto --fc-amp / --fc-dur", () => {
    const vars = tweaksToCssVars({ flotAmp: 18, flotDur: 3.5 });
    expect(vars["--fc-amp"]).toBe("18px");
    expect(vars["--fc-dur"]).toBe("3.5s");
    // 0 is a real amplitude (float off), not "unset"
    expect(tweaksToCssVars({ flotAmp: 0 })["--fc-amp"]).toBe("0px");
  });

  it("leaves the float vars to the stylesheet when the sliders are unset", () => {
    const vars = tweaksToCssVars({});
    expect(vars).not.toHaveProperty("--fc-amp");
    expect(vars).not.toHaveProperty("--fc-dur");
  });

  it("turns the motif intensity slider into the --pat-a alpha (0 → 1)", () => {
    expect(tweaksToCssVars({ motifIntensite: 80 })["--pat-a"]).toBe("0.8");
    expect(tweaksToCssVars({ motifIntensite: 0 })["--pat-a"]).toBe("0");
    expect(tweaksToCssVars({ motifIntensite: "35" })["--pat-a"]).toBe("0.35");
    // applyPatterns() always sets it — 55 % is the template's own default
    expect(tweaksToCssVars({})["--pat-a"]).toBe("0.55");
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

  it("writes the navbar style every skin's CSS gates on", () => {
    expect(tweaksDataAttrs({ navbar: "Flottante" })["data-nav"]).toBe("flottante");
    expect(tweaksDataAttrs({ navbar: "Classique" })["data-nav"]).toBe("classique");
    expect(tweaksDataAttrs({})["data-nav"]).toBe("classique");
  });

  it("maps the motif tweaks onto the patterns.css hooks", () => {
    const attrs = tweaksDataAttrs({ motif: "Lignes + croix", motifPortee: "Tout" });
    expect(attrs["data-pattern"]).toBe("lignes-croix");
    expect(attrs["data-pattern-scope"]).toBe("tout");
    expect(tweaksDataAttrs({ motif: "Aucun" })["data-pattern"]).toBe("aucun");
    // applyPatterns() runs with or without a saved theme → template defaults
    const bare = tweaksDataAttrs({});
    expect(bare["data-pattern"]).toBe("quadrille");
    expect(bare["data-pattern-scope"]).toBe("clair");
  });

  it("prefers this skin's own pattern table over the built-in one", () => {
    const sets = {
      fontSets: {}, weightSets: {}, cornerSets: {},
      patternSlugs: { "Béton": "beton" }, patternScopes: { "Partout": "tout" },
    };
    expect(tweaksDataAttrs({ motif: "Béton" }, sets)["data-pattern"]).toBe("beton");
    expect(tweaksDataAttrs({ motifPortee: "Partout" }, sets)["data-pattern-scope"]).toBe("tout");
    // the shared names still resolve through the built-in fallback
    expect(tweaksDataAttrs({ motif: "Points" }, sets)["data-pattern"]).toBe("points");
  });

  it("emits the artefact flags with the template's own defaults", () => {
    // motifHero / filets / croixAngles read `!== false` → ON when unset
    const bare = tweaksDataAttrs({});
    expect(bare["data-pattern-hero"]).toBe("");
    expect(bare["data-filets"]).toBe("");
    expect(bare["data-croix"]).toBe("");
    expect(bare).not.toHaveProperty("data-colonnes"); // opt-in

    const off = tweaksDataAttrs({ motifHero: false, filets: false, croixAngles: "false", colonnes: true });
    expect(off).not.toHaveProperty("data-pattern-hero");
    expect(off).not.toHaveProperty("data-filets");
    expect(off).not.toHaveProperty("data-croix");
    expect(off["data-colonnes"]).toBe("");
  });
});

describe("tweaksExtrasScript — stepperMobile (mobile deck)", () => {
  it("drives the runtime hook + seeds the key when set to Deck", () => {
    const js = tweaksExtrasScript({ stepperMobile: "Deck" });
    expect(js).toContain("cvc-stepper-mobile");
    expect(js).toContain('"deck"');
    expect(js).toContain("__cvcStepperMobile");
  });

  it("emits slides (default) so switching back off deactivates the deck", () => {
    const js = tweaksExtrasScript({ stepperMobile: "Slides" });
    expect(js).toContain('window.__cvcStepperMobile("slides")');
  });

  it("no-ops for an unknown value", () => {
    expect(tweaksExtrasScript({ stepperMobile: "???" })).not.toContain("cvc-stepper-mobile");
  });

  it("still applies stepperStyle and proStyle alongside", () => {
    const js = tweaksExtrasScript({ stepperStyle: "Pile", stepperMobile: "Deck", proStyle: "Deck" });
    expect(js).toContain("cvc-stepper-style");
    expect(js).toContain("cvc-stepper-mobile");
    expect(js).toContain("cvc-pro-style");
  });
});

describe("tweaksExtrasScript — zone d'intervention (rayonKm)", () => {
  it("seeds the key, stamps the map and refreshes the « … km » labels", () => {
    const js = tweaksExtrasScript({ rayonKm: 150 });
    expect(js).toContain("cvc-zone-rayon");
    expect(js).toContain("zone-leaflet");
    expect(js).toContain("data-radius-km");
    expect(js).toContain("data-zone-km");
    expect(js).toContain("window.setZoneRadiusKm(150)");
  });

  it("ignores a missing or nonsensical radius", () => {
    expect(tweaksExtrasScript({})).toBe("");
    expect(tweaksExtrasScript({ rayonKm: 0 })).toBe("");
    expect(tweaksExtrasScript({ rayonKm: "beaucoup" })).toBe("");
  });

  it("reads a radius round-tripped as a string", () => {
    expect(tweaksExtrasScript({ rayonKm: "80" })).toContain("window.setZoneRadiusKm(80)");
  });
});

describe("tweaksExtrasScript — ordering", () => {
  // site.js reads cvc-stepper-style / cvc-zone-rayon while it BUILDS the stepper
  // and the map. The seeds must therefore run straight away; only the element
  // work may wait for DOMContentLoaded.
  it("seeds localStorage outside — and before — the deferred block", () => {
    const js = tweaksExtrasScript({ stepperStyle: "Pile", rayonKm: 120 });
    // Everything after this marker is the body deferred to DOMContentLoaded.
    const deferred = js.indexOf("(function(){function r(){");
    expect(deferred).toBeGreaterThan(-1);
    expect(js).toContain("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',r);else r();");
    expect(js.indexOf("cvc-stepper-style")).toBeLessThan(deferred);
    expect(js.indexOf("cvc-zone-rayon")).toBeLessThan(deferred);
    expect(js.indexOf("querySelector('.solution-stepper')")).toBeGreaterThan(deferred);
    expect(js.indexOf("setZoneRadiusKm")).toBeGreaterThan(deferred);
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
