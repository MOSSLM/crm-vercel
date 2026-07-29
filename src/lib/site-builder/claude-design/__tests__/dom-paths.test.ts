import { parse } from "node-html-parser";
import {
  DOM_PATH_ATTR,
  nodeAtPath,
  parseDottedPath,
  pathOfOverrideKey,
  resolveNodeAtPath,
  stampDomPaths,
  stripDomPathStamps,
} from "../dom-paths";

const GRID = `<section><div class="grid">
  <article data-service-tag="climatisation"><h3>Clim</h3><img src="a.jpg"></article>
  <article data-service-tag="chauffage"><h3>Chauffage</h3><img src="b.jpg"></article>
  <article data-service-tag="plomberie"><h3>Plomberie</h3><img src="c.jpg"></article>
</div></section>`;

describe("stampDomPaths", () => {
  it("stamps every element with its element-child path", () => {
    const out = stampDomPaths(GRID);
    const doc = parse(out);
    expect(doc.querySelector("section")?.getAttribute(DOM_PATH_ATTR)).toBe("0");
    expect(doc.querySelector(".grid")?.getAttribute(DOM_PATH_ATTR)).toBe("0.0");
    const cards = doc.querySelectorAll("article");
    expect(cards.map((c) => c.getAttribute(DOM_PATH_ATTR))).toEqual(["0.0.0", "0.0.1", "0.0.2"]);
  });

  it("only stamps the requested paths (override keys accepted)", () => {
    const out = stampDomPaths(GRID, { only: ["0.0.2.1:image", "0.0.0"] });
    const doc = parse(out);
    expect(doc.querySelectorAll(`[${DOM_PATH_ATTR}]`).length).toBe(2);
    expect(doc.querySelectorAll("article")[0].getAttribute(DOM_PATH_ATTR)).toBe("0.0.0");
    expect(doc.querySelectorAll("article")[2].querySelector("img")?.getAttribute(DOM_PATH_ATTR)).toBe("0.0.2.1");
  });

  it("is a no-op when the `only` list is empty", () => {
    expect(stampDomPaths(GRID, { only: [] })).toBe(GRID);
  });

  it("anchors on the section root when asked (SSR render shape)", () => {
    // Le rendu d'une section a une racine unique, éventuellement précédée des
    // indices de ressources émis par React 19 : les chemins partent de ses
    // enfants, pas de la racine elle-même.
    const ssr = `<link rel="preload" href="x.jpg"><div data-claude-design=""><h1>T</h1><p>B</p></div>`;
    const doc = parse(stampDomPaths(ssr, { mode: "section-root" }));
    expect(doc.querySelector("h1")?.getAttribute(DOM_PATH_ATTR)).toBe("0");
    expect(doc.querySelector("p")?.getAttribute(DOM_PATH_ATTR)).toBe("1");
    expect(doc.querySelector("div")?.getAttribute(DOM_PATH_ATTR)).toBeFalsy();
  });
});

describe("resolveNodeAtPath", () => {
  // C'est LE bug d'origine : conditionner la page pour une entreprise retire des
  // cartes, ce qui décale tous les chemins suivants. Le tampon doit survivre.
  it("finds a node at its ORIGINAL path after an earlier sibling was removed", () => {
    const stamped = stampDomPaths(GRID);
    const doc = parse(stamped);
    // L'entreprise n'a pas la clim → sa carte disparaît, tout glisse d'un cran.
    doc.querySelector('[data-service-tag="climatisation"]')?.remove();

    const root = doc.querySelector("section")!;
    // Marche positionnelle nue : on tombe sur la MAUVAISE carte (plomberie).
    expect(nodeAtPath(root, [0, 2])).toBeNull();
    expect(nodeAtPath(root, [0, 1])?.text).toContain("Plomberie");
    // Résolution par tampon : chaque carte reste la sienne.
    expect(resolveNodeAtPath(root, [0, 1], "0.0.1")?.text).toContain("Chauffage");
    expect(resolveNodeAtPath(root, [0, 2], "0.0.2")?.text).toContain("Plomberie");
  });

  it("falls back to the positional walk when nothing is stamped", () => {
    const root = parse(GRID).querySelector("section")!;
    expect(resolveNodeAtPath(root, [0, 1], "0.0.1")?.text).toContain("Chauffage");
  });
});

describe("stripDomPathStamps", () => {
  it("removes every stamp (used on duplicated cards)", () => {
    const out = stripDomPathStamps(stampDomPaths(GRID));
    expect(out).not.toContain(DOM_PATH_ATTR);
  });

  it("is a no-op on unstamped html", () => {
    expect(stripDomPathStamps(GRID)).toBe(GRID);
  });
});

describe("override key helpers", () => {
  it("splits a key and parses its path", () => {
    expect(pathOfOverrideKey("3.1.0:image")).toBe("3.1.0");
    expect(pathOfOverrideKey("3.1.0")).toBe("3.1.0");
    expect(parseDottedPath("3.1.0")).toEqual([3, 1, 0]);
    expect(parseDottedPath("")).toEqual([]);
  });
});
