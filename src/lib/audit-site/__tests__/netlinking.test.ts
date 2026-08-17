import {
  domaineDe,
  netlinkingEstFrais,
  preuvesNetlinking,
  RANG_GRAVE,
  SEUIL_RANG,
  TTL_NETLINKING_JOURS,
} from "../netlinking";

/**
 * L'axe qu'on ne répare pas, et qu'on affiche quand même.
 *
 * Un site neuf et vide n'a aucun lien entrant : rapide parce que rien dedans,
 * invisible parce que personne n'y renvoie. La vitesse flattait la première
 * moitié ; cet axe constate la seconde. Il fonde une offre SEO optionnelle, pas
 * une promesse de la colonne « Après » — on ne vend pas des liens avec une
 * vitrine, et le document ne doit rien laisser croire de tel.
 */
describe("le domaine interrogé", () => {
  it("réduit une URL à son domaine nu", () => {
    expect(domaineDe("https://www.Doussot.fr/contact?x=1")).toBe("doussot.fr");
    expect(domaineDe("doussot.fr")).toBe("doussot.fr");
  });

  it("rend null sur ce qui n'est pas une adresse", () => {
    expect(domaineDe(null)).toBeNull();
    expect(domaineDe("")).toBeNull();
    expect(domaineDe("   ")).toBeNull();
  });
});

describe("la preuve stockée", () => {
  it("juge au seuil, et se lit sur 10", () => {
    const [p] = preuvesNetlinking(SEUIL_RANG);
    expect(p.verdict).toBe("ok");
    expect(p.valeur).toBe("3,0 / 10");
    expect(p.seuil).toBe("3,0 / 10");
  });

  it("distingue le domaine discret du domaine ignoré", () => {
    // Deux situations différentes, deux verdicts différents : quelqu'un parle
    // un peu de vous, ou personne n'en parle du tout.
    expect(preuvesNetlinking(RANG_GRAVE + 0.5)[0].verdict).toBe("moyen");
    expect(preuvesNetlinking(0)[0].verdict).toBe("probleme");
  });

  it("donne la gravité maximale à un domaine que personne ne cite", () => {
    expect(preuvesNetlinking(0)[0].gravite).toBe(1);
  });

  it("ne produit AUCUNE preuve sans mesure", () => {
    // Pas de clé d'API, pas de réseau, domaine inconnu : l'axe n'existe pas.
    // Un axe absent ne s'affiche pas — jamais un zéro par défaut, qui se lirait
    // comme un jugement alors que rien n'a été regardé.
    expect(preuvesNetlinking(null)).toEqual([]);
  });

  /**
   * ON N'INVENTE PAS UN NOMBRE DE LIENS. Open PageRank rend un rang, pas un
   * décompte de domaines référents. Écrire « 3 sites pointent vers vous »
   * serait un chiffre fabriqué — exactement ce que ce document existe pour ne
   * jamais contenir.
   */
  it("n'affirme jamais un nombre de sites référents", () => {
    const [p] = preuvesNetlinking(2.4);
    expect(p.valeur).not.toMatch(/site|lien|domaine/i);
    expect(p.valeur).toBe("2,4 / 10");
  });
});

describe("la péremption", () => {
  it("accepte une mesure récente", () => {
    expect(netlinkingEstFrais(new Date().toISOString())).toBe(true);
  });

  it("refuse une mesure plus vieille que le rafraîchissement de Common Crawl", () => {
    const vieux = new Date(Date.now() - (TTL_NETLINKING_JOURS + 1) * 24 * 3600 * 1000);
    expect(netlinkingEstFrais(vieux.toISOString())).toBe(false);
  });

  it("refuse une date absente ou illisible", () => {
    expect(netlinkingEstFrais(null)).toBe(false);
    expect(netlinkingEstFrais("bientôt")).toBe(false);
  });
});
