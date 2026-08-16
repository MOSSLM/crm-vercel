import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemSearch } from "../DemSearch";
import { useRechercheEntreprises } from "@/hooks/useRechercheEntreprises";
import type { CompanySearchResult } from "@/lib/entreprises/colonnes";

jest.mock("@/hooks/useRechercheEntreprises", () => ({ useRechercheEntreprises: jest.fn() }));

/**
 * Retrouver une entreprise QUAND ELLE RAPPELLE.
 *
 * Ce qui est vérifié ici est ce qui manquait : l'écran ne savait afficher
 * qu'une entreprise ayant une tâche en file, alors que celle qui rappelle est
 * exactement celle qu'on n'avait pas prévu d'appeler. Et tout doit se faire au
 * clavier — on cherche pendant que ça sonne, pas après.
 */

const fiche = (over: Partial<CompanySearchResult> & { id: number }): CompanySearchResult => ({
  name: `Fiche ${over.id}`,
  canonical_url: null,
  site_web_canonique: null,
  ville: "Annecy",
  code_postal: "74000",
  telephone: null,
  email: null,
  qualifie: false,
  logo_url: null,
  ...over,
});

const TOITURE = fiche({ id: 1, name: "Toiture Martin", telephone: "+33 6 12 34 56 78", qualifie: true });
const MACON = fiche({ id: 2, name: "Maçonnerie Dubois", ville: "Rumilly", telephone: "0450112233" });

/**
 * Le vrai crochet garde ses résultats dans un état : la même requête rend le
 * MÊME tableau d'un rendu à l'autre. On l'imite, sinon chaque rendu produirait
 * une nouvelle identité et la sélection au clavier se remettrait à zéro toute
 * seule — un faux échec qui ne dirait rien du composant.
 */
const CACHE = new Map<string, CompanySearchResult[]>();
function reponses(q: string): CompanySearchResult[] {
  const terme = q.trim().toLowerCase();
  if (!terme) return [];
  const chiffres = terme.replace(/\D/g, "");
  const cle = terme;
  const deja = CACHE.get(cle);
  if (deja) return deja;
  const trouvees = [TOITURE, MACON].filter((e) =>
    chiffres.length >= 4
      ? (e.telephone ?? "").replace(/\D/g, "").includes(chiffres)
      : (e.name ?? "").toLowerCase().includes(terme) || (e.ville ?? "").toLowerCase().includes(terme),
  );
  CACHE.set(cle, trouvees);
  return trouvees;
}

const mockCrochet = useRechercheEntreprises as jest.MockedFunction<typeof useRechercheEntreprises>;

beforeEach(() => {
  CACHE.clear();
  mockCrochet.mockImplementation((requete: string) => ({
    resultats: reponses(requete),
    chargement: false,
  }));
});

function ouvrir(props: Partial<React.ComponentProps<typeof DemSearch>> = {}) {
  const onChoisir = jest.fn();
  const onFermer = jest.fn();
  const vue = render(
    <DemSearch ouvert onFermer={onFermer} onChoisir={onChoisir} {...props} />,
  );
  const champ = screen.getByLabelText("Nom, ville ou numéro de téléphone");
  return {
    ...vue,
    onChoisir,
    onFermer,
    champ,
    taper: (v: string) => fireEvent.change(champ, { target: { value: v } }),
    touche: (key: string) => fireEvent.keyDown(champ, { key }),
    lignes: () => screen.queryAllByRole("option"),
  };
}

describe("DemSearch — la recherche de celui qui rappelle", () => {
  it("ne rend rien tant qu'on ne l'ouvre pas", () => {
    const { container } = render(
      <DemSearch ouvert={false} onFermer={jest.fn()} onChoisir={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("retrouve une fiche par les chiffres du numéro affiché", () => {
    // Le numéro est souvent la SEULE chose qu'on ait : la route compare les
    // chiffres seuls, « 1234 » doit donc retrouver « +33 6 12 34 56 78 ».
    const { taper, lignes } = ouvrir();
    taper("1234");
    expect(lignes()).toHaveLength(1);
    expect(screen.getByText("Toiture Martin")).toBeInTheDocument();
  });

  it("prend le premier résultat sur Entrée", () => {
    const { taper, touche, onChoisir } = ouvrir();
    taper("Toiture");
    touche("Enter");
    expect(onChoisir).toHaveBeenCalledWith(TOITURE);
  });

  it("laisse les flèches choisir une autre ligne avant de valider", () => {
    const { taper, touche, onChoisir, lignes } = ouvrir();
    taper("a"); // « a » retient les deux : la sélection doit pouvoir descendre
    expect(lignes()).toHaveLength(2);
    touche("ArrowDown");
    expect(lignes()[1]).toHaveAttribute("aria-selected", "true");
    touche("Enter");
    expect(onChoisir).toHaveBeenCalledWith(MACON);
  });

  it("revient à la file sur Échap, sans rien choisir", () => {
    const { taper, touche, onFermer, onChoisir } = ouvrir();
    taper("Toiture");
    touche("Escape");
    expect(onFermer).toHaveBeenCalled();
    expect(onChoisir).not.toHaveBeenCalled();
  });

  it("dit quoi faire quand elle ne trouve rien, au lieu de rester muette", () => {
    const { taper } = ouvrir();
    taper("zzzz");
    expect(screen.getByText(/Rien pour « zzzz »/)).toBeInTheDocument();
    // La consigne exacte : le numéro se cherche en chiffres seuls.
    expect(screen.getByText(/derniers chiffres, sans indicatif/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entreprises" })).toHaveAttribute(
      "href",
      "/espace-agent/entreprises",
    );
  });

  it("annonce si on va atterrir sur sa tâche du jour ou sur sa seule fiche", () => {
    const { taper } = ouvrir({ estEnFile: (id) => id === TOITURE.id });
    taper("a");
    const [premiere, seconde] = screen.getAllByRole("option");
    expect(premiere).toHaveTextContent("en file");
    expect(seconde).toHaveTextContent("fiche");
  });

  it("choisit aussi à la souris, pour ceux qui ne retiennent pas les raccourcis", () => {
    const { taper, onChoisir } = ouvrir();
    taper("Toiture");
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onChoisir).toHaveBeenCalledWith(TOITURE);
  });
});
