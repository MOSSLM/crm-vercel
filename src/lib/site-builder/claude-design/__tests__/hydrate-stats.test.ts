import { hydrateStats } from "../hydrate-stats";
import { stampDomPaths } from "../dom-paths";
import { DOM_PATH_ATTR } from "../dom-paths";

const GRID = `<div class="stats" data-stats>
  <div class="card" data-stat-item>
    <span data-stat-value>15</span><span data-stat-suffix>+</span>
    <span data-stat-label>Années d'expérience</span>
  </div>
</div>`;

const STATS = JSON.stringify([
  { label: "Années d'expérience", value: "12", display_order: 10 },
  { label: "Clients satisfaits", value: "480", display_order: 20 },
  { label: "Installations réalisées", value: "1 300", display_order: 30 },
]);

describe("hydrateStats", () => {
  it("duplicates the template card once per stat and fills value + label", () => {
    const out = hydrateStats(GRID, STATS);
    expect(out.match(/data-stat-item/g)).toHaveLength(3);
    expect(out).toContain(">12<");
    expect(out).toContain(">480<");
    expect(out).toContain(">1 300<");
    expect(out).toContain("Clients satisfaits");
    expect(out).toContain("Installations réalisées");
    // La valeur d'exemple du design ne doit plus apparaître.
    expect(out).not.toContain(">15<");
  });

  it("keeps the decorative suffix untouched on every card", () => {
    expect(hydrateStats(GRID, STATS).match(/data-stat-suffix>\+</g)).toHaveLength(3);
  });

  // Le repli qui manquait : un chiffre absent laissait un libellé orphelin.
  it("keeps the design's example cards when there is nothing to inject", () => {
    expect(hydrateStats(GRID, undefined)).toBe(GRID);
    expect(hydrateStats(GRID, JSON.stringify([]))).toBe(GRID);
    expect(hydrateStats(GRID, "pas du json")).toBe(GRID);
  });

  it("ignores stats without a value or without a label", () => {
    const partial = JSON.stringify([
      { label: "Années d'expérience", value: "12" },
      { label: "Qualifications", value: "" },
      { label: "", value: "9" },
    ]);
    const out = hydrateStats(GRID, partial);
    expect(out.match(/data-stat-item/g)).toHaveLength(1);
    expect(out).toContain(">12<");
  });

  it("is a no-op without a data-stats grid or a template card", () => {
    const plain = "<section><p>Rien ici</p></section>";
    expect(hydrateStats(plain, STATS)).toBe(plain);
    const noTemplate = `<div data-stats><p>vide</p></div>`;
    expect(hydrateStats(noTemplate, STATS)).toBe(noTemplate);
  });

  it("keeps the DOM-path stamp on the first card only", () => {
    const out = hydrateStats(stampDomPaths(GRID), STATS);
    // Un chemin ne peut désigner qu'un nœud : les copies perdent leur tampon.
    expect(out.match(new RegExp(`${DOM_PATH_ATTR}="0.0"`, "g"))).toHaveLength(1);
  });
});
