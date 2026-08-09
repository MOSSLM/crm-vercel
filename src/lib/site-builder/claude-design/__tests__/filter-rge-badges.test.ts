/**
 * Les 450 sections en base affichent « RGE QualiPAC · Qualibat · Qualifelec »
 * en pied de page, pour tout le monde. Ces tests verrouillent le retrait — et
 * surtout ses limites : ce module efface des allégations, il ne doit rien
 * effacer d'autre.
 */

import { filterRgeBadges, qualificationDuBadge } from "../filter-rge-badges";
import { etatBadgesDepuisVariables } from "../certifications-from-variables";
import { renderRawSection, unwrapRawHtml } from "@/lib/site-builder/render-raw-section";
import { CLES_LOGOS } from "@/lib/donnees-publiques/rge-logos";

/** Pied de page tel qu'il est écrit dans les 450 sections, copié depuis la base. */
const PIED = `<div class="footer-col">
  <p>Votre partenaire en chauffage, climatisation, photovoltaïque à {{ entreprise.ville }}.</p>
  <div class="footer-labels">
    <span class="label-badge">RGE QualiPAC</span>
    <span class="label-badge">Qualibat</span>
    <span class="label-badge">Qualifelec</span>
  </div>
</div>`;

/** La variante à 4 badges, sur 99 sections : le 4e est un attribut RÉEL. */
const PIED_FLUIDES = `<div class="footer-labels">
  <span class="label-badge">RGE QualiPAC</span>
  <span class="label-badge">Qualibat</span>
  <span class="label-badge">Qualifelec</span>
  <span class="label-badge">Attestation fluides n° {{ entreprise.attestation_fluides }}</span>
</div>`;

const verifie = (...cles: string[]) => ({ verifie: true, clesDetenues: cles });

describe("filterRgeBadges", () => {
  it("retire les trois badges quand l'ADEME confirme zéro", () => {
    // Le cas des 95 projets : le bandeau de logos disparaît déjà, le pied de
    // page continuait d'afficher trois qualifications.
    const out = filterRgeBadges(PIED, verifie());
    expect(out).not.toContain("QualiPAC");
    expect(out).not.toContain("Qualibat");
    expect(out).not.toContain("Qualifelec");
    // Le texte du pied de page, lui, est intact.
    expect(out).toContain("Votre partenaire en chauffage");
  });

  it("supprime le conteneur devenu vide", () => {
    // `.footer-labels` porte un gap et une marge : le laisser vide creuserait
    // un blanc inexpliqué sous le paragraphe.
    expect(filterRgeBadges(PIED, verifie())).not.toContain("footer-labels");
  });

  it("garde le badge d'une qualification réellement détenue", () => {
    const out = filterRgeBadges(PIED, verifie("qualibat"));
    expect(out).toContain("Qualibat");
    expect(out).not.toContain("QualiPAC");
    expect(out).not.toContain("Qualifelec");
    // Un seul badge subsiste, donc le conteneur reste.
    expect(out).toContain("footer-labels");
  });

  it("ne touche à rien quand l'entreprise détient tout ce qui est affiché", () => {
    const out = filterRgeBadges(PIED, verifie("qualipac", "qualibat", "qualifelec"));
    expect(out).toBe(PIED);
  });

  it("NE TOUCHE PAS un badge qui n'est pas une qualification", () => {
    // « Attestation fluides » est un attribut réel de l'entreprise. L'effacer
    // supprimerait une information vraie — présent sur 99 sections.
    const out = filterRgeBadges(PIED_FLUIDES, verifie());
    expect(out).toContain("Attestation fluides");
    expect(out).toContain("entreprise.attestation_fluides");
    expect(out).not.toContain("Qualibat");
    // Le conteneur survit puisqu'il lui reste un badge légitime.
    expect(out).toContain("footer-labels");
  });

  it("NE TOUCHE À RIEN tant que rien n'est vérifié", () => {
    // §A10 : l'ignorance n'est pas une absence. Sans SIRET ou sans
    // interrogation ADEME, la page reste telle quelle.
    expect(filterRgeBadges(PIED, { verifie: false, clesDetenues: [] })).toBe(PIED);
    expect(filterRgeBadges(PIED_FLUIDES, { verifie: false, clesDetenues: [] })).toBe(PIED_FLUIDES);
  });

  it("laisse intact un markup sans badge", () => {
    const brut = "<footer><p>Mentions légales</p></footer>";
    expect(filterRgeBadges(brut, verifie())).toBe(brut);
  });

  it("reconnaît aussi la convention explicite data-rge-badge", () => {
    const futur = '<div data-rge-badges><span data-rge-badge>Qualibat</span></div>';
    expect(filterRgeBadges(futur, verifie())).not.toContain("Qualibat");
    expect(filterRgeBadges(futur, verifie("qualibat"))).toContain("Qualibat");
  });
});

