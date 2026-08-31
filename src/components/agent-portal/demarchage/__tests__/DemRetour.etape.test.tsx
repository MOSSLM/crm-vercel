import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemRetour } from "../DemRetour";

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

/**
 * « Ce prospect est à l'étape 6 sur 22 et je ne lui ai jamais écrit. »
 *
 * CE QUE CE TEST PROTÈGE. Le bloc n'annulait qu'un geste — le dernier, ou l'un
 * des cinq derniers. Remonter cinq étapes demandait cinq annulations dans le
 * bon ordre, et seulement si les gestes y figuraient encore : au 31/08/2026,
 * 224 inscriptions S1 étaient à l'étape 9 et 151 à l'étape 15 sans qu'aucune ne
 * puisse redescendre.
 *
 * TROIS CHOSES SE VÉRIFIENT ICI, et la première est celle qui a été demandée :
 * les étapes proposées sont les VRAIES étapes de sa séquence, telles que le
 * serveur les rend depuis la définition de l'automatisation — jamais une liste
 * reconstruite côté écran, qui ne compterait pas les étapes de la même façon et
 * reposerait le prospect ailleurs que là où l'agent croit le poser.
 *
 * La deuxième est la séquence QUITTÉE : boucler la dernière étape de S1 fait
 * entrer en S2, et c'est là qu'on s'aperçoit que rien n'est parti. Si le bloc
 * ne proposait que la séquence en cours, il n'offrirait que S2 — c'est-à-dire
 * précisément la mauvaise.
 *
 * La troisième : le bloc reste debout quand il n'y a aucun geste à annuler.
 * Il s'effaçait alors entièrement, c'est-à-dire exactement au moment où l'on
 * cherche à revenir sur une étape franchie il y a trois jours.
 */

const CIBLES = [
  {
    enrollment_id: "s2",
    sequence: "S2 — Après la démo",
    statut: "active",
    etape_courante: 1,
    courante: true,
    steps: [{ index: 0, label: "Plaquette", kind: "whatsapp", day: 0 }],
  },
  {
    enrollment_id: "s1",
    sequence: "S1 — Premier contact",
    statut: "exited",
    etape_courante: 4,
    courante: false,
    steps: [
      { index: 0, label: "Accroche WhatsApp", kind: "whatsapp", day: 0 },
      { index: 2, label: "Relance", kind: "whatsapp", day: 3 },
      { index: 4, label: "Envoi de la démo", kind: "whatsapp", day: 6 },
    ],
  },
];

/** Le bloc fait deux appels : ses gestes, puis les cibles de retour. */
const repond = (gestes: unknown[], cibles: unknown[] = CIBLES) =>
  authedFetch.mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => (String(url).includes("/revenir") ? { cibles } : { gestes }),
    }),
  );

beforeEach(() => authedFetch.mockReset());

describe("reprendre la séquence à une étape", () => {
  it("propose les étapes que le serveur rend, numérotées comme la frise", async () => {
    repond([]);
    render(<DemRetour taskId="t1" />);

    fireEvent.click(await screen.findByRole("button", { name: /Reprendre la séquence/ }));

    expect(screen.getByRole("button", { name: /1\. Accroche WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3\. Relance/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /5\. Envoi de la démo/ })).toBeInTheDocument();
  });

  it("offre aussi la séquence quittée, en disant ce que ça referme", async () => {
    repond([]);
    render(<DemRetour taskId="t1" />);

    fireEvent.click(await screen.findByRole("button", { name: /Reprendre la séquence/ }));

    expect(screen.getByText(/S1 — Premier contact · quittée/)).toBeInTheDocument();
    expect(screen.getByText(/referme celle en cours/)).toBeInTheDocument();
  });

  it("replace le prospect sur l'étape choisie de SON inscription", async () => {
    repond([]);
    render(<DemRetour taskId="t1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Reprendre la séquence/ }));

    authedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, sequence: "S1 — Premier contact", etape: 1, fermees: ["S2 — Après la démo"] }),
    });
    fireEvent.click(screen.getByRole("button", { name: /1\. Accroche WhatsApp/ }));

    await waitFor(() => {
      const envoi = authedFetch.mock.calls.find(([, init]) => init?.method === "POST");
      expect(envoi).toBeDefined();
      expect(JSON.parse(envoi![1].body)).toEqual({
        task_id: "t1",
        enrollment_id: "s1",
        step_index: 0,
      });
    });
  });

  it("reste debout quand il n'y a aucun geste à annuler", async () => {
    // Le cas de figure exact : la tâche a été bouclée il y a trois jours, donc
    // plus rien dans le journal — mais l'étape, elle, est toujours franchie.
    repond([]);
    const { container } = render(<DemRetour taskId="t1" />);
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
    expect(screen.getByText(/Aucun geste récent à annuler/)).toBeInTheDocument();
  });

  it("s'efface quand le prospect n'a aucune étape derrière lui", async () => {
    repond([], [{ ...CIBLES[0], steps: [] }]);
    const { container } = render(<DemRetour taskId="t1" />);
    await waitFor(() => expect(authedFetch).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("ne demande rien au serveur hors d'une tâche ouverte", async () => {
    // Le bloc sert aussi quand l'écran montre une fiche hors file : sans tâche,
    // il n'y a pas de séquence à reprendre, et une requête sans cible serait un
    // appel pour rien à chaque rendu.
    repond([]);
    render(<DemRetour />);
    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    expect(authedFetch.mock.calls.every(([url]) => !String(url).includes("/revenir"))).toBe(true);
  });
});
