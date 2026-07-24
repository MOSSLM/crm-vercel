import {
  buildProcessedPages,
  imagesForPages,
  sharedJsFromBundle,
  refPath,
} from "../build-import-pages";
import type { BundlePage, ParsedBundle } from "../parse-template-bundle";

function page(over: Partial<BundlePage> & Pick<BundlePage, "slug">): BundlePage {
  return {
    fileName: `${over.slug.replace(/^\//, "") || "index"}.html`,
    slug: over.slug,
    title: over.title ?? "Page",
    html: over.html ?? "",
    serviceTag: over.serviceTag ?? null,
    fontLinks: [],
    tweaksFile: null,
    localScriptRefs: over.localScriptRefs ?? [],
    inlineScripts: over.inlineScripts ?? [],
    scriptLinks: [],
  };
}

function bundle(pages: BundlePage[], extra: Partial<ParsedBundle> = {}): ParsedBundle {
  return {
    pages,
    sharedCss: extra.sharedCss ?? "",
    fontLinks: [],
    images: extra.images ?? [],
    tweaksDefaults: {},
    tweaksJsx: {},
    jsByName: extra.jsByName ?? {},
    scriptLinks: [],
  };
}

describe("refPath", () => {
  it("keeps the images/ suffix and falls back to the basename", () => {
    expect(refPath("export/images/plomberie-wc.png")).toBe("images/plomberie-wc.png");
    expect(refPath("images/pv-batterie.png")).toBe("images/pv-batterie.png");
    expect(refPath("some/logo.svg")).toBe("logo.svg");
  });
});

describe("buildProcessedPages", () => {
  const b = bundle([
    page({ slug: "/", localScriptRefs: ["site.js"] }),
    page({
      slug: "/service-plomberie",
      title: "Plomberie",
      serviceTag: "plomberie",
      html: '<h1>[Nom de l\'entreprise]</h1><img src="images/plomberie-wc.png">',
      localScriptRefs: ["site.js", "service-clim.js"],
      inlineScripts: ["console.log('p')"],
    }),
    page({
      slug: "/service-photovoltaique",
      title: "Photovoltaïque",
      serviceTag: "photovoltaique",
      html: '<img src="images/pv-batterie.png"><a href="service-plomberie.html">Plomberie</a>',
      localScriptRefs: ["site.js"],
    }),
  ], {
    jsByName: { "site.js": "/* shared */", "service-clim.js": "/* clim: images/x.png */" },
  });

  const urlByPath = new Map([
    ["images/plomberie-wc.png", "https://cdn/x/wc.png"],
    ["images/pv-batterie.png", "https://cdn/x/pv.png"],
  ]);

  it("processes only the requested slugs", () => {
    const out = buildProcessedPages(b, urlByPath, ["/service-plomberie"]);
    expect(out.map((p) => p.slug)).toEqual(["/service-plomberie"]);
  });

  it("rewrites image paths and tokenises brackets", () => {
    const [p] = buildProcessedPages(b, urlByPath, ["/service-plomberie"]);
    expect(p.html).toContain("https://cdn/x/wc.png");
    expect(p.html).not.toContain("images/plomberie-wc.png");
    expect(p.html).toContain("{{ entreprise.nom }}");
    expect(p.serviceTag).toBe("plomberie");
  });

  it("rewrites in-template cross-links to clean routes", () => {
    const [p] = buildProcessedPages(b, urlByPath, ["/service-photovoltaique"]);
    expect(p.html).toContain('href="/service-plomberie"');
    expect(p.html).not.toContain("service-plomberie.html");
  });

  it("gives a page only its OWN (non-shared) JS + inline scripts, never site.js", () => {
    const [p] = buildProcessedPages(b, urlByPath, ["/service-plomberie"]);
    expect(p.js).toContain("/* clim");
    expect(p.js).toContain("console.log('p')");
    expect(p.js).not.toContain("/* shared */"); // site.js is shared → lives in shared_assets
  });

  it("tokenises a page identically whether imported alone or with siblings", () => {
    const alone = buildProcessedPages(b, urlByPath, ["/service-plomberie"])[0];
    const withAll = buildProcessedPages(b, urlByPath).find((p) => p.slug === "/service-plomberie")!;
    expect(alone.html).toBe(withAll.html);
  });
});

describe("imagesForPages", () => {
  const img = (path: string) => ({ path, bytes: new Uint8Array(), mime: "image/png" });
  const b = bundle([
    page({ slug: "/service-plomberie", html: '<img src="images/plomberie-wc.png">' }),
    page({ slug: "/service-photovoltaique", html: '<img src="images/pv-batterie.png">' }),
  ], {
    images: [img("images/plomberie-wc.png"), img("images/pv-batterie.png"), img("images/unused.png")],
  });

  it("returns only images referenced by the selected pages", () => {
    const out = imagesForPages(b, ["/service-plomberie"]).map((i) => i.path);
    expect(out).toEqual(["images/plomberie-wc.png"]);
  });

  it("returns every image when no slugs are given", () => {
    expect(imagesForPages(b)).toHaveLength(3);
  });
});

describe("sharedJsFromBundle", () => {
  it("concatenates only the shared scripts (index / ≥2 pages)", () => {
    const b = bundle([
      page({ slug: "/", localScriptRefs: ["site.js"] }),
      page({ slug: "/a", localScriptRefs: ["site.js", "only-a.js"] }),
    ], { jsByName: { "site.js": "SHARED", "only-a.js": "OWN" } });
    const out = sharedJsFromBundle(b, new Map());
    expect(out).toContain("SHARED");
    expect(out).not.toContain("OWN");
  });
});
