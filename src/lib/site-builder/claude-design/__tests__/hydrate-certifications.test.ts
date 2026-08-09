/**
 * Un logo RGE affiché pour une entreprise qui ne détient pas la qualification
 * est une allégation trompeuse sur un site qu'on produit. Ces tests verrouillent
 * le comportement qui l'empêche.
 */

import {
  hydrateCertifications,
  porteDesCertifications,
  type LogoCertification,
} from "../hydrate-certifications";

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

// ---------------------------------------------------------------------------
// Le template CVC révisé — markup RÉEL de `template_cvc12`, 09/08/2026
// ---------------------------------------------------------------------------
/**
 * Le template porte maintenant le contrat explicite ET l'ancienne convention :
 * `.certif-row[data-certifications]` sur le même élément, et une SEULE carte
 * livrée en gabarit au lieu de cinq logos en dur.
 *
 * Ce sont les six variantes (Agency, Brut, Classique, Nocturne, Studio,
 * Verdure) qui partagent ce markup à l'identique — le vérifier une fois suffit.
 *
 * Le double marquage est ce qui rend le dédoublonnage nécessaire : sans lui le
 * bloc serait hydraté deux fois, et supprimé deux fois quand il n'y a rien.
 */
const CVC_REVISE = `<section class="section certif-band" id="sec-certifs">
  <div class="wrap">
    <p class="certif-lead">Certifications &amp; qualifications reconnues par l'État</p>
    <div class="certif-row reveal" data-certifications="">
      <div class="certif-logo" data-certification-item=""><img src="../images/certifications/qualibat.png" alt="RGE Qualibat" data-certification-logo="" loading="lazy" width="360" height="180"></div>
    </div>
  </div>
</section>`;

describe("template CVC révisé (contrat explicite)", () => {
  it("garnit la rangée qui porte les deux conventions, sans doubler les cartes", () => {
    const out = hydrateCertifications(CVC_REVISE, [
      logo("qualipac", "QualiPAC module Chauffage et ECS"),
      logo("qualibois", "Qualibois Eau"),
    ]);
    expect(out.match(/data-certification-item/g)).toHaveLength(2);
    expect(out.match(/certif-logo/g)).toHaveLength(2);
    expect(out).not.toContain("images/certifications/qualibat.png");
  });

  it("duplique l'unique carte-gabarit autant de fois qu'il y a de qualifications", () => {
    // Le maximum observé en base est 5 ; au-delà de 4, site.js bascule la
    // rangée en bandeau défilant sans que le CRM ait à s'en occuper.
    const cles = ["qualibat", "qualipac", "qualipv", "qualibois", "qualisol"];
    const out = hydrateCertifications(CVC_REVISE, cles.map((c) => logo(c, c)));
    expect(out.match(/certif-logo/g)).toHaveLength(5);
    for (const c of cles) expect(out).toContain(`/rge/${c}.png`);
  });

  it("rend une seule carte sans casser la rangée quand il n'y a qu'une qualification", () => {
    const out = hydrateCertifications(CVC_REVISE, [logo("qualipac", "QualiPAC")]);
    expect(out.match(/certif-logo/g)).toHaveLength(1);
    expect(out).toContain('class="certif-row reveal"');
    expect(out).toContain("qualifications reconnues par l");
  });

  it("SUPPRIME la section entière une seule fois quand rien n'est vérifié", () => {
    // Le double marquage faisait passer deux fois par `.remove()`, sur un nœud
    // déjà détaché au second tour.
    const out = hydrateCertifications(CVC_REVISE, []);
    expect(out.trim()).toBe("");
  });

  it("garde le contrat data-* sur les cartes produites, pour site.js", () => {
    // site.js lit `[data-certifications]` puis clone les cartes ; s'il ne
    // retrouve pas la rangée, le bandeau défilant ne se déclenche jamais.
    const out = hydrateCertifications(CVC_REVISE, [logo("qualipac", "QualiPAC")]);
    expect(out).toContain("data-certifications");
    expect(out).toContain("data-certification-item");
    expect(out).toContain("data-certification-logo");
  });
});

describe("conteneurs imbriqués", () => {
  /**
   * Le piège qu'un futur design tendra tôt ou tard : poser le marqueur sur la
   * `<section>` plutôt que sur la rangée, en gardant `.certif-row` dedans.
   * Garnir la section reviendrait à y remplacer TOUT — la rangée flex et son
   * chapeau partiraient avec, et les cartes se retrouveraient nues.
   */
  const IMBRIQUE = `<section class="certif-band" id="sec-certifs" data-certifications>
  <p class="certif-lead">Certifications reconnues par l'État</p>
  <div class="certif-row reveal">
    <div class="certif-logo"><img src="/tpl/qualibat.png" alt="Qualibat"></div>
  </div>
</section>`;

  it("garnit la rangée, pas la section qui l'enveloppe", () => {
    const out = hydrateCertifications(IMBRIQUE, [logo("qualipac", "QualiPAC"), logo("qualibois", "Qualibois")]);
    // La rangée survit : c'est elle qui porte le flex, le centrage et le gap.
    expect(out).toContain('class="certif-row reveal"');
    // Le chapeau aussi — il est frère de la rangée, pas dedans.
    expect(out).toContain("Certifications reconnues");
    expect(out.match(/certif-logo/g)).toHaveLength(2);
    expect(out).not.toContain("/tpl/qualibat.png");
  });

  it("supprime quand même la section entière quand rien n'est vérifié", () => {
    expect(hydrateCertifications(IMBRIQUE, []).trim()).toBe("");
  });
});

describe("porteDesCertifications", () => {
  /**
   * Ce prédicat existe parce qu'un appelant qui court-circuite l'hydratation
   * doit tester la même chose qu'elle. `LibrarySectionInline` — le rendu du site
   * PUBLIÉ — ne testait que `data-certifications`, donc les sections en
   * `.certif-row` gardaient les logos du template en ligne alors que l'aperçu de
   * l'éditeur, lui, les corrigeait. La divergence allait dans le mauvais sens.
   */
  it("reconnaît les deux conventions", () => {
    expect(porteDesCertifications('<div data-certifications></div>')).toBe(true);
    expect(porteDesCertifications('<div class="certif-row"></div>')).toBe(true);
  });

  it("ignore un markup sans bloc de certifications", () => {
    expect(porteDesCertifications("<section><h2>Nos garanties</h2></section>")).toBe(false);
  });

  it("est vrai partout où hydrateCertifications agit", () => {
    // L'invariant qui empêche la divergence de revenir : si l'hydratation
    // modifie le markup, le garde-fou doit laisser passer.
    for (const markup of [DESIGN, CVC_REEL, CVC_REVISE]) {
      expect(hydrateCertifications(markup, [])).not.toBe(markup);
      expect(porteDesCertifications(markup)).toBe(true);
    }
  });
});
