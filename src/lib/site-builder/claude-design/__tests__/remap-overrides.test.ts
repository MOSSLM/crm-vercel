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
    const { overrides, dropped } = remapOverrides(HTML, HTML, OVERRIDES);
    expect(dropped).toEqual([]);
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
    expect(remapOverrides(HTML, SIBLING, {})).toEqual({ overrides: {}, dropped: [] });
  });
});
