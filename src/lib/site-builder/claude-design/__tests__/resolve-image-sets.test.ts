import { resolveImageSets } from "../resolve-image-sets";
import { serializeImageSet } from "../image-set";

// The section root is the first element child (mirrors applyOverridesToHTML).
// Path "0.0" → root's first element child's first element child.
const html = `<section><div class="hero"><img class="target" src="" alt="hero"><div class="ph hero-photo"><span class="ph-label">Photo — hero</span></div></div></section>`;

const climSet = serializeImageSet([
  { url: "https://x/clim.jpg", tags: ["climatisation"] },
  { url: "https://x/chauf.jpg", tags: ["chauffage"] },
]);

describe("resolveImageSets", () => {
  it("applies the matching candidate to an <img> src", () => {
    const overrides = { "0.0:image_set": { kind: "image_set", value: climSet } };
    const out = resolveImageSets(html, overrides, ["chauffage"]);
    expect(out).toContain('src="https://x/chauf.jpg"');
    // Only ONE image url appears — no residue of the other candidate.
    expect(out).not.toContain("clim.jpg");
  });

  it("applies to a .ph placeholder as a cover background + marks it filled", () => {
    // Path 0.1 → the .ph div. (node-html-parser serializes the inner quotes as
    // &quot; in the style attribute — valid, browsers decode it back.)
    const overrides = { "0.1:image_set": { kind: "image_set", value: climSet } };
    const out = resolveImageSets(html, overrides, ["climatisation"]);
    expect(out).toContain("background-image");
    expect(out).toContain("https://x/clim.jpg");
    expect(out).toContain("background-size: cover");
    expect(out).toContain("has-img");
    expect(out).toContain("display: none"); // ph-label hidden
    expect(out).not.toContain("chauf.jpg");
  });

  it("falls back to the first candidate when the company matches nothing", () => {
    const overrides = { "0.0:image_set": { kind: "image_set", value: climSet } };
    const out = resolveImageSets(html, overrides, ["plomberie"]);
    expect(out).toContain('src="https://x/clim.jpg"');
  });

  it("is a no-op when there are no image_set overrides", () => {
    const out = resolveImageSets(html, { "0.0:image": { kind: "image", value: "x" } }, ["climatisation"]);
    expect(out).toBe(html);
  });
});
