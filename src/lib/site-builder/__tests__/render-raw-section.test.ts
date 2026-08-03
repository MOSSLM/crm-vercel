/**
 * @jest-environment node
 *
 * The fast path only earns its keep if it is indistinguishable from the slow
 * one. So this suite does not assert what the output "should" look like — it
 * runs the REAL pipeline (@babel/standalone → new Function → renderToString)
 * and demands the exact same bytes. Any divergence, in either direction, is a
 * visual regression on every demo site.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import * as Babel from "@babel/standalone";
import { wrapRawHtml } from "../wrap-raw-html";
import { renderRawSection, unwrapRawHtml } from "../render-raw-section";

const VARIABLES = {
  "entreprise.nom": "Ventilation Plus",
  "entreprise.ville": "Seynod",
  "entreprise.logo_url": "https://cdn.example.com/logo.webp",
};

/** What the production render path does today, reproduced end to end. */
function renderThroughBabel(code: string, variables: Record<string, string>): string {
  const compiled = Babel.transform(code, {
    presets: ["react", "typescript"],
    filename: "section.tsx",
  }).code!;
  const factory = new Function(
    "React",
    `"use strict";\n${compiled.replace(/export default function/, "function")}\nreturn ClaudeDesign;`,
  );
  const Component = factory(React) as React.ComponentType<{ variables: Record<string, string> }>;
  return renderToString(React.createElement(Component, { variables }));
}

const CASES: Array<[string, string]> = [
  ["plain markup", `<section class="hero"><h1>Bienvenue</h1></section>`],
  ["variable tokens", `<h1>{{ entreprise.nom }}</h1><p>à {{ entreprise.ville }}</p>`],
  ["a token inside an attribute", `<img src="{{ entreprise.logo_url }}" alt="{{ entreprise.nom }}">`],
  ["loose token spacing", `<p>{{entreprise.nom}} et {{   entreprise.ville   }}</p>`],
  ["an unknown token, which resolves to nothing", `<p>[{{ entreprise.inconnu }}]</p>`],
  ["pre-escaped entities", `<p>Bonjour &amp; bienvenue &lt;chez nous&gt;</p>`],
  ["quotes and apostrophes", `<p>Texte avec "guillemets" et 'apostrophes'</p>`],
  ["an inline script and style", `<div><script>var x = 1 < 2;</script><style>.a{color:red}</style></div>`],
  ["a closing script tag in text", `<p>fin: &lt;/script&gt;</p>`],
  ["a self-closing void element", `<div><br><hr><input type="text" disabled></div>`],
  ["an SVG block", `<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>`],
  ["newlines and tabs", `<div>\n\tligne 1\n\tligne 2\n</div>`],
  ["accented text", `<p>Élévation, à côté, œuf, ça</p>`],
  ["an empty design", ``],
];

describe("renderRawSection", () => {
  it.each(CASES)("matches the compiled render for %s", (_label, html) => {
    const code = wrapRawHtml(html);
    const unwrapped = unwrapRawHtml(code);
    expect(unwrapped).toBe(html);
    expect(renderRawSection(unwrapped!, VARIABLES)).toBe(renderThroughBabel(code, VARIABLES));
  });

  it("matches with no variables at all", () => {
    const html = `<h1>{{ entreprise.nom }}</h1>`;
    const code = wrapRawHtml(html);
    expect(renderRawSection(unwrapRawHtml(code)!, {})).toBe(renderThroughBabel(code, {}));
  });
});

describe("unwrapRawHtml", () => {
  it("round-trips whatever wrapRawHtml produced", () => {
    const html = `<div class="a">un </script> perdu</div>`;
    expect(unwrapRawHtml(wrapRawHtml(html))).toBe(html);
  });

  it("returns null for a hand-written section, so the caller compiles it", () => {
    expect(
      unwrapRawHtml(`export default function Hero({ data }) {
  return <div className="p-8">{data.title}</div>;
}`),
    ).toBeNull();
  });

  it("returns null for a wrapper whose preamble was edited", () => {
    const tampered = wrapRawHtml("<p>x</p>").replace("var __html =", "let __html =");
    expect(unwrapRawHtml(tampered)).toBeNull();
  });

  it("returns null rather than throwing on a truncated literal", () => {
    expect(
      unwrapRawHtml(`export default function ClaudeDesign({ variables = {} }) {
  var __html = "unterminated;
`),
    ).toBeNull();
  });
});
