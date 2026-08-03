import { pickRenderExampleData } from "../render-example-data";

describe("pickRenderExampleData", () => {
  it("drops the import-only HTML copies but keeps __page_js", () => {
    const out = pickRenderExampleData({
      __source_html: "<h1>source</h1>",
      __token_html: "<h1>{{ entreprise.nom }}</h1>",
      __page_js: "console.log(1)",
    });
    expect(out).toEqual({ __page_js: "console.log(1)" });
  });

  it("keeps a native library section's default content untouched", () => {
    const exampleData = { title: "Nos services", items: [{ label: "Ventilation" }] };
    // Same reference: rows without the artefacts must not be cloned.
    expect(pickRenderExampleData(exampleData)).toBe(exampleData);
  });

  it("does not mutate the row it was given", () => {
    const exampleData = { __source_html: "<p>x</p>", title: "Accueil" };
    const out = pickRenderExampleData(exampleData);
    expect(out).toEqual({ title: "Accueil" });
    expect(exampleData.__source_html).toBe("<p>x</p>");
  });

  it("passes null through", () => {
    expect(pickRenderExampleData(null)).toBeNull();
  });
});
