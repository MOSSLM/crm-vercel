/**
 * @jest-environment node
 *
 * Ce qui se casse si quelqu'un « simplifie » la garde anti-défilement latéral.
 *
 * Les trois propriétés verrouillées ici ont chacune été mesurée dans un vrai
 * navigateur sur le gabarit CVC (390 px de large, page réelle à 1112 px) :
 *
 *  - retirer la règle `html` → la dérive revient intégralement (722 px), parce
 *    que le `overflow-x` du `body` est PROPAGÉ au viewport et que `body` garde
 *    alors un `visible` d'usage : il ne clippe rien ;
 *  - retirer la règle `body` → la dérive disparaît, mais le `body { overflow-x:
 *    hidden }` du gabarit reprend ses droits et fait du `body` un conteneur de
 *    défilement : tous les en-têtes `position: sticky` du parc décollent ;
 *  - écrire `hidden` au lieu de `clip` → même conséquence sur les en-têtes
 *    collants, `hidden` créant lui aussi un conteneur de défilement ;
 *  - écrire `body` au lieu de `html body` → la feuille du design, injectée plus
 *    bas dans le document, gagne à spécificité égale et annule la garde.
 *
 * Le dernier test est le vrai : la garde doit être servie par le calque commun
 * au site publié et à l'aperçu brouillon, sinon la moitié des liens envoyés aux
 * prospects ne l'a pas.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CSS_SANS_DEFILEMENT_LATERAL } from "../defilement-lateral";

// Les deux balises de mesure d'audience tirent next/script, hors sujet ici.
jest.mock("@/components/analytics/PublicAnalytics", () => ({
  PublicAnalytics: () => null,
}));

/** Les déclarations de la garde, sélecteur par sélecteur. */
function declaration(css: string, selecteur: string): string | null {
  const m = new RegExp(`(?:^|})\\s*${selecteur}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1].trim() : null;
}

describe("garde anti-défilement latéral", () => {
  it("clippe sur `html` ET sur `body` — l'une sans l'autre ne fait rien", () => {
    expect(declaration(CSS_SANS_DEFILEMENT_LATERAL, "html")).toBe("overflow-x:clip");
    expect(declaration(CSS_SANS_DEFILEMENT_LATERAL, "html body")).toBe("overflow-x:clip");
  });

  it("vise `html body` et non `body`, pour battre la feuille du design", () => {
    // La feuille de la conception est injectée plus bas dans le document : à
    // spécificité égale, c'est elle qui gagnerait.
    expect(CSS_SANS_DEFILEMENT_LATERAL).not.toMatch(/(?:^|})\s*body\s*\{/);
  });

  it("n'emploie jamais `hidden`, qui décollerait les en-têtes", () => {
    expect(CSS_SANS_DEFILEMENT_LATERAL).not.toContain("hidden");
  });

  it("est servie par le calque commun au site publié et à l'aperçu", async () => {
    const { default: PublicSiteLayout } = await import("@/app/(public)/layout");
    const html = renderToStaticMarkup(
      <PublicSiteLayout>
        <p>contenu</p>
      </PublicSiteLayout>,
    );

    expect(html).toContain(CSS_SANS_DEFILEMENT_LATERAL);
  });
});
