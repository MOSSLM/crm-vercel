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

  // Vocabulaire réel : le design écrit des slugs ASCII, l'entreprise porte du
  // français accentué. Sans clé canonique, la région était toujours supprimée.
  it("matches a human service_tag against the design's ASCII slug", () => {
    const real = `
      <section data-service-tag="pompe-a-chaleur">PAC</section>
      <section data-service-tag="bornes-irve">IRVE</section>
      <section data-service-tag="electricite">ELEC</section>
    `;
    const out = stripTaggedRegions(real, ["Pompe à chaleur", "Bornes IRVE"]);
    expect(out).toContain("PAC");
    expect(out).toContain("IRVE");
    expect(out).not.toContain("ELEC");
  });

  it("is a no-op when there are no tagged regions", () => {
    const plain = "<section>hello</section>";
    expect(stripTaggedRegions(plain, ["x"])).toBe(plain);
  });
});
