import { parseTweakControls, buildTweaksSchema } from "../parse-tweaks-schema";

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

describe("parseTweakControls", () => {
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
});
