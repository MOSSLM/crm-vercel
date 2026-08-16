import { render, screen } from "@testing-library/react";
import EntonnoirEtages from "../EntonnoirEtages";
import EntonnoirParAge from "../EntonnoirParAge";
import { construireEntonnoir, lectureParAge, type CleEtage, type FaitsEntreprise } from "@/lib/entonnoir/etages";

/**
 * L'écran doit dire ce que la mesure dit — y compris quand elle ne dit rien.
 * Ces trois vérifications tiennent la promesse la plus fragile de l'entonnoir :
 * une source muette ne doit JAMAIS s'afficher comme un zéro.
 */

const MAINTENANT = new Date("2026-08-26T09:00:00Z");

let id = 1;
const fait = (
  cohorte: FaitsEntreprise["cohorte"],
  premiereTouche: string | null,
  atteints: Array<[CleEtage, string | null]> = [],
): FaitsEntreprise => ({
  id: id++,
  nom: null,
  cohorte,
  premiereTouche,
  atteints: new Map(atteints),
  sortie: null,
});

const POPULATION: FaitsEntreprise[] = [
  fait("A_site_faible", "2026-08-17T09:00:00Z", [
    ["touchee", "2026-08-17T09:00:00Z"],
    ["repondu", "2026-08-18T09:00:00Z"],
  ]),
  fait("A_site_faible", "2026-08-17T09:00:00Z", [["touchee", "2026-08-17T09:00:00Z"]]),
  fait("B_sans_site", "2026-08-20T09:00:00Z", [["touchee", "2026-08-20T09:00:00Z"]]),
  fait("B_sans_site", null),
];

describe("EntonnoirEtages", () => {
  it("affiche la perte de chaque étage", () => {
    render(<EntonnoirEtages etages={construireEntonnoir(POPULATION)} />);
    expect(screen.getByText("Ciblée")).toBeInTheDocument();
    expect(screen.getByText("point de départ")).toBeInTheDocument();
    // 4 ciblées → 3 touchées → 2 sans réponse : deux étages perdent une entreprise.
    expect(screen.getAllByText("−1")).toHaveLength(2);
  });

  it("dit « non mesuré » au lieu d'afficher zéro quand la source se tait", () => {
    const etages = construireEntonnoir(POPULATION, { document_ouvert: "GA4 n'a pas répondu" });
    render(<EntonnoirEtages etages={etages} />);
    expect(screen.getByText(/Non mesuré — GA4 n'a pas répondu/)).toBeInTheDocument();
  });
});

describe("EntonnoirParAge", () => {
  it("aligne les deux cohortes au même âge et chiffre l'écart", () => {
    render(
      <EntonnoirParAge
        parAge={lectureParAge(POPULATION, { maintenant: MAINTENANT })}
        nonDatees={{}}
      />,
    );
    expect(screen.getByText("J+3")).toBeInTheDocument();
    // À J+1 comme à J+3, A a une réponse sur deux éligibles et B aucune : 50
    // points d'écart en faveur de A, donc « −50 pt » sur la ligne Δ B−A.
    expect(screen.getAllByText(/^.?50 pt$/).length).toBeGreaterThan(0);
  });
});
