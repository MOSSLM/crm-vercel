import { parseTweakControls, buildTweaksSchema, sliderValue } from "../parse-tweaks-schema";

const THEME_JSX = `
const FOND_OPTS = ["#FAF6EF", "#FDFBF7", "#FFFFFF"];
const ACCENT_OPTS = ["#5B9BD5", "#3FA88B"];
function ThemeControls({ t, setTweak }) {
  return (
    <React.Fragment>
      <TweakSection label="Couleurs de fond" />
      <TweakColor label="Fond principal" value={t.fond} options={FOND_OPTS}
                  onChange={(v) => setTweak("fond", v)} />
      <TweakSection label="Accents" />
      <TweakColor label="Accent principal" value={t.accent} options={ACCENT_OPTS}
                  onChange={(v) => setTweak("accent", v)} />
      <TweakSection label="Typographie" />
      <TweakSelect label="Style de police" value={t.police}
                   options={["Éditorial", "Magazine", "Net"]}
                   onChange={(v) => setTweak("police", v)} />
    </React.Fragment>
  );
}
`;

const SERVICE_JSX = `
function TweaksApp() {
  return (
    <TweaksPanel>
      <ThemeControls t={t} setTweak={setTweak} />
      <TweakSection label="Section configuration" />
      <TweakRadio label="Style du sélecteur" value={t.stepperStyle}
        options={["Encadré", "Flottant", "Pile", "Roue"]}
        onChange={(v) => setTweak("stepperStyle", v)} />
      <TweakRadio label="Affichage" value={t.proStyle}
        options={["Slider", "Deck"]}
        onChange={(v) => setTweak("proStyle", v)} />
    </TweaksPanel>
  );
}
`;

// Mirrors the real index-tweaks.jsx: a "Sections" group with two TweakToggle
// switches, then the shared <ThemeControls/> reference.
const INDEX_JSX = `
function TweaksApp() {
  return (
    <TweaksPanel>
      <TweakSection label="Sections" />
      <TweakToggle label="Masquer les certifications" value={!!t.masquerCertifications}
                   onChange={(v) => setTweak("masquerCertifications", v)} />
      <TweakToggle label="Masquer les marques partenaires" value={!!t.masquerMarques}
                   onChange={(v) => setTweak("masquerMarques", v)} />
      <ThemeControls t={t} setTweak={setTweak} />
    </TweaksPanel>
  );
}
`;

// Verbatim from the CVC export's theme-tweaks.jsx (Classique): the motif +
// flottement block, whose four TweakSlider used to vanish from the panel.
const SLIDER_JSX = `
function ThemeControls({ t, setTweak }) {
  return (
    <React.Fragment>
      <TweakSection label="Motif de fond" />
      <TweakSelect label="Motif" value={t.motif || "Quadrillé"}
                   options={["Aucun", "Quadrillé", "Mixte"]}
                   onChange={(v) => setTweak("motif", v)} />
      <TweakSlider label="Intensité" value={t.motifIntensite == null ? 55 : t.motifIntensite}
                   min={0} max={100} step={5} unit="%"
                   onChange={(v) => setTweak("motifIntensite", v)} />
      <TweakRadio label="Sections concernées" value={t.motifPortee || "Claires"}
                  options={["Alternées", "Claires", "Tout"]}
                  onChange={(v) => setTweak("motifPortee", v)} />
      <TweakToggle label="Motif dans le héros" value={t.motifHero !== false}
                   onChange={(v) => setTweak("motifHero", v)} />

      <TweakSection label="Flottement des cartes" />
      <TweakSlider label="Amplitude" value={t.flotAmp != null ? t.flotAmp : 9} min={0} max={26} step={1} unit="px"
                   onChange={(v) => setTweak("flotAmp", v)} />
      <TweakSlider label="Durée d'un aller-retour" value={t.flotDur != null ? t.flotDur : 6.5} min={1.5} max={14} step={0.5} unit="s"
                   onChange={(v) => setTweak("flotDur", v)} />
    </React.Fragment>
  );
}
`;

// The zone slider every page's own *-tweaks.jsx carries, alongside the extras.
const ZONE_JSX = `
function TweaksApp() {
  return (
    <TweaksPanel>
      <ThemeControls t={t} setTweak={setTweak} />
      <TweakSection label="Zone d'intervention" />
      <TweakSlider label="Rayon" value={t.rayonKm} min={5} max={300} step={5} unit=" km"
                   onChange={(v) => setTweak("rayonKm", v)} />
    </TweaksPanel>
  );
}
`;