describe("qualificationDuBadge", () => {
  it("reconnaît les trois libellés réellement présents en base", () => {
    expect(qualificationDuBadge("RGE QualiPAC")).toBe("qualipac");
    expect(qualificationDuBadge("Qualibat")).toBe("qualibat");
    expect(qualificationDuBadge("Qualifelec")).toBe("qualifelec");
  });

  it("reconnaît le nom ADEME complet autant que la marque", () => {
    // Selon l'endroit, le même certificat s'écrit « QUALIBAT-RGE » ou
    // « Qualibat » ; les deux doivent tomber sur la même clé.
    expect(qualificationDuBadge("QUALIBAT-RGE")).toBe("qualibat");
    expect(qualificationDuBadge("QualiPAC module Chauffage et ECS")).toBe("qualipac");
    expect(qualificationDuBadge("Chauffage +")).toBe("chauffage-plus");
  });

  it("rend null sur ce qui n'est pas une qualification", () => {
    // Le cas protecteur : ce qu'on ne reconnaît pas ne sera jamais retiré.
    expect(qualificationDuBadge("Attestation fluides n° {{ x }}")).toBeNull();
    expect(qualificationDuBadge("Assurance décennale")).toBeNull();
    expect(qualificationDuBadge("Devis gratuit")).toBeNull();
    expect(qualificationDuBadge("")).toBeNull();
    expect(qualificationDuBadge("RGE")).toBeNull();
  });

  it("couvre toutes les clés de logo connues", () => {
    // Si le mapping gagne un certificat, son libellé doit rester reconnaissable
    // sans qu'on ait à revenir ici.
    for (const cle of CLES_LOGOS) expect(qualificationDuBadge(cle)).toBe(cle);
  });
});

// ---------------------------------------------------------------------------
// Le chemin de rendu réel
// ---------------------------------------------------------------------------
/**
 * Les sections ne sont pas stockées en HTML : ce sont des composants dont le
 * markup est une chaîne JS échappée. Le filtre s'applique APRÈS `unwrapRawHtml`
 * + `renderRawSection`. Tester sur du HTML écrit à la main ne prouverait pas
 * qu'il voit le markup réel — ce test passe par le même déballage que le rendu.
 */
describe("dans le pipeline de rendu", () => {
  const FOOTER = `<div class="footer-labels">
          <span class="label-badge">RGE QualiPAC</span>
          <span class="label-badge">Qualibat</span>
          <span class="label-badge">Qualifelec</span>
        </div>`;
  // Forme exacte produite par `wrapRawHtml`, y compris la réécriture de `</`.
  const CODE =
    `export default function ClaudeDesign({ variables = {} }) {\n` +
    `  var __html = ${JSON.stringify(FOOTER).replace(/<\//g, "<\\/")};\n` +
    `  return null;\n}\n`;

  const rendu = () => {
    const brut = unwrapRawHtml(CODE);
    expect(brut).not.toBeNull();
    return renderRawSection(brut as string, {});
  };

  it("retire les badges du markup réellement déballé", () => {
    const out = filterRgeBadges(rendu(), { verifie: true, clesDetenues: [] });
    expect(out).not.toContain("label-badge");
    expect(out).not.toContain("footer-labels");
    // L'enveloppe du rendu survit : on ne touche qu'au bloc visé.
    expect(out).toContain('data-claude-design=""');
  });

  it("décode l'état depuis les variables, comme les deux surfaces de rendu", () => {
    // Vérifié + une qualification détenue.
    const avec = etatBadgesDepuisVariables({
      __rge_verifie: "1",
      __certifications: JSON.stringify([
        { cle: "qualibat", src: "/rge/qualibat.png", alt: "QUALIBAT-RGE" },
      ]),
    });
    expect(avec).toEqual({ verifie: true, clesDetenues: ["qualibat"] });
    expect(filterRgeBadges(rendu(), avec)).toContain("Qualibat");

    // Vérifié, zéro qualification : `__certifications` est ABSENT, pas vide.
    const zero = etatBadgesDepuisVariables({ __rge_verifie: "1" });
    expect(zero).toEqual({ verifie: true, clesDetenues: [] });
    expect(filterRgeBadges(rendu(), zero)).not.toContain("label-badge");

    // Jamais interrogé : mêmes variables vides, comportement OPPOSÉ.
    const inconnu = etatBadgesDepuisVariables({});
    expect(inconnu.verifie).toBe(false);
    expect(filterRgeBadges(rendu(), inconnu)).toContain("RGE QualiPAC");
  });
});
