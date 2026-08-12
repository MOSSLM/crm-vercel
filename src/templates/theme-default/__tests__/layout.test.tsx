/**
 * @jest-environment node
 *
 * Le gabarit par défaut ne doit pas retypographier une conception importée.
 *
 * `ThemeLayout` enveloppe TOUT ce qui est servi sur le domaine d'un client. Son
 * `<div>` porte un `font-family` et un `color` — deux propriétés HÉRITÉES —
 * tirés du style guide hérité (« Inter » la plupart du temps). Pour un site
 * Claude Design, ce calque s'intercale entre `<body>` et la conception : sa
 * règle `body{font-family:var(--sans)}` perdait alors contre l'inline du
 * wrapper, et le site publié rendait son corps de texte en Inter — alors que
 * les titres, dont la conception nomme la police explicitement, restaient
 * justes. C'est le symptôme constaté : « au moins la police secondaire n'est
 * pas chargée sur le site publié, contrairement à l'aperçu ».
 *
 * Les deux aperçus (iframe de l'éditeur, route /preview) ne passent pas par ce
 * gabarit — d'où l'écart. Ce test verrouille la dérogation des deux côtés.
 *
 * Assertions sur le HTML rendu côté serveur, pas sur le DOM : jsdom refuse
 * `color: var(…)` et le retire de l'attribut `style`, ce qui rendrait le test
 * vert quoi qu'il arrive. Le rendu serveur est de toute façon exactement ce que
 * le visiteur reçoit.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ThemeLayout from "../layout";
import type { ThemeGlobalVariables } from "@/types";

const SETTINGS = {
  colors: {
    primary: "#1a56db",
    secondary: "#6b7280",
    accent: "#f59e0b",
    background: "#ffffff",
    text: "#111827",
  },
  // Une famille non système, pour que le lien Google soit réellement émis dans
  // le cas hérité (« Inter » est filtré comme police système).
  fonts: { heading: "Poppins", body: "Poppins" },
} as unknown as ThemeGlobalVariables;

function rendre(claudeDesign: boolean) {
  return renderToStaticMarkup(
    <ThemeLayout settings={SETTINGS} variables={{}} claudeDesign={claudeDesign}>
      <p>contenu</p>
    </ThemeLayout>,
  );
}

/** Ancré en début de déclaration : sinon `--color-text` matche « color: ». */
const declare = (html: string, prop: string) =>
  new RegExp(`(?:"|;)\\s*${prop}\\s*:`).test(html);

const chargeGoogle = (html: string) => html.includes("fonts.googleapis.com/css2");

describe("ThemeLayout", () => {
  it("n'impose ni police ni couleur à une conception Claude Design", () => {
    const html = rendre(true);

    expect(declare(html, "font-family")).toBe(false);
    expect(declare(html, "color")).toBe(false);
    // Aucune requête Google supplémentaire : la conception charge ses propres
    // fontes (ClaudeDesignAssets).
    expect(chargeGoogle(html)).toBe(false);
  });

  it("garde les variables du style guide pour le reste de la page (blog…)", () => {
    const html = rendre(true);

    expect(html).toContain("--color-text:#111827");
    expect(html).toContain("--font-body:Poppins");
  });

  it("continue de typographier un site NON Claude Design", () => {
    const html = rendre(false);

    expect(declare(html, "font-family")).toBe(true);
    expect(declare(html, "color")).toBe(true);
    expect(chargeGoogle(html)).toBe(true);
  });
});