describe("parseTweakControls", () => {
  it("extracts boolean TweakToggle controls (no options)", () => {
    const controls = parseTweakControls(INDEX_JSX);
    expect(controls.map((c) => c.key)).toEqual(["masquerCertifications", "masquerMarques"]);
    const certifs = controls.find((c) => c.key === "masquerCertifications")!;
    expect(certifs.type).toBe("toggle");
    expect(certifs.label).toBe("Masquer les certifications");
    expect(certifs.options).toEqual([]);
    expect(certifs.group).toBe("Sections");
    expect(controls.find((c) => c.key === "masquerMarques")!.type).toBe("toggle");
  });

  it("extracts colors (resolving named palettes), selects, and groups", () => {
    const controls = parseTweakControls(THEME_JSX);
    const fond = controls.find((c) => c.key === "fond")!;
    expect(fond.type).toBe("color");
    expect(fond.options).toEqual(["#FAF6EF", "#FDFBF7", "#FFFFFF"]);
    expect(fond.group).toBe("Couleurs de fond");
    const accent = controls.find((c) => c.key === "accent")!;
    expect(accent.group).toBe("Accents");
    const police = controls.find((c) => c.key === "police")!;
    expect(police.type).toBe("select");
    expect(police.options).toEqual(["Éditorial", "Magazine", "Net"]);
  });

  it("extracts TweakSlider controls with their bounds, unit and default", () => {
    const controls = parseTweakControls(SLIDER_JSX);
    // Every control of the block is present, in document order — the sliders
    // used to be dropped silently, taking three of the seven with them.
    expect(controls.map((c) => c.key)).toEqual([
      "motif", "motifIntensite", "motifPortee", "motifHero", "flotAmp", "flotDur",
    ]);

    const intensite = controls.find((c) => c.key === "motifIntensite")!;
    expect(intensite.type).toBe("slider");
    expect(intensite.label).toBe("Intensité");
    expect(intensite.group).toBe("Motif de fond");
    expect(intensite).toMatchObject({ min: 0, max: 100, step: 5, unit: "%", defaultValue: 55 });

    // `value={t.flotAmp != null ? t.flotAmp : 9}` — the fallback is the LAST literal.
    expect(controls.find((c) => c.key === "flotAmp")!).toMatchObject({ min: 0, max: 26, step: 1, unit: "px", defaultValue: 9 });
    // Fractional bounds/step survive.
    expect(controls.find((c) => c.key === "flotDur")!).toMatchObject({ min: 1.5, max: 14, step: 0.5, unit: "s", defaultValue: 6.5 });
  });

  it("keeps a unit's leading space and omits a default the JSX doesn't bake in", () => {
    const rayon = parseTweakControls(ZONE_JSX).find((c) => c.key === "rayonKm")!;
    expect(rayon.type).toBe("slider");
    expect(rayon.unit).toBe(" km"); // rendered as "100 km", not "100km"
    expect(rayon.defaultValue).toBeUndefined(); // `value={t.rayonKm}` — no literal
    expect(rayon.group).toBe("Zone d'intervention");
  });

  it("keeps a control type it has never seen, inferring it from the props", () => {
    const controls = parseTweakControls(`
      <TweakNumber label="Colonnes" value={t.cols} min={1} max={6} step={1}
                   onChange={(v) => setTweak("cols", v)} />
      <TweakChips label="Ambiance" options={["Jour", "Nuit"]}
                  onChange={(v) => setTweak("ambiance", v)} />
      <TweakSwitch label="Grain" value={!!t.grain} onChange={(v) => setTweak("grain", v)} />
    `);
    expect(controls.map((c) => [c.key, c.type])).toEqual([
      ["cols", "slider"], ["ambiance", "radio"], ["grain", "toggle"],
    ]);
    expect(controls[1].options).toEqual(["Jour", "Nuit"]);
  });

  it("extracts inline radio options", () => {
    const controls = parseTweakControls(SERVICE_JSX);
    const stepper = controls.find((c) => c.key === "stepperStyle")!;
    expect(stepper.type).toBe("radio");
    expect(stepper.options).toEqual(["Encadré", "Flottant", "Pile", "Roue"]);
    expect(controls.find((c) => c.key === "proStyle")!.options).toEqual(["Slider", "Deck"]);
  });
});

describe("buildTweaksSchema", () => {
  it("separates theme controls from per-page extras", () => {
    const schema = buildTweaksSchema(THEME_JSX, { "/service-clim": SERVICE_JSX, "/": "" });
    expect(schema.theme.map((c) => c.key)).toEqual(["fond", "accent", "police"]);
    // service page gets only the non-theme extras (stepper/pro)
    expect(schema.pageExtras["/service-clim"].map((c) => c.key)).toEqual(["stepperStyle", "proStyle"]);
    // index ("/") with no extras is absent
    expect(schema.pageExtras["/"]).toBeUndefined();
  });

  it("keeps the home page's section toggles as per-page extras", () => {
    const schema = buildTweaksSchema(THEME_JSX, { "/": INDEX_JSX });
    expect(schema.pageExtras["/"].map((c) => c.key)).toEqual(["masquerCertifications", "masquerMarques"]);
    expect(schema.pageExtras["/"].every((c) => c.type === "toggle")).toBe(true);
  });

  it("keeps the per-page zone slider as an extra", () => {
    const schema = buildTweaksSchema(SLIDER_JSX, { "/": ZONE_JSX });
    expect(schema.theme.map((c) => c.key)).toContain("motifIntensite");
    expect(schema.pageExtras["/"].map((c) => c.key)).toEqual(["rayonKm"]);
  });
});

describe("sliderValue", () => {
  const control = { key: "flotAmp", type: "slider" as const, label: "Amplitude", options: [], min: 0, max: 26, defaultValue: 9 };

  it("prefers the site's stored value", () => {
    expect(sliderValue(control, 14)).toBe(14);
    expect(sliderValue(control, 0)).toBe(0); // a real 0 is not "missing"
  });

  it("reads a value round-tripped as a string", () => {
    expect(sliderValue(control, "6.5")).toBe(6.5);
  });

  it("falls back to the schema default, then to the low bound", () => {
    expect(sliderValue(control, undefined)).toBe(9);
    expect(sliderValue({ ...control, defaultValue: undefined }, undefined)).toBe(0);
    expect(sliderValue({ key: "x", type: "slider", label: "", options: [] }, "oups")).toBe(0);
  });
});
