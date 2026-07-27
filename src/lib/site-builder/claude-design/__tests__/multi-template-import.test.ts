/**
 * End-to-end check of the multi-skin export path, on a miniature of the real
 * ZIP: two sibling template folders over one shared `images/` folder, pages
 * pointing at `../images/…`.
 *
 * Covers the three things that have to hold together for the feature to work:
 * the skins are split apart, each keeps its OWN stylesheet, and a photo placed
 * on one skin lands on the same slot of the other.
 */
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
// jsdom (the project's test env) exposes neither; the bundle parser needs them.
const g = globalThis as unknown as { TextDecoder: unknown; TextEncoder: unknown };
g.TextDecoder ??= NodeTextDecoder;
g.TextEncoder ??= NodeTextEncoder;

import { splitTemplateBundle } from "../split-template-bundle";
import { parseTemplateBundle, type BundleInputFile } from "../parse-template-bundle";
import { buildProcessedPages, refPath } from "../build-import-pages";
import { remapOverrides } from "../remap-overrides";
import { collectImagePlaceholders } from "../collect-image-placeholders";

const enc = (s: string) => new TextEncoder().encode(s);

/** Same body in both skins — only the head assets differ, as in the real export. */
const body = `
<header class="nav"><img class="logo" alt="Logo" src="../images/logo.png"></header>
<section class="hero">
  <div class="ph ph--azur hero-photo"><span class="ph-label">Photo — technicien devant une PAC</span></div>
</section>
<section class="brands">
  <img class="brand-logo b1" alt="Daikin" src="../images/marque-daikin.png">
</section>`;

function page(skinCss: string): string {
  return `<!doctype html><html><head><title>Accueil</title>
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="${skinCss}"></head><body>${body}</body></html>`;
}

const FILES: BundleInputFile[] = [
  { path: "images/logo.png", bytes: enc("png") },
  { path: "images/marque-daikin.png", bytes: enc("png") },
  { path: "uploads/scratch.png", bytes: enc("png") },
  { path: "screenshots/probe.png", bytes: enc("png") },
  { path: ".thumbnail", bytes: enc("webp") },
  { path: "template CVC - Classique/index.html", bytes: enc(page("patterns.css")) },
  { path: "template CVC - Classique/styles.css", bytes: enc(".hero{color:red}") },
  { path: "template CVC - Classique/patterns.css", bytes: enc(".pat{--skin:classique}") },
  { path: "template CVC - Brut/index.html", bytes: enc(page("brut.css")) },
  { path: "template CVC - Brut/styles.css", bytes: enc(".hero{color:blue}") },
  { path: "template CVC - Brut/brut.css", bytes: enc(".pat{--skin:brut}") },
];

function processSkin(name: string) {
  const tpl = splitTemplateBundle(FILES).find((t) => t.name.endsWith(name))!;
  const bundle = parseTemplateBundle(tpl.files);
  // Each skin uploads its own copy of the shared images, so the URLs differ.
  const urlByPath = new Map(bundle.images.map((i) => [refPath(i.path), `https://cdn/${name}/${refPath(i.path)}`]));
  return { bundle, pages: buildProcessedPages(bundle, urlByPath) };
}

describe("multi-skin export", () => {
  it("keeps each skin's own stylesheet and drops the authoring folders", () => {
    const classique = processSkin("Classique");
    const brut = processSkin("Brut");

    expect(classique.bundle.sharedCss).toContain("--skin:classique");
    expect(classique.bundle.sharedCss).not.toContain("--skin:brut");
    expect(brut.bundle.sharedCss).toContain("--skin:brut");
    expect(brut.bundle.sharedCss).not.toContain("--skin:classique");

    // uploads/ + screenshots/ never reach the uploader.
    expect(classique.bundle.images.map((i) => i.path).sort()).toEqual([
      "images/logo.png",
      "images/marque-daikin.png",
    ]);
  });

  it("resolves the ../images refs the pages use", () => {
    const html = processSkin("Classique").pages[0].html;
    expect(html).not.toContain("../images/");
    expect(html).toContain("https://cdn/Classique/images/marque-daikin.png");
  });

  it("carries a photo placed on one skin onto the other", () => {
    const from = processSkin("Classique").pages[0];
    const to = processSkin("Brut").pages[0];

    const placeholder = collectImagePlaceholders(from.html)[0];
    expect(placeholder.label).toContain("technicien");

    const { overrides, dropped } = remapOverrides(from.html, to.html, {
      [`${placeholder.path}:bg_image`]: { kind: "bg_image", value: "https://cdn/photo.webp" },
    });
    expect(dropped).toEqual([]);
    // The slot still resolves to the hero placeholder in the target markup.
    expect(collectImagePlaceholders(to.html, overrides)).toEqual([]);
  });
});
