import { analyser } from "../analyze";
import type { CollecteSite } from "../types";

/**
 * Ces tests protègent la mesure la plus exposée de l'analyseur : celle qui
 * décide si l'on dit à un artisan que son site n'est pas adapté au mobile.
 *
 * Chaque cas ci-dessous reproduit un FAUX POSITIF réellement constaté en base,
 * pas un cas imaginé. Sur les 31 premières analyses, 22 sites déclenchaient
 * « site mal adapté au mobile » et un seul manquait réellement de `meta
 * viewport` : le compteur relevait 50 largeurs figées par page en moyenne, 502
 * au maximum.
 */

function collecte(html: string, feuilles?: Partial<CollecteSite>): CollecteSite {
  return {
    urlDemandee: "https://exemple.fr",
    urlFinale: "https://exemple.fr",
    httpStatus: 200,
    bloque: false,
    motifBlocage: null,
    injoignable: false,
    erreur: null,
    html,
    enTetes: { "content-type": "text/html" },
    https: true,
    ttfbMs: 200,
    chargementMs: 400,
    poidsOctets: 40_000,
    cssExterne: "",
    nbFeuillesDeclarees: 0,
    nbFeuillesLues: 0,
    robotsTxt: true,
    sitemapXml: true,
    ...feuilles,
  };
}

/** Enveloppe minimale : le corps doit être assez long pour ne pas être une coquille. */
function page(corps: string, tete = ""): string {
  const remplissage = "Menuiserie et agencement sur mesure à Antibes. ".repeat(30);
  return `<!doctype html><html lang="fr"><head><title>Menuiserie Berthier — Antibes</title>${tete}</head><body>${corps}<p>${remplissage}</p></body></html>`;
}

describe("compterLargeursFixes — les dimensions intrinsèques ne figent pas une mise en page", () => {
  it("ne compte pas les images adaptatives, quel que soit leur nombre", () => {
    // Le balisage que produisent WordPress et Next.js pour une image fluide.
    const imgs = Array.from(
      { length: 5 },
      (_, i) => `<img src="/p${i}.jpg" width="1200" height="800" alt="réalisation ${i}">`,
    ).join("");

    expect(analyser(collecte(page(imgs))).nbLargeursFixes).toBe(0);
  });

  it("compte en revanche un conteneur réellement figé", () => {
    const html = page('<table width="960"><tr><td>Nos tarifs</td></tr></table>');
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(1);
  });

  it("ne compte pas `max-width`, qui est l'idiome adaptatif", () => {
    // Le motif non ancré reconnaissait « width » dans « max-width » : la règle
    // la plus fluide du CSS était comptée à charge.
    const html = page("<div>Contenu</div>", "<style>.wrap{max-width:1200px;margin:auto}</style>");
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(0);
  });

  it("compte `min-width`, qui force bien un débordement", () => {
    const html = page("<div>Contenu</div>", "<style>.wrap{min-width:1200px}</style>");
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(1);
  });

  it("ne compte pas une largeur réservée au bureau par une media query", () => {
    const html = page(
      "<div>Contenu</div>",
      "<style>.wrap{width:100%}@media (min-width:1024px){.wrap{width:1200px}}</style>",
    );
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(0);
  });

  it("ne compte qu'une fois un élément figé deux fois", () => {
    const html = page('<table width="960" style="width:960px"><tr><td>x</td></tr></table>');
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(1);
  });

  it("ne compte pas une largeur explicitement rendue fluide", () => {
    const html = page('<div style="width:1200px;max-width:100%">Contenu</div>');
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(0);
  });

  it("laisse passer les largeurs sous le seuil mobile", () => {
    const html = page('<div style="width:320px">Colonne</div>');
    expect(analyser(collecte(html)).nbLargeursFixes).toBe(0);
  });
});

describe("compterPolicesTropPetites", () => {
  it("relève un texte réellement minuscule", () => {
    const html = page("<p>Mentions</p>", "<style>.legal{font-size:9px}</style>");
    expect(analyser(collecte(html)).nbPolicesTropPetites).toBe(1);
  });

  it("ignore `font-size: 0`, qui est une technique de mise en page", () => {
    const html = page("<p>x</p>", "<style>.ir{font-size:0}</style>");
    expect(analyser(collecte(html)).nbPolicesTropPetites).toBe(0);
  });

  it("ignore une petite police réservée au bureau", () => {
    const html = page(
      "<p>x</p>",
      "<style>@media (min-width:1024px){.note{font-size:10px}}</style>",
    );
    expect(analyser(collecte(html)).nbPolicesTropPetites).toBe(0);
  });
});

describe("CSS externe — ne pas conclure d'une absence là où on n'a pas regardé", () => {
  const AVEC_LIEN = '<link rel="stylesheet" href="https://exemple.fr/style.css">';

  it("compte les media queries de la feuille externe", () => {
    const s = analyser(
      collecte(page("<div>Contenu</div>", AVEC_LIEN), {
        cssExterne: "@media (max-width:768px){.wrap{width:100%}}",
        nbFeuillesDeclarees: 1,
        nbFeuillesLues: 1,
      }),
    );
    expect(s.cssLisible).toBe(true);
    expect(s.nbMediaQueries).toBe(1);
  });

  it("répond « inconnu » quand la feuille déclarée n'a pas pu être lue", () => {
    // Le cas qui coûtait 20 points à des sites parfaitement adaptatifs.
    const s = analyser(
      collecte(page("<div>Contenu</div>", AVEC_LIEN), {
        cssExterne: "",
        nbFeuillesDeclarees: 1,
        nbFeuillesLues: 0,
      }),
    );
    expect(s.cssLisible).toBe(false);
    expect(s.nbMediaQueries).toBeNull();
    expect(s.nbPolicesTropPetites).toBeNull();
  });

  it("reste concluant quand la page ne déclare aucune feuille externe", () => {
    // Tout le CSS est alors sous nos yeux : zéro règle mobile est un vrai zéro.
    const s = analyser(collecte(page("<div>Contenu</div>", "<style>.a{color:red}</style>")));
    expect(s.cssLisible).toBe(true);
    expect(s.nbMediaQueries).toBe(0);
  });

  it("voit une largeur figée qui vit dans la feuille externe", () => {
    const s = analyser(
      collecte(page("<div>Contenu</div>", AVEC_LIEN), {
        cssExterne: ".page{width:1200px}",
        nbFeuillesDeclarees: 1,
        nbFeuillesLues: 1,
      }),
    );
    expect(s.nbLargeursFixes).toBe(1);
  });
});

describe("cas complet : un site moderne ne doit déclencher aucun symptôme mobile", () => {
  it("une page Next.js typique sort avec zéro largeur figée", () => {
    const html = page(
      `<img src="/hero.avif" width="1920" height="1080" alt="chantier" loading="lazy">
       <img src="/a.avif" width="1200" height="900" alt="avant" loading="lazy">
       <picture><source srcset="/b.avif" width="1600"><img src="/b.jpg" width="1600" alt="après"></picture>
       <div class="wrap"><h1>Menuiserie Berthier</h1></div>`,
      `<meta name="viewport" content="width=device-width, initial-scale=1">
       <style>.wrap{max-width:1200px;width:100%}@media (min-width:768px){.grid{width:720px}}</style>`,
    );

    const s = analyser(collecte(html));
    expect(s.nbLargeursFixes).toBe(0);
    expect(s.viewport).toBe(true);
  });
});
