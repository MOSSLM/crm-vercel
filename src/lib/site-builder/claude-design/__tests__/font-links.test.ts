import { resolveFontLinkTags } from "../font-links";

describe("resolveFontLinkTags", () => {
  it("turns bare origins into preconnect instead of 404-ing stylesheets", () => {
    // Exactly the list a standard Google Fonts <head> block leaves behind once
    // the importer has dropped the `rel` attributes.
    expect(
      resolveFontLinkTags([
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
      ]),
    ).toEqual([
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
      },
    ]);
  });

  it("treats a trailing-slash origin as a hint too", () => {
    expect(resolveFontLinkTags(["https://fonts.googleapis.com/"])).toEqual([
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
    ]);
  });

  it("keeps a real stylesheet anywhere on the path", () => {
    expect(resolveFontLinkTags(["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"])).toEqual([
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
    ]);
  });

  it("drops scripts — the importer's font heuristics also match unpkg and cdn", () => {
    expect(resolveFontLinkTags(["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"])).toEqual([]);
  });

  it("drops malformed and relative hrefs rather than emitting a broken link", () => {
    expect(resolveFontLinkTags(["", "   ", "/local/font.css", "not a url"])).toEqual([]);
  });

  it("deduplicates repeated hrefs", () => {
    expect(
      resolveFontLinkTags([
        "https://fonts.googleapis.com",
        "https://fonts.googleapis.com/",
        "https://fonts.googleapis.com",
      ]),
    ).toEqual([{ rel: "preconnect", href: "https://fonts.googleapis.com" }]);
  });

  it("puts connection hints before the requests they warm up", () => {
    const tags = resolveFontLinkTags([
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://fonts.gstatic.com",
    ]);
    expect(tags.map((t) => t.rel)).toEqual(["preconnect", "stylesheet"]);
  });
});
