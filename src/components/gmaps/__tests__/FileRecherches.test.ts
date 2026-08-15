/**
 * @jest-environment node
 */
import { choisirJobAffiche } from "../FileRecherches";
import type { JobEnFile } from "@/lib/gmaps/contract";

const job = (jobId: string, status: JobEnFile["status"], location = "Ville"): JobEnFile => ({
  jobId,
  status,
  location,
  businessTypes: ["plombier"],
  found: 0,
  inserted: 0,
  merged: 0,
  tilesDone: 0,
  tilesTotal: 0,
});

describe("choisirJobAffiche", () => {
  it("garde à l'écran la recherche en cours d'affichage tant qu'elle tourne", () => {
    const file = [job("a", "running"), job("b", "pending")];
    expect(choisirJobAffiche(file, null, "a")).toBe("a");
  });

  it("passe le témoin à la suivante quand celle qu'on regarde est terminée", () => {
    // C'est tout l'intérêt d'une file : sinon on resterait sur une carte figée
    // pendant que le robot travaille déjà sur la ville suivante.
    const file = [job("a", "done"), job("b", "running")];
    expect(choisirJobAffiche(file, null, "a")).toBe("b");
  });

  it("bascule aussi depuis une recherche en échec ou partielle", () => {
    expect(choisirJobAffiche([job("a", "error"), job("b", "running")], null, "a")).toBe("b");
    expect(choisirJobAffiche([job("a", "partial"), job("b", "running")], null, "a")).toBe("b");
  });

  it("respecte le choix de l'utilisateur, même sur une recherche terminée", () => {
    // Quelqu'un qui rouvre une recherche finie pour en relire les résultats ne
    // doit pas se la faire arracher au sondage suivant.
    const file = [job("a", "done"), job("b", "running")];
    expect(choisirJobAffiche(file, "a", "b")).toBe("a");
  });

  it("ignore un choix qui ne correspond plus à rien", () => {
    // Le service a redémarré : le job choisi n'existe plus côté scraper.
    const file = [job("b", "running")];
    expect(choisirJobAffiche(file, "disparu", null)).toBe("b");
  });

  it("ne vide pas l'écran quand plus rien ne tourne", () => {
    // Le moment précis où l'utilisateur vient lire ses résultats est le pire
    // pour effacer la carte.
    const file = [job("a", "done")];
    expect(choisirJobAffiche(file, null, "a")).toBe("a");
  });

  it("rend null sur une file vide sans rien à afficher", () => {
    expect(choisirJobAffiche([], null, null)).toBeNull();
  });
});
