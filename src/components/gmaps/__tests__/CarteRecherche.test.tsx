import { render, screen } from "@testing-library/react";
import { CarteRecherche } from "../CarteRecherche";
import { SuiviRecherche } from "../SuiviRecherche";
import { GrilleSchema, JobStatusSchema } from "@/lib/gmaps/contract";

/**
 * jsdom ne met rien en page : ni ResizeObserver, ni fetch. Le composant traite
 * déjà les deux comme du confort (taille par défaut, fond de carte optionnel),
 * ce test vérifie donc la seule chose qui compte vraiment sans navigateur : la
 * GÉOMÉTRIE. Une inversion rangée/colonne ne lèverait aucune erreur et ferait
 * simplement balayer la progression dans le mauvais sens à l'écran.
 */
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  global.fetch = jest.fn(() => Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
});

const GRILLE = GrilleSchema.parse({
  latitudes: [45.93, 45.88, 45.83],
  longitudes: [1.15, 1.2, 1.25],
  rangees: 2,
  colonnes: 2,
  total: 4,
  tileStep: 0.05,
  source: "openstreetmap",
});

/** Coin supérieur gauche du polygone d'une tuile, dans le repère de l'écran. */
function coinDeTuile(conteneur: HTMLElement, index: number) {
  const polygones = conteneur.querySelectorAll("polygon.rlive-tuile");
  const points = polygones[index - 1].getAttribute("points") ?? "";
  const [x, y] = points.split(" ")[0].split(",").map(Number);
  return { x, y };
}

describe("CarteRecherche", () => {
  const rendre = (props: Partial<React.ComponentProps<typeof CarteRecherche>> = {}) =>
    render(
      <CarteRecherche
        grille={GRILLE}
        tuiles={[3, 0, null, null]}
        tuileEnCours={3}
        points={[
          { nom: "Plomberie A", lat: 45.91, lng: 1.17, nouveau: true, tuile: 1 },
          { nom: "Plomberie B", lat: 45.85, lng: 1.23, nouveau: false, tuile: 4 },
        ]}
        enCours
        mode="taches"
        {...props}
      />,
    );

  it("dessine exactement une tuile par tuile annoncée", () => {
    const { container } = rendre();
    expect(container.querySelectorAll("polygon.rlive-tuile")).toHaveLength(GRILLE.total);
  });

  it("distingue explorée-avec-trouvailles, explorée-vide, en cours et pas encore vue", () => {
    const { container } = rendre();
    const etats = [...container.querySelectorAll("polygon.rlive-tuile")].map((n) =>
      n.getAttribute("data-etat"),
    );
    // tuiles[] = [3, 0, null, null] et la tuile 3 est celle qu'on lit à l'instant.
    expect(etats).toEqual(["trouve", "vide", "encours", "attente"]);
  });

  it("ne signale plus de tuile en cours une fois le crawl terminé", () => {
    const { container } = rendre({ enCours: false });
    const etats = [...container.querySelectorAll("polygon.rlive-tuile")].map((n) =>
      n.getAttribute("data-etat"),
    );
    expect(etats).not.toContain("encours");
  });

  it("étale réellement la grille sur la scène, sans l'effondrer en un point", () => {
    // Régression mesurée : `fitExtent` sur un objet `Polygon` effondre la
    // projection conique (échelle 0,004 au lieu de 231 524) et les quatre coins
    // de chaque tuile se superposent — une carte vide, sans la moindre erreur.
    const { container } = rendre();
    const sommets = (container.querySelector("polygon.rlive-tuile")!.getAttribute("points") ?? "")
      .split(" ")
      .map((s) => s.split(",").map(Number));
    const largeur = Math.max(...sommets.map((p) => p[0])) - Math.min(...sommets.map((p) => p[0]));
    expect(largeur).toBeGreaterThan(20);
  });

  it("place la tuile 1 au nord-ouest et la tuile 4 au sud-est", () => {
    // LE test qui compte : le crawler numérote ses tuiles par rangées, du nord
    // au sud puis d'ouest en est. À l'écran, l'axe Y descend vers le sud.
    const { container } = rendre();
    const t1 = coinDeTuile(container, 1);
    const t2 = coinDeTuile(container, 2);
    const t3 = coinDeTuile(container, 3);
    const t4 = coinDeTuile(container, 4);
    expect(t2.x).toBeGreaterThan(t1.x); // 2 est à l'est de 1
    expect(t3.y).toBeGreaterThan(t1.y); // 3 est au sud de 1
    expect(t4.x).toBeGreaterThan(t3.x);
    expect(t4.y).toBeGreaterThan(t2.y);
  });

  it("trace la silhouette de la commune sans faire exploser le chemin SVG", () => {
    // Régression mesurée : avec le ré-échantillonnage adaptatif de d3 laissé par
    // défaut, le contour de Limoges (457 sommets) produisait 4,16 Mo de chemin
    // au lieu de 7,4 Ko — la page devenait injouable, sans la moindre erreur.
    const carre = {
      type: "Polygon" as const,
      coordinates: [
        [
          [1.16, 45.92],
          [1.24, 45.92],
          [1.24, 45.84],
          [1.16, 45.84],
          [1.16, 45.92],
        ],
      ],
    };
    const { container } = rendre({ contour: carre });
    const trace = container.querySelector("path.rlive-commune");
    expect(trace).not.toBeNull();
    // Cinq sommets : quelques dizaines d'octets. Un millier signalerait que le
    // ré-échantillonnage est revenu.
    expect((trace!.getAttribute("d") ?? "").length).toBeLessThan(1000);
  });

  it("s'affiche normalement quand aucune silhouette n'est disponible", () => {
    // Repli `communes_fr`, ou lieu sans frontière connue d'OpenStreetMap.
    const { container } = rendre({ contour: null });
    expect(container.querySelector("path.rlive-commune")).toBeNull();
    expect(container.querySelectorAll("polygon.rlive-tuile")).toHaveLength(GRILLE.total);
  });

  it("pose une pastille par entreprise, et une tache seulement en mode « taches »", () => {
    const { container } = rendre();
    expect(container.querySelectorAll("circle.carte-dot")).toHaveLength(2);
    expect(container.querySelectorAll("circle.carte-blob")).toHaveLength(2);

    const { container: sansTaches } = rendre({ mode: "points" });
    expect(sansTaches.querySelectorAll("circle.carte-dot")).toHaveLength(2);
    expect(sansTaches.querySelectorAll("circle.carte-blob")).toHaveLength(0);
  });

  it("distingue à la couleur une fiche nouvelle d'une fiche déjà connue", () => {
    const { container } = rendre();
    const couleurs = [...container.querySelectorAll("circle.carte-dot")].map((n) =>
      n.getAttribute("fill"),
    );
    expect(new Set(couleurs).size).toBe(2);
  });
});

