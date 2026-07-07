import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from "util";
// jsdom (jest testEnvironment) ships without these globals; the parser decodes
// file bytes via TextDecoder, so provide them before it runs.
const g = globalThis as unknown as { TextEncoder?: unknown; TextDecoder?: unknown };
if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;

import { parseTemplateBundle, type BundleInputFile } from "../parse-template-bundle";

const enc = (s: string): Uint8Array => new NodeTextEncoder().encode(s);
const file = (path: string, body: string): BundleInputFile => ({ path, bytes: enc(body) });

/** A minimal cvc-style page: theme-apply (drop) + react/babel toolchain (drop) +
 *  leaflet remote lib (keep) + *.jsx babel (drop) + site.js (keep). */
function pageHtml(extraBodyScripts = ""): string {
  return `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="styles.css">
    <script src="theme-apply.js"></script>
    </head><body>
    <div class="hero">Bonjour</div>
    ${extraBodyScripts}
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="x" crossorigin=""></script>
    <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
    <script type="text/babel" src="tweaks-panel.jsx"></script>
    <script type="text/babel" src="index-tweaks.jsx"></script>
    <script src="site.js"></script>
  </body></html>`;
}

describe("parseTemplateBundle — JS collection & denylist", () => {
  const files: BundleInputFile[] = [
    file("index.html", pageHtml("<script>window.__inlineRan=1;</script>")),
    file("service-climatisation.html", pageHtml('<script src="service-clim.js"></script>')),
    file("site.js", "/* site */ console.log('site');"),
    file("service-clim.js", "/* clim */ console.log('clim');"),
    file("theme-apply.js", "/* MUST NOT be kept */ applyTheme();"),
    file("styles.css", ".hero{color:#DCE9F4}"),
    file("theme-tokens.css", ":root{--azur:#5B9BD5}"),
  ];
  const bundle = parseTemplateBundle(files);

  it("keeps the design's own runtime JS but drops theme-apply.js", () => {
    expect(bundle.jsByName["site.js"]).toContain("console.log('site')");
    expect(bundle.jsByName["service-clim.js"]).toContain("console.log('clim')");
    expect(bundle.jsByName["theme-apply.js"]).toBeUndefined();
  });

  it("keeps only the runtime remote lib (leaflet), dropping react/react-dom/babel", () => {
    expect(bundle.scriptLinks).toEqual(["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]);
  });

  it("records local script refs (excluding theme-apply.js) and inline scripts per page", () => {
    const index = bundle.pages.find((p) => p.slug === "/")!;
    expect(index.localScriptRefs).toContain("site.js");
    expect(index.localScriptRefs).not.toContain("theme-apply.js");
    expect(index.inlineScripts.join("")).toContain("__inlineRan");
    const clim = bundle.pages.find((p) => p.slug === "/service-climatisation")!;
    expect(clim.localScriptRefs).toEqual(expect.arrayContaining(["site.js", "service-clim.js"]));
  });

  it("does not leave any <script> in the page body markup", () => {
    for (const p of bundle.pages) expect(p.html).not.toMatch(/<script/i);
  });

  it("concatenates CSS with theme-tokens.css LAST so its vars win the cascade", () => {
    const idxStyles = bundle.sharedCss.indexOf("#DCE9F4");
    const idxTokens = bundle.sharedCss.indexOf("--azur");
    expect(idxStyles).toBeGreaterThanOrEqual(0);
    expect(idxTokens).toBeGreaterThan(idxStyles);
  });
});
