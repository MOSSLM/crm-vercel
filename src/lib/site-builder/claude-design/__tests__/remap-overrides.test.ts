import { remapOverrides, splitOverrideKey } from "../remap-overrides";

const HTML = `
<section class="hero">
  <div class="ph ph--azur hero-photo"><span class="ph-label">Photo — technicien devant une PAC</span></div>
  <h1>Titre</h1>
</section>
<section class="brands">
  <img class="brand-logo b1" alt="Daikin" src="https://cdn/a.webp">
  <img class="brand-logo b2" alt="Bosch" src="https://cdn/b.webp">
</section>`;

/** Same body, different theme variant: accent classes + image URLs differ. */
const SIBLING = `
<section class="hero">
  <div class="ph ph--terra hero-photo"><span class="ph-label">Photo — technicien devant une PAC</span></div>
  <h1>Titre</h1>
</section>
<section class="brands">
  <img class="brand-logo b1" alt="Daikin" src="https://cdn/other-a.webp">
  <img class="brand-logo b2" alt="Bosch" src="https://cdn/other-b.webp">
</section>`;

const OVERRIDES = {
  "0.0:bg_image": { kind: "bg_image", value: "https://cdn/hero.webp" },
  "1.0:image": { kind: "image", value: "https://cdn/daikin.webp" },
  "1.1:image": { kind: "image", value: "https://cdn/bosch.webp" },
};

describe("splitOverrideKey", () => {
  it("splits on the LAST colon so a path is never truncated", () => {
    expect(splitOverrideKey("3.1.0:image")).toEqual({ path: "3.1.0", kind: "image" });
    expect(splitOverrideKey("0:image_set")).toEqual({ path: "0", kind: "image_set" });
  });
});

