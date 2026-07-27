import { splitTemplateBundle, normalizeTemplateName } from "../split-template-bundle";
import type { BundleInputFile } from "../parse-template-bundle";

const EMPTY = new Uint8Array(0);

function files(...paths: string[]): BundleInputFile[] {
  return paths.map((path) => ({ path, bytes: EMPTY }));
}

function pathsOf(t: { files: BundleInputFile[] }): string[] {
  return t.files.map((f) => f.path).sort();
}

describe("splitTemplateBundle", () => {
  it("treats a flat ZIP as a single template", () => {
    const out = splitTemplateBundle(files("index.html", "service-clim.html", "styles.css", "images/hero.jpg"));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("");
    expect(out[0].pageCount).toBe(2);
    expect(out[0].imageCount).toBe(1);
    expect(pathsOf(out[0])).toEqual(["images/hero.jpg", "index.html", "service-clim.html", "styles.css"]);
  });

  it("treats a single wrapping folder as one template", () => {
    const out = splitTemplateBundle(files("export/index.html", "export/styles.css", "export/images/hero.jpg"));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("export");
    expect(out[0].name).toBe("export");
    expect(out[0].pageCount).toBe(1);
  });

  it("splits sibling template folders and hands each the shared root images", () => {
    const out = splitTemplateBundle(
      files(
        "images/pac-air-air.png",
        "images/certifications/qualipac.png",
        "template CVC - Classique/index.html",
        "template CVC - Classique/service-clim.html",
        "template CVC - Classique/styles.css",
        "template CVC - Classique/patterns.css",
        "template CVC - Brut/index.html",
        "template CVC - Brut/styles.css",
        "template CVC - Brut/brut.css",
      ),
    );

    expect(out.map((t) => t.name)).toEqual(["template CVC - Classique", "template CVC - Brut"]);

    const [classique, brut] = out;
    expect(classique.pageCount).toBe(2);
    expect(brut.pageCount).toBe(1);

    // Each template carries its OWN css and both shared images — never the sibling's css.
    expect(pathsOf(classique)).toEqual([
      "images/certifications/qualipac.png",
      "images/pac-air-air.png",
      "template CVC - Classique/index.html",
      "template CVC - Classique/patterns.css",
      "template CVC - Classique/service-clim.html",
      "template CVC - Classique/styles.css",
    ]);
    expect(pathsOf(brut)).toEqual([
      "images/certifications/qualipac.png",
      "images/pac-air-air.png",
      "template CVC - Brut/brut.css",
      "template CVC - Brut/index.html",
      "template CVC - Brut/styles.css",
    ]);
    expect(classique.imageCount).toBe(2);
  });

  it("drops authoring leftovers and dotfiles", () => {
    const out = splitTemplateBundle(
      files(
        ".thumbnail",
        "__MACOSX/._index.html",
        "uploads/draw-b371.png",
        "screenshots/01-brut-home.png",
        "images/hero.jpg",
        "tpl/index.html",
        "tpl/screenshots/probe.png",
      ),
    );
    expect(out).toHaveLength(1);
    expect(pathsOf(out[0])).toEqual(["images/hero.jpg", "tpl/index.html"]);
    expect(out[0].imageCount).toBe(1);
  });

  it("returns nothing when the ZIP has no HTML at all", () => {
    expect(splitTemplateBundle(files("images/hero.jpg", "notes.txt"))).toEqual([]);
  });
});

describe("normalizeTemplateName", () => {
  it("pairs a ZIP folder with an existing template name", () => {
    expect(normalizeTemplateName("Template CVC — Classique")).toBe(normalizeTemplateName("template CVC - Classique"));
    expect(normalizeTemplateName("  Éditorial  ")).toBe("editorial");
    expect(normalizeTemplateName("Brut")).not.toBe(normalizeTemplateName("Agency"));
  });
});
