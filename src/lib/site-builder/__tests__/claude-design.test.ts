/**
 * Runs in the Node environment: react-dom/server's renderToString needs Node
 * globals (TextEncoder, MessageChannel) that jsdom doesn't expose, and the
 * Anthropic SDK refuses to construct in browser-like envs.
 *
 * @jest-environment node
 */
import React from "react";
import { sanitizeDesignHtml } from "../sanitize-design-html";
import { wrapRawHtml, CLAUDE_DESIGN_COMPONENT } from "../wrap-raw-html";
import { preprocessSectionCode } from "@/lib/library-section/preprocess";
import { applyReplacements } from "@/lib/ai/tokenize-design";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Babel = require("@babel/standalone") as {
  transform: (code: string, opts: Record<string, unknown>) => { code: string | null };
};

/**
 * Compile + render a wrapped design exactly like the app's SSR path
 * (render-server.ts): Babel-transform the section code, eval it with React in
 * scope, then renderToString with the given variables.
 */
function renderWrapped(code: string, variables: Record<string, string>): string {
  const { processedCode, renderName } = preprocessSectionCode(code);
  const js = Babel.transform(processedCode, { presets: ["react", "typescript"], filename: "section.tsx" }).code ?? "";
  const factory = new Function("React", `"use strict";\n${js}\nreturn ${renderName};`);
  const Component = factory(React) as React.ComponentType<{ variables: Record<string, string> }>;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
  return renderToString(React.createElement(Component, { variables }));
}

describe("sanitizeDesignHtml", () => {
  it("strips scripts/handlers, keeps styles + body, collects images", () => {
    const raw = `<!DOCTYPE html><html><head>
      <title>Mon Site</title>
      <style>.brand{color:red}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter">
      <script>window.evil=1</script>
    </head><body>
      <h1 onclick="hack()">Bonjour</h1>
      <a href="javascript:steal()">x</a>
      <img src="https://img/logo.png">
      <script>alsoEvil()</script>
    </body></html>`;

    const out = sanitizeDesignHtml(raw);
    expect(out.title).toBe("Mon Site");
    expect(out.html).toContain(".brand{color:red}");
    expect(out.html).toContain("fonts.googleapis.com");
    expect(out.html).toContain("Bonjour");
    expect(out.html).not.toMatch(/<script/i);
    expect(out.html).not.toContain("window.evil");
    expect(out.html).not.toContain("alsoEvil");
    expect(out.html).not.toMatch(/onclick=/i);
    expect(out.html).not.toContain("javascript:");
    expect(out.imageUrls).toContain("https://img/logo.png");
  });
});

describe("wrapRawHtml", () => {
  it("produces a component named ClaudeDesign", () => {
    const code = wrapRawHtml("<p>hi</p>");
    expect(code).toContain(`function ${CLAUDE_DESIGN_COMPONENT}`);
  });

  it("interpolates {{ tokens }} in text AND attributes at render time", () => {
    const html = `<div><h1>{{ entreprise.nom }}</h1><img src="{{ entreprise.logo_url }}"/></div>`;
    const code = wrapRawHtml(html);
    const out = renderWrapped(code, {
      "entreprise.nom": "ACME Plomberie",
      "entreprise.logo_url": "https://cdn/acme.png",
    });
    expect(out).toContain("ACME Plomberie");
    expect(out).toContain("https://cdn/acme.png");
    expect(out).not.toContain("{{");
  });

  it("renders an empty string for missing variables (no leftover tokens)", () => {
    const code = wrapRawHtml(`<span>{{ entreprise.ville }}</span>`);
    const out = renderWrapped(code, {});
    expect(out).not.toContain("{{");
  });

  it("survives markup containing a literal </script>", () => {
    const code = wrapRawHtml(`<p>texte avec </script> dedans</p>`);
    // The dangerous sequence must be escaped in the emitted source.
    expect(code).not.toContain("</script>");
    expect(code).toContain("<\\/script>");
    const out = renderWrapped(code, {});
    expect(out).toContain("texte avec");
  });
});

describe("applyReplacements", () => {
  it("replaces all occurrences and reports counts", () => {
    const html = `ACME — appelez ACME au 01 23 (href tel:01 23)`;
    const { html: out, mapping } = applyReplacements(html, [
      { find: "ACME", token: "{{ entreprise.nom }}", label: "Nom" },
      { find: "01 23", token: "{{ entreprise.telephone }}", label: "Tél" },
    ]);
    expect(out).toContain("{{ entreprise.nom }}");
    expect(out).toContain("{{ entreprise.telephone }}");
    expect(out).not.toContain("ACME");
    expect(mapping.find((m) => m.label === "Nom")?.count).toBe(2);
    expect(mapping.find((m) => m.label === "Tél")?.count).toBe(2);
  });

  it("skips non-matching finds, disallowed tokens, and already-tokenized finds", () => {
    const html = `Bonjour le monde`;
    const { html: out, mapping } = applyReplacements(html, [
      { find: "absent", token: "{{ entreprise.nom }}", label: "Nom" },
      { find: "monde", token: "{{ entreprise.notallowed }}", label: "X" },
      { find: "{{ entreprise.nom }}", token: "{{ entreprise.nom }}", label: "Y" },
    ]);
    expect(out).toBe(html);
    expect(mapping).toHaveLength(0);
  });
});
