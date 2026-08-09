/**
 * Le design livre deux rédactions ; ce module choisit la vraie. Ces tests
 * tournent sur le markup RÉEL de `template CVC - Agency`, copié tel quel — les
 * 112 démos du parc en dépendent.
 */

import { stripRgeRegions, porteDesVariantesRge } from "../strip-rge-regions";
import { etatRegionsDepuisVariables } from "../certifications-from-variables";

/** Barre de confiance du hero : chaque variante emporte SON séparateur. */
const HERO = `<div class="hero-trust">
        <span><span class="stars">★★★★★</span> <b>4,8/5</b></span>
        <span class="dot" data-rge="oui"></span>
        <span data-rge="oui">Certifié <b>RGE</b></span>
        <span class="dot" data-rge="non"></span>
        <span data-rge="non">Assurance <b>décennale</b></span>
        <span class="dot"></span>
        <span><b>Devis gratuit</b> sous 48 h</span>
      </div>`;

const PIED = `<div class="footer-labels">
          <span class="label-badge">Assurance décennale</span>
          <span class="label-badge" data-rge="oui">Certifié RGE</span>
          <span class="label-badge" data-rge="oui" data-rge-noms="">QualiPAC · Qualibat</span>
          <span class="label-badge" data-rge="non">Devis gratuit sous 48 h</span>
          <span class="label-badge" data-rge="non">Garantie pièces &amp; main-d'œuvre</span>
        </div>`;

const META = `<meta name="description" content="Artisan installateur RGE QualiPAC. Pompe à chaleur, climatisation." data-content-sans-rge="Artisan installateur : pompe à chaleur, climatisation, chauffage. Devis gratuit.">`;

/** La section aides n'a PAS de jumelle « non » — elle disparaît, c'est voulu. */
const AIDES = `<section class="section aides-section" data-rge="oui"><h2>Les aides</h2><p>MaPrimeRénov'…</p></section>`;

/** Prose : le gabarit sépare avec « et », pas avec « · ». */
const PROSE = `<p>Nous sommes certifiés <span data-rge-noms="">QualiPAC et Qualibat</span>.</p>`;

const avecRge = (...noms: string[]) => ({ verifie: true, noms });
const sansRge = { verifie: true, noms: [] as string[] };
const inconnu = { verifie: false, noms: [] as string[] };

describe("entreprise SANS qualification vérifiée", () => {
  it("bascule le hero sur la rédaction de repli", () => {
    const out = stripRgeRegions(HERO, sansRge);
    expect(out).toContain("Assurance <b>décennale</b>");
    expect(out).not.toContain("Certifié <b>RGE</b>");
  });

  it("emporte le séparateur de la variante retirée, pas un de plus", () => {
    // Chaque `.dot` est apparié à son texte. Un point orphelin ferait deux
    // séparateurs qui se suivent ; un point manquant collerait deux mentions.
    const out = stripRgeRegions(HERO, sansRge);
    expect(out.match(/class="dot"/g)).toHaveLength(2);
  });

  it("LIBÈRE les survivants de leur attribut, sinon le CSS les masque", () => {
    // Le piège central : `html:not([data-sans-rge]) [data-rge="non"] { display:
    // none }` est livré avec le design. Un survivant qui garde `data-rge="non"`
    // reste invisible — on aurait retiré le faux SANS révéler le vrai.
    const out = stripRgeRegions(HERO, sansRge);
    expect(out).not.toContain("data-rge");
  });

  it("bascule le pied de page et garde les gages inconditionnels", () => {
    const out = stripRgeRegions(PIED, sansRge);
    expect(out).toContain("Devis gratuit sous 48 h");
    expect(out).toContain("Garantie pièces");
    // Présent dans les deux cas : il ne dépend pas du RGE.
    expect(out).toContain("Assurance décennale");
    expect(out).not.toContain("Certifié RGE");
    expect(out).not.toContain("QualiPAC");
    expect(out).not.toContain("data-rge");
  });

  it("bascule le contenu de la meta description", () => {
    const out = stripRgeRegions(META, sansRge);
    expect(out).toContain('content="Artisan installateur : pompe à chaleur');
    expect(out).not.toContain("RGE QualiPAC");
    // L'attribut jumeau ne doit pas partir en ligne : il porte encore l'autre
    // rédaction, lisible dans la source.
    expect(out).not.toContain("data-content-sans-rge");
  });

  it("SUPPRIME la section aides, qui n'a pas de jumelle", () => {
    // MaPrimeRénov' et les CEE exigent un installateur RGE. Une entreprise qui
    // n'en a pas ne peut pas y ouvrir droit : le vide est la seule réponse.
    expect(stripRgeRegions(AIDES, sansRge).trim()).toBe("");
  });
});

