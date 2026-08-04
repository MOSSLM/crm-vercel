import {
  countImageOverrides,
  imageSlotPaths,
  isImageOverrideKey,
  pagesMissingFromTarget,
} from "../image-override-keys";

describe("isImageOverrideKey / countImageOverrides", () => {
  it("counts only the photo kinds", () => {
    const overrides = {
      "0.1:image": {}, "0.2:bg_image": {}, "0.3:image_set": {}, "0.3:image_mobile": {},
      "0.4:text": {}, "0.5:html": {},
    };
    expect(Object.keys(overrides).filter(isImageOverrideKey)).toHaveLength(4);
    expect(countImageOverrides(overrides)).toBe(4);
    expect(imageSlotPaths(overrides).size).toBe(3); // 0.3 holds two kinds
    expect(countImageOverrides({})).toBe(0);
  });
});

describe("pagesMissingFromTarget", () => {
  // The cross-template copy pairs pages by slug. A page added to the export
  // after a template was imported has no slot on that template, so its photos
  // have nowhere to land — the copy has to say so instead of skipping quietly.
  const source = new Map<string, Record<string, unknown>>([
    ["/", { "0.1:image": {} }],
    ["/service-climatisation", { "0.1:image": {}, "0.2:bg_image": {} }],
    ["/service-renovation-generale", { "0.1:image": {}, "0.2:image_set": {}, "0.3:text": {} }],
  ]);

  it("names the source pages the target does not have, with their photo count", () => {
    const target = new Set(["/", "/service-climatisation"]);
    expect(pagesMissingFromTarget(source, target)).toEqual([
      { slug: "/service-renovation-generale", images: 2 }, // the `text` key doesn't count
    ]);
  });

  it("accepts the route's page Map as the target, not just a Set", () => {
    const target = new Map([["/", {}], ["/service-climatisation", {}]]);
    expect(pagesMissingFromTarget(source, target).map((p) => p.slug)).toEqual([
      "/service-renovation-generale",
    ]);
  });

  it("says nothing when every source page exists on the target", () => {
    const target = new Set([...source.keys()]);
    expect(pagesMissingFromTarget(source, target)).toEqual([]);
  });

  it("ignores a missing page that carries no photo — nothing to act on", () => {
    const withEmpty = new Map(source);
    withEmpty.set("/mentions-legales", { "0.1:text": {} });
    const slugs = pagesMissingFromTarget(withEmpty, new Set(["/"])).map((p) => p.slug);
    expect(slugs).not.toContain("/mentions-legales");
  });

  it("reports several missing pages, ordered by slug", () => {
    const many = new Map<string, Record<string, unknown>>([
      ["/service-solaire", { "0.1:image": {} }],
      ["/service-renovation-generale", { "0.1:image": {} }],
      ["/service-bornes-irve", { "0.1:image": {} }],
    ]);
    expect(pagesMissingFromTarget(many, new Set(["/"])).map((p) => p.slug)).toEqual([
      "/service-bornes-irve", "/service-renovation-generale", "/service-solaire",
    ]);
  });
});
