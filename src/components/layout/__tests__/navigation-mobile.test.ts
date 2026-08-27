/**
 * @jest-environment node
 */

/**
 * La couture entre le menu, les routes et le téléphone.
 *
 * ── CE QUE CES TESTS EMPÊCHENT DE SE REPRODUIRE ──────────────────────────
 * L'atelier a existé pendant plusieurs jours sans être inscrit dans
 * `spaces.ts`. Sa route répondait, mais le rail, le sous-menu ET la palette
 * ⌘K lisent tous ce fichier : l'écran n'existait pour aucun des trois. Rien ne
 * l'a signalé — un menu incomplet ne casse jamais rien, il perd juste des
 * écrans.
 *
 * Le test qui compte est le second : chaque destination de la barre du bas doit
 * être déclarée dans `spaces.ts`. C'est ce qui garantit que la RECHERCHE — la
 * seule porte vers ce que la barre ne propose pas — atteint aussi ce qu'elle
 * propose. Une destination mobile absente des espaces serait un écran qu'on ne
 * peut atteindre QUE depuis un téléphone.
 */

import fs from "fs";
import path from "path";

import { SPACES, getAllTools, getSpaceFromPath } from "../spaces";
import {
  DESTINATIONS_ADMIN,
  DESTINATIONS_AGENT,
  MAX_DESTINATIONS,
  destinationActive,
} from "../mobile";

const RACINE = path.join(__dirname, "..", "..", "..", "app", "(crm)");

const routeExiste = (href: string): boolean =>
  fs.existsSync(path.join(RACINE, href.replace(/^\//, ""), "page.tsx"));

describe("spaces.ts — « pas de lien mort »", () => {
  it("chaque outil déclaré pointe sur une route qui existe", () => {
    const morts = getAllTools()
      .filter((t) => !routeExiste(t.href))
      .map((t) => `${t.spaceLabel} › ${t.title} → ${t.href}`);
    expect(morts).toEqual([]);
  });

  it("chaque espace atterrit sur une route qui existe", () => {
    const morts = SPACES.filter((s) => !routeExiste(s.href)).map((s) => `${s.label} → ${s.href}`);
    expect(morts).toEqual([]);
  });
});

describe("la barre du bas", () => {
  it("tient sur une seule ligne", () => {
    // Cinq colonnes est le maximum tenable sur 360 px. Une sixième ne rendrait
    // pas la barre plus utile : elle rendrait les six illisibles.
    expect(DESTINATIONS_ADMIN.length).toBeLessThanOrEqual(MAX_DESTINATIONS);
    expect(DESTINATIONS_AGENT.length).toBeLessThanOrEqual(MAX_DESTINATIONS);
    expect(DESTINATIONS_ADMIN.length).toBeGreaterThan(0);
  });

  it("ne propose que des écrans qui existent", () => {
    for (const d of [...DESTINATIONS_ADMIN, ...DESTINATIONS_AGENT]) {
      expect(routeExiste(d.href)).toBe(true);
    }
  });

  it("n'atteint aucun écran que la recherche ne trouverait pas", () => {
    // LE TEST QUI COMPTE. La barre du bas ne montre qu'une poignée d'écrans ;
    // tout le reste passe par la recherche, qui lit `spaces.ts`. Une
    // destination absente des espaces serait atteignable UNIQUEMENT depuis un
    // téléphone — l'inverse exact de ce qu'on veut.
    const declares = new Set(getAllTools().map((t) => t.href));
    const absentes = DESTINATIONS_ADMIN.filter((d) => !declares.has(d.href)).map((d) => d.href);
    expect(absentes).toEqual([]);
  });

  it("range chaque destination dans un espace, jamais dans le fourre-tout", () => {
    // `getSpaceFromPath` retombe sur « hub » quand aucun préfixe ne correspond.
    // Une destination qui y retombe s'afficherait sous le mauvais libellé dans
    // le fil d'Ariane et le sous-menu de bureau.
    for (const d of DESTINATIONS_ADMIN) {
      expect(getSpaceFromPath(d.href)).not.toBe("hub");
    }
  });

  it("porte une raison pour chaque entrée, et pas une phrase creuse", () => {
    // Le `pourquoi` est le critère d'entrée, pas un commentaire : c'est la
    // seule chose qui empêche la liste de regonfler jusqu'à redevenir le menu
    // de bureau.
    for (const d of [...DESTINATIONS_ADMIN, ...DESTINATIONS_AGENT]) {
      expect(d.pourquoi.length).toBeGreaterThan(40);
    }
  });

  it("ne donne pas deux fois la même clé", () => {
    const cles = DESTINATIONS_ADMIN.map((d) => d.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe("destinationActive", () => {
  it("allume l'entrée d'un chemin et de ses sous-chemins", () => {
    expect(destinationActive("/atelier", DESTINATIONS_ADMIN)).toBe("atelier");
    expect(destinationActive("/equipe/quoi-que-ce-soit", DESTINATIONS_ADMIN)).toBe("equipe");
  });

  it("n'allume RIEN sur un écran hors de la barre, et c'est normal", () => {
    // On ouvre le Site builder par la recherche : la barre n'allume rien. Mieux
    // vaut ça qu'allumer la destination la plus proche, qui ferait croire qu'on
    // est ailleurs.
    expect(destinationActive("/site-builder", DESTINATIONS_ADMIN)).toBeNull();
    expect(destinationActive("/", DESTINATIONS_ADMIN)).toBeNull();
  });

  it("ne confond pas un préfixe avec le début d'un autre mot", () => {
    // `/atelierX` n'est pas `/atelier`. Sans la coupure sur « / », un futur
    // `/equipements` allumerait « Équipe ».
    expect(destinationActive("/atelierX", DESTINATIONS_ADMIN)).toBeNull();
    expect(destinationActive("/equipements", DESTINATIONS_ADMIN)).toBeNull();
  });

  it("donne la victoire au préfixe le plus long", () => {
    const liste = [
      { ...DESTINATIONS_ADMIN[0], cle: "large", prefixes: ["/prospection"] },
      { ...DESTINATIONS_ADMIN[0], cle: "precise", prefixes: ["/prospection/taches"] },
    ];
    expect(destinationActive("/prospection/taches", liste)).toBe("precise");
    expect(destinationActive("/prospection/lissage", liste)).toBe("large");
  });
});