describe("entreprise AVEC qualifications", () => {
  it("garde la rédaction RGE et libère ses nœuds", () => {
    const out = stripRgeRegions(HERO, avecRge("QualiPAC"));
    expect(out).toContain("Certifié <b>RGE</b>");
    expect(out).not.toContain("Assurance <b>décennale</b>");
    expect(out).not.toContain("data-rge");
    expect(out.match(/class="dot"/g)).toHaveLength(2);
  });

  it("remplace le gabarit de noms par les vrais certificats", () => {
    const out = stripRgeRegions(PIED, avecRge("QualiPAC", "Qualibois", "Ventilation +"));
    expect(out).toContain("QualiPAC · Qualibois · Ventilation +");
    // Le gabarit annonçait Qualibat : cette entreprise ne l'a pas.
    expect(out).not.toContain("Qualibat");
    expect(out).not.toContain("data-rge-noms");
  });

  it("respecte le séparateur du gabarit — « et » en prose, « · » en badge", () => {
    // Imposer une virgule partout jurerait dans une phrase. Le design a choisi,
    // on suit.
    expect(stripRgeRegions(PROSE, avecRge("QualiPAC", "Qualibois"))).toContain(
      "QualiPAC et Qualibois",
    );
    expect(stripRgeRegions(PIED, avecRge("QualiPAC", "Qualibois"))).toContain(
      "QualiPAC · Qualibois",
    );
  });

  it("énumère proprement au-delà de deux noms en prose", () => {
    const out = stripRgeRegions(PROSE, avecRge("QualiPAC", "Qualibois", "Qualisol"));
    expect(out).toContain("QualiPAC, Qualibois et Qualisol");
  });

  it("garde la section aides", () => {
    expect(stripRgeRegions(AIDES, avecRge("QualiPAC"))).toContain("MaPrimeRénov");
  });

  it("garde la meta RGE et retire quand même l'attribut jumeau", () => {
    const out = stripRgeRegions(META, avecRge("QualiPAC"));
    expect(out).toContain("Artisan installateur RGE QualiPAC");
    expect(out).not.toContain("data-content-sans-rge");
  });
});

describe("rien de vérifié", () => {
  it("NE TOUCHE À RIEN — l'ignorance n'est pas une absence", () => {
    // §A10 : décision du propriétaire. Le markup sort à l'octet près.
    for (const m of [HERO, PIED, META, AIDES, PROSE]) {
      expect(stripRgeRegions(m, inconnu)).toBe(m);
    }
  });
});

describe("markup sans contrat", () => {
  it("sort intact", () => {
    const brut = "<footer><p>Mentions légales</p></footer>";
    expect(stripRgeRegions(brut, sansRge)).toBe(brut);
    expect(porteDesVariantesRge(brut)).toBe(false);
  });

  it("porteDesVariantesRge reconnaît les deux porteurs", () => {
    expect(porteDesVariantesRge('<span data-rge="non">x</span>')).toBe(true);
    // La meta n'a pas de `data-rge` : sans ce second marqueur, une page dont
    // seule la description est jumelée serait ignorée.
    expect(porteDesVariantesRge(META)).toBe(true);
  });
});

describe("décodage depuis les variables", () => {
  it("traduit les logos en noms courts", () => {
    // « QualiPAC module Chauffage et ECS » déborderait d'un badge.
    const etat = etatRegionsDepuisVariables({
      __rge_verifie: "1",
      __certifications: JSON.stringify([
        { cle: "qualipac", src: "/rge/qualipac.png", alt: "QualiPAC module Chauffage et ECS" },
        { cle: "chauffage-plus", src: "/rge/chauffage-plus.png", alt: "Chauffage +" },
      ]),
    });
    expect(etat).toEqual({ verifie: true, noms: ["QualiPAC", "Chauffage +"] });
  });

  it("distingue « zéro vérifié » de « jamais demandé »", () => {
    // Les deux ont une liste vide ; seul le drapeau les sépare, et ils
    // appellent des rédactions opposées.
    expect(etatRegionsDepuisVariables({ __rge_verifie: "1" })).toEqual({ verifie: true, noms: [] });
    expect(etatRegionsDepuisVariables({})).toEqual({ verifie: false, noms: [] });
  });
});