describe("SuiviRecherche", () => {
  const statut = (extra: Record<string, unknown> = {}) =>
    JobStatusSchema.parse({
      jobId: "job-1",
      status: "running",
      found: 12,
      inserted: 9,
      merged: 3,
      saved: 9,
      pages: 0,
      tilesDone: 3,
      tilesTotal: 12,
      rechercheIds: {},
      error: null,
      metadata: {},
      ...extra,
    });

  it("affiche la fraction de tuiles pendant le crawl, et non à la fin", () => {
    render(
      <SuiviRecherche
        motCle="plombier"
        lieu="Limoges, France"
        status="running"
        stats={statut({ grille: GRILLE, tuiles: [1, null, null, null] })}
        points={[]}
      />,
    );
    // On vise la fraction, pas n'importe quel « 3 » de la page : le compteur des
    // fiches déjà connues en affiche un autre.
    expect(document.querySelector(".rlive-frac")).toHaveTextContent("tuile 3 / 12");
    expect(screen.getByText("plombier")).toBeInTheDocument();
    expect(screen.getByText("Limoges, France")).toBeInTheDocument();
  });

  it("montre une jauge indéterminée tant que la grille n'est pas annoncée", () => {
    // Le scraper a longtemps publié `tuiles_total = 0` : une barre pleine dès la
    // première seconde annonçait une recherche déjà finie.
    const { container } = render(
      <SuiviRecherche
        motCle="plombier"
        lieu="Limoges"
        status="running"
        stats={statut({ tilesTotal: 0, tilesDone: 0 })}
        points={[]}
      />,
    );
    expect(container.querySelector('.rlive-jauge[data-indetermine="true"]')).not.toBeNull();
    expect(screen.getByText(/calcul de la zone/)).toBeInTheDocument();
  });

  it("n'affiche le compteur de pages Google que s'il a servi", () => {
    const { rerender } = render(
      <SuiviRecherche motCle="p" lieu="L" status="running" stats={statut()} points={[]} />,
    );
    expect(screen.queryByText("Pages Google")).toBeNull();
    rerender(
      <SuiviRecherche motCle="p" lieu="L" status="running" stats={statut({ pages: 4 })} points={[]} />,
    );
    expect(screen.getByText("Pages Google")).toBeInTheDocument();
  });
});
