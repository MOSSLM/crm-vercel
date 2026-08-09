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

// ---------------------------------------------------------------------------
// Le template CVC livré — markup RÉEL, copié de `template CVC - Classique`
// ---------------------------------------------------------------------------
/**
 * Bloc certifications tel qu'il est écrit dans le template, avec ses cinq logos
 * en dur et son chapeau. Il ne porte AUCUN attribut `data-certification*` :
 * c'est précisément pour ça que le tweak doit reconnaître aussi la convention
 * `.certif-row` / `.certif-logo` — sinon rien ne se passerait sur les templates
 * qui existent déjà, et le contrôle ADEME resterait sans effet visible.
 */
const CVC_REEL = `<section class="section certif-band" id="sec-certifs">
  <div class="wrap">
    <p class="certif-lead">Certifications &amp; qualifications reconnues par l'État</p>
    <div class="certif-row reveal">
      <div class="certif-logo"><img src="../images/certifications/qualibat.png" alt="RGE Qualibat" loading="lazy" width="120" height="120"></div>
      <div class="certif-logo"><img src="../images/certifications/qualipac.png" alt="RGE QualiPAC, pompes à chaleur" loading="lazy" width="158" height="79"></div>
      <div class="certif-logo"><img src="../images/certifications/chauffage-plus.png" alt="RGE Chauffage+" loading="lazy" width="158" height="142"></div>
      <div class="certif-logo certif-logo--tall"><img src="../images/certifications/qualifelec.png" alt="RGE Qualifelec, électricité" loading="lazy" width="719" height="968"></div>
      <div class="certif-logo"><img src="../images/certifications/qualipv.webp" alt="RGE QualiPV, photovoltaïque" loading="lazy" width="120" height="120"></div>
    </div>
  </div>
</section>`;

describe("template CVC livré", () => {
  it("remplace les cinq logos en dur par les seuls logos vérifiés", () => {
    const out = hydrateCertifications(CVC_REEL, [
      logo("qualipac", "QualiPAC module Chauffage et ECS"),
      logo("qualibois", "Qualibois Eau"),
    ]);
    // Les logos du template disparaissent TOUS — y compris ceux que
    // l'entreprise ne détient pas, ce qui est le but.
    expect(out).not.toContain("images/certifications/qualibat.png");
    expect(out).not.toContain("images/certifications/qualifelec.png");
    expect(out).not.toContain("images/certifications/qualipv.webp");
    expect(out).toContain("/rge/qualipac.png");
    expect(out).toContain("/rge/qualibois.png");
    expect(out.match(/certif-logo/g)).toHaveLength(2);
  });

  it("conserve la mise en forme du template", () => {
    const out = hydrateCertifications(CVC_REEL, [logo("qualipac", "QualiPAC")]);
    // Seules les images changent : la rangée garde ses classes, la carte la
    // sienne, le chapeau reste.
    expect(out).toContain('class="certif-row reveal"');
    expect(out).toContain('class="certif-logo"');
    expect(out).toContain("qualifications reconnues par l");
  });

  it("uniformise des dimensions qui vont de 120x120 à 719x968 dans le template", () => {
    // Le CSS force `height: 84px; width: auto`. Avec des sources de ratios
    // différents la rangée est bancale ; toutes sur le canevas 360x180, elles
    // se rendent à l'identique.
    const out = hydrateCertifications(CVC_REEL, [
      logo("qualipac", "QualiPAC"),
      logo("qualifelec", "Certificat Qualifelec RGE"),
    ]);
    expect(out).not.toContain('width="719"');
    expect(out.match(/width="360"/g)).toHaveLength(2);
    expect(out.match(/height="180"/g)).toHaveLength(2);
  });

  it("SUPPRIME la section entière, chapeau compris, quand rien n'est vérifié", () => {
    const out = hydrateCertifications(CVC_REEL, []);
    // Le chapeau ne doit pas survivre seul : une section qui annonce des
    // certifications sans en montrer aucune est pire qu'absente.
    expect(out).not.toContain("certif-row");
    expect(out).not.toContain("sec-certifs");
    expect(out).not.toContain("qualifications reconnues");
    expect(out.trim()).toBe("");
  });
});
