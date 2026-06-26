import {
  rewriteAssets,
  rewriteCrossLinks,
  fileNameToSlug,
  dropLocalAssetRefs,
} from "../rewrite-asset-paths";

describe("rewriteAssets", () => {
  it("replaces template-relative paths with their public URLs (src/href/url())", () => {
    const map = new Map([["images/hero.jpg", "https://cdn/site/abc.jpg"]]);
    const html = `<img src="images/hero.jpg"><div style="background:url('images/hero.jpg')"></div>`;
    const out = rewriteAssets(html, map);
    expect(out).toBe(`<img src="https://cdn/site/abc.jpg"><div style="background:url('https://cdn/site/abc.jpg')"></div>`);
  });

  it("replaces longer paths before shorter prefixes", () => {
    const map = new Map([
      ["images/a.png", "URL_A"],
      ["images/a-2.png", "URL_A2"],
    ]);
    expect(rewriteAssets(`<img src="images/a-2.png">`, map)).toBe(`<img src="URL_A2">`);
  });
});

describe("fileNameToSlug", () => {
  it("maps page file names to clean route slugs", () => {
    expect(fileNameToSlug("index.html")).toBe("/");
    expect(fileNameToSlug("service-climatisation.html")).toBe("/service-climatisation");
    expect(fileNameToSlug("a-propos.html")).toBe("/a-propos");
  });
});

describe("rewriteCrossLinks", () => {
  it("rewrites local .html links and preserves fragments", () => {
    expect(rewriteCrossLinks(`<a href="service-climatisation.html">`)).toBe(`<a href="/service-climatisation">`);
    expect(rewriteCrossLinks(`<a href="index.html#contact">`)).toBe(`<a href="/#contact">`);
    expect(rewriteCrossLinks(`<a href="index.html">`)).toBe(`<a href="/">`);
  });

  it("leaves absolute, root, anchor, mailto and tel links untouched", () => {
    const keep = `<a href="https://x.com/page.html"><a href="/already"><a href="#top"><a href="mailto:a@b.fr">`;
    expect(rewriteCrossLinks(keep)).toBe(keep);
  });
});

describe("dropLocalAssetRefs", () => {
  it("removes local stylesheet links and local scripts, keeps remote", () => {
    const html = `<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="https://fonts/x.css"><script src="site.js"></script>`;
    const out = dropLocalAssetRefs(html);
    expect(out).not.toContain("styles.css");
    expect(out).not.toContain("site.js");
    expect(out).toContain("https://fonts/x.css");
  });
});
