/**
 * Un logo RGE affiché pour une entreprise qui ne détient pas la qualification
 * est une allégation trompeuse sur un site qu'on produit. Ces tests verrouillent
 * le comportement qui l'empêche.
 */

import { hydrateCertifications, type LogoCertification } from "../hydrate-certifications";

const logo = (cle: string, alt: string): LogoCertification => ({
  cle,
  src: `/rge/${cle}.png`,
  srcSet: `/rge/${cle}.png 1x, /rge/${cle}@2x.png 2x`,
  width: 360,
  height: 180,
  alt,
});

/** Bandeau tel qu'un design Claude le livre : garni de logos d'EXEMPLE. */
const DESIGN = `
<section class="certifs">
  <h2>Nos certifications</h2>
  <div data-certifications class="row">
    <div data-certification-item class="card" data-cdp="0.1.2">
      <img data-certification-logo src="/logos/exemple-qualibat.png" alt="RGE Qualibat">
    </div>
    <div data-certification-item class="card" data-cdp="0.1.3">
      <img data-certification-logo src="/logos/exemple-qualipac.png" alt="RGE QualiPAC">
    </div>
  </div>
</section>`;

describe("hydrateCertifications", () => {
  it("SUPPRIME le bloc entier quand aucune qualification n'est vérifiée", () => {
    // Le cas ECLEIS : son site affiche des logos, l'ADEME rend 0 ligne. Un
    // bandeau vide serait pire qu'absent — il attire l'œil sur un manque.
    const out = hydrateCertifications(DESIGN, []);
    expect(out).not.toContain("data-certifications");
    expect(out).not.toContain("exemple-qualibat");
    expect(out).not.toContain("data-certification-item");
  });

  it("remplace les logos d'exemple par les vrais", () => {
    const out = hydrateCertifications(DESIGN, [logo("qualipac", "QualiPAC module Chauffage et ECS")]);
    expect(out).toContain("/rge/qualipac.png");
    expect(out).toContain('alt="QualiPAC module Chauffage et ECS"');
    // Aucun logo du gabarit ne survit : sinon le client hériterait des
    // certifications du design.
    expect(out).not.toContain("exemple-qualibat");
    expect(out).not.toContain("exemple-qualipac");
  });

  it("rend exactement autant de cartes que de logos vérifiés", () => {
    const out = hydrateCertifications(DESIGN, [
      logo("qualipac", "QualiPAC module Chauffage et ECS"),
      logo("qualibois", "Qualibois Eau"),
      logo("qualisol", "Qualisol Combi"),
    ]);
    // Le design en proposait 2, on en a 3 : la rangée est reconstruite.
    expect(out.match(/data-certification-item/g)).toHaveLength(3);
    expect(out).toContain("/rge/qualibois.png");
    expect(out).toContain("/rge/qualisol.png");
  });

  it("pose le srcset @2x et les dimensions du gabarit normalisé", () => {
    const out = hydrateCertifications(DESIGN, [logo("qualibat", "QUALIBAT-RGE")]);
    expect(out).toContain("/rge/qualibat@2x.png 2x");
    expect(out).toContain('width="360"');
    expect(out).toContain('height="180"');
    expect(out).toContain('loading="lazy"');
  });

  it("ne laisse pas deux nœuds porter le même tampon data-cdp", () => {
    // Deux chemins identiques feraient s'appliquer un override d'édition inline
    // au mauvais élément (cf. claude-design/dom-paths.ts).
    const out = hydrateCertifications(DESIGN, [
      logo("qualipac", "QualiPAC"),
      logo("qualibois", "Qualibois Eau"),
    ]);
    expect(out.match(/data-cdp="0\.1\.2"/g) ?? []).toHaveLength(1);
  });

  it("ne touche pas un markup qui ne porte pas le marqueur", () => {
    const brut = "<section><h2>Nos certifications</h2><img src='/logos/x.png'></section>";
    expect(hydrateCertifications(brut, [])).toBe(brut);
    expect(hydrateCertifications(brut, [logo("qualipac", "QualiPAC")])).toBe(brut);
  });

  it("laisse le bloc intact quand il ne contient aucune carte-modèle", () => {
    // Sans gabarit, on ne sait pas quoi dupliquer : ne rien faire vaut mieux que
    // fabriquer un markup qui ne ressemble pas au design.
    const sansModele = '<div data-certifications><p>À venir</p></div>';
    expect(hydrateCertifications(sansModele, [logo("qualipac", "QualiPAC")])).toContain("À venir");
  });

  it("supprime le bloc même sans carte-modèle quand il n'y a rien à montrer", () => {
    const sansModele = '<div data-certifications><p>À venir</p></div>';
    expect(hydrateCertifications(sansModele, [])).not.toContain("data-certifications");
  });

  it("échappe les guillemets d'un alt, sans casser l'attribut", () => {
    const out = hydrateCertifications(DESIGN, [logo("qualipac", 'Quali"PAC')]);
    expect(out).not.toContain('alt="Quali"PAC"');
    expect(out).toContain("&quot;");
  });
});
