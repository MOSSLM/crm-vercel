import { stripTaggedRegions } from "../strip-tagged-regions";

describe("stripTaggedRegions", () => {
  const html = `
    <section data-service-tag="climatisation">CLIM</section>
    <section data-service-tag="plomberie">PLOMB</section>
    <section data-service-tag="clim chauffage">MULTI</section>
    <section>ALWAYS</section>
  `;

  it("keeps regions whose tag the enterprise has and untagged regions", () => {
    const out = stripTaggedRegions(html, ["climatisation"]);
    expect(out).toContain("CLIM");
    expect(out).toContain("ALWAYS");
    expect(out).not.toContain("PLOMB");
  });

  it("keeps a multi-tag region when ANY tag matches", () => {
    expect(stripTaggedRegions(html, ["chauffage"])).toContain("MULTI");
  });

  it("strips all tagged regions when the enterprise has no tags", () => {
    const out = stripTaggedRegions(html, []);
    expect(out).not.toContain("CLIM");
    expect(out).not.toContain("PLOMB");
    expect(out).not.toContain("MULTI");
    expect(out).toContain("ALWAYS");
  });

  it("is a no-op when there are no tagged regions", () => {
    const plain = "<section>hello</section>";
    expect(stripTaggedRegions(plain, ["x"])).toBe(plain);
  });
});