describe("remapOverrides", () => {
  it("keeps every path when the markup is unchanged", () => {
    const { overrides, dropped, uncertain } = remapOverrides(HTML, HTML, OVERRIDES);
    expect(dropped).toEqual([]);
    expect(uncertain).toEqual([]);
    expect(overrides).toEqual(OVERRIDES);
  });

  it("carries slots onto a sibling template (theme classes and URLs differ)", () => {
    const { overrides, dropped } = remapOverrides(HTML, SIBLING, OVERRIDES);
    expect(dropped).toEqual([]);
    expect(Object.keys(overrides).sort()).toEqual(["0.0:bg_image", "1.0:image", "1.1:image"]);
  });

  it("follows a slot pushed down by a section inserted above it", () => {
    const shifted = `<section class="alert"><p>Nouveau bandeau</p></section>${HTML}`;
    const { overrides, dropped } = remapOverrides(HTML, shifted, OVERRIDES);
    expect(dropped).toEqual([]);
    expect(overrides["1.0:bg_image"]).toEqual(OVERRIDES["0.0:bg_image"]);
    expect(overrides["2.0:image"]).toEqual(OVERRIDES["1.0:image"]);
    expect(overrides["2.1:image"]).toEqual(OVERRIDES["1.1:image"]);
  });

  it("reports slots that no longer exist instead of mis-applying them", () => {
    const withoutBrands = `<section class="hero">
      <div class="ph ph--azur hero-photo"><span class="ph-label">Photo — technicien devant une PAC</span></div>
      <h1>Titre</h1>
    </section>`;
    const { overrides, dropped } = remapOverrides(HTML, withoutBrands, OVERRIDES);
    expect(dropped.sort()).toEqual(["1.0:image", "1.1:image"]);
    expect(overrides).toEqual({ "0.0:bg_image": OVERRIDES["0.0:bg_image"] });
  });

  it("keeps every key of a shared path together", () => {
    const shifted = `<section class="alert"><p>x</p></section>${HTML}`;
    const { overrides } = remapOverrides(HTML, shifted, {
      "1.0:image": { kind: "image", value: "A" },
      "1.0:remove": { kind: "remove", value: "1" },
    });
    expect(Object.keys(overrides).sort()).toEqual(["2.0:image", "2.0:remove"]);
  });

  it("is a no-op on an empty override map", () => {
    expect(remapOverrides(HTML, SIBLING, {})).toEqual({
      overrides: {}, dropped: [], uncertain: [], tierByKey: {},
    });
  });

  /* ── the ladder ─────────────────────────────────────────────────────── */

  it("survives a class added on a wrapper, which used to kill every child", () => {
    // `reveal` on <section class="brands"> changes the PARENT signature of both
    // logos — the strict tier fails, the loose tier (element only) catches them.
    const wrapped = HTML.replace('<section class="brands">', '<section class="brands reveal">');
    const { overrides, dropped, uncertain, tierByKey } = remapOverrides(HTML, wrapped, OVERRIDES);
    expect(dropped).toEqual([]);
    expect(overrides["1.0:image"]).toEqual(OVERRIDES["1.0:image"]);
    expect(tierByKey["1.0:image"]).toBe("loose");
    expect(uncertain).toContain("1.0:image");
  });

  it("finds a placeholder again after a full CSS rename, via its label", () => {
    const restyled = `
<section class="c-hero">
  <div class="ph media--xl"><span class="ph-label">Photo — technicien devant une PAC</span></div>
  <h1>Titre</h1>
</section>`;
    const { overrides, dropped, tierByKey } = remapOverrides(HTML, restyled, {
      "0.0:bg_image": OVERRIDES["0.0:bg_image"],
    });
    expect(dropped).toEqual([]);
    expect(overrides["0.0:bg_image"]).toEqual(OVERRIDES["0.0:bg_image"]);
    expect(tierByKey["0.0:bg_image"]).toBe("label");
  });

  it("matches an <img> through the asset it points at when all else changed", () => {
    const redesigned = `
<div class="wrap"><figure class="logo-cell"><img alt="D." src="https://cdn/NEW-a.webp"></figure></div>`;
    const assetPathByUrl = new Map([
      ["https://cdn/a.webp", "images/marque-daikin.png"],
      ["https://cdn/NEW-a.webp", "images/marque-daikin.png"],
    ]);
    const { overrides, dropped, tierByKey } = remapOverrides(
      HTML, redesigned, { "1.0:image": OVERRIDES["1.0:image"] }, { assetPathByUrl },
    );
    expect(dropped).toEqual([]);
    expect(tierByKey["0.0.0:image"]).toBe("asset");
    expect(overrides["0.0.0:image"]).toEqual(OVERRIDES["1.0:image"]);
  });

  it("never lets two source slots collapse onto the same target", () => {
    // Two identical cells, only one left in the target: the first source slot
    // claims it, the second is reported rather than overwriting the first.
    const two = `<div class="grid"><i class="c"></i><i class="c"></i></div>`;
    const one = `<div class="grid"><i class="c"></i></div>`;
    const { overrides, dropped } = remapOverrides(two, one, {
      "0.0:image": { kind: "image", value: "A" },
      "0.1:image": { kind: "image", value: "B" },
    });
    expect(overrides).toEqual({ "0.0:image": { kind: "image", value: "A" } });
    expect(dropped).toEqual(["0.1:image"]);
  });

  it("drops a slot whose own classes changed and that has no label or asset", () => {
    // No tier can identify it: better reported than placed at random.
    const renamed = HTML.replace('class="brand-logo b1"', 'class="logo-cell alpha"');
    const { overrides, dropped } = remapOverrides(HTML, renamed, {
      "1.0:image": OVERRIDES["1.0:image"],
    });
    expect(overrides).toEqual({});
    expect(dropped).toEqual(["1.0:image"]);
  });

  it("flags a placement as uncertain when a twin disappeared", () => {
    // Three identical cells become two: ranks shift, the match is a guess.
    const three = `<div class="grid"><i class="c"></i><i class="c"></i><i class="c"></i></div>`;
    const two = `<div class="grid"><i class="c"></i><i class="c"></i></div>`;
    const { overrides, uncertain, dropped } = remapOverrides(three, two, {
      "0.2:image": { kind: "image", value: "Z" },
    });
    expect(dropped).toEqual([]);
    expect(Object.keys(overrides)).toHaveLength(1);
    expect(uncertain).toHaveLength(1);
  });
});
