import {
  EDIT_REVEAL_CSS,
  EDIT_REVEAL_SCRIPT,
  REVEAL_HOOK_SELECTOR,
  REVEAL_VISIBLE_CLASSES,
} from "@/lib/site-builder/claude-design/edit-reveal";

/**
 * Le comportement réel (un bloc sous la ligne de flottaison devient visible) se
 * vérifie dans un navigateur — jsdom ne fait pas de mise en page. Ce qui est
 * gardé ici, ce sont les garde-fous : ce que le script s'interdit de toucher.
 * Les relâcher casserait l'éditeur en silence.
 */
describe("edit-reveal", () => {
  it("ne cible que l'intérieur de #cd-root", () => {
    // Un sélecteur qui déborderait de #cd-root repeindrait le châssis de
    // l'éditeur lui-même (barres d'outils, panneaux) — pas seulement la page.
    const preludes = EDIT_REVEAL_CSS.split("}")
      .map((rule) => rule.split("{")[0].trim())
      .filter((prelude) => prelude.length > 0);

    expect(preludes.length).toBeGreaterThan(0);
    for (const prelude of preludes) {
      for (const sel of prelude.split(",")) {
        expect(sel.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toMatch(/^#cd-root\b/);
      }
    }
  });

  it("ne force jamais l'affichage d'un élément masqué (display)", () => {
    // Un élément supprimé par l'opérateur est posé en display:none !important —
    // le réafficher ferait réapparaître ce qu'il vient de retirer.
    expect(EDIT_REVEAL_CSS).not.toMatch(/display\s*:/);
    expect(EDIT_REVEAL_SCRIPT).not.toMatch(/setProperty\(\s*'display'/);
  });

  it("laisse tranquille ce qui est masqué sans animation", () => {
    // C'est ce test qui distingue « en attente d'apparition » de « volontairement
    // masqué » : sans lui, menus et bandeaux s'ouvriraient dans l'éditeur.
    expect(EDIT_REVEAL_SCRIPT).toContain("if(!hasAnim && !hasTrans) continue;");
  });

  it("épargne les éléments fixes (menus, modales, bandeaux)", () => {
    expect(EDIT_REVEAL_SCRIPT).toContain("cs.position === 'fixed'");
  });

  it("n'ajoute que des classes propres à l'apparition", () => {
    // `active`, `open` ou `show` déclencheraient des styles sans rapport.
    for (const forbidden of ["active", "open", "show", "current", "selected"]) {
      expect(REVEAL_VISIBLE_CLASSES).not.toContain(forbidden);
    }
    expect(REVEAL_VISIBLE_CLASSES).toContain("is-visible");
    expect(REVEAL_VISIBLE_CLASSES).toContain("aos-animate");
  });

  it("couvre les accroches d'apparition courantes", () => {
    for (const hook of [".reveal", "[data-aos]", "[data-reveal]", ".animate-on-scroll"]) {
      expect(REVEAL_HOOK_SELECTOR).toContain(hook);
    }
  });

  it("repasse plusieurs fois — une lib peut re-masquer après le chargement", () => {
    expect(EDIT_REVEAL_SCRIPT).toMatch(/setTimeout\(pass, d\)/);
    expect(EDIT_REVEAL_SCRIPT).toContain("addEventListener('load', pass)");
  });

  it("réveille les images en chargement différé", () => {
    expect(EDIT_REVEAL_SCRIPT).toContain(`img[loading="lazy"]`);
    expect(EDIT_REVEAL_SCRIPT).toContain(`setAttribute('loading','eager')`);
  });

  it("s'exécute sans lever quand #cd-root est absent", () => {
    // Le script est injecté dans une iframe : une page vide ne doit pas casser.
    expect(() => new Function(EDIT_REVEAL_SCRIPT)()).not.toThrow();
  });
});
