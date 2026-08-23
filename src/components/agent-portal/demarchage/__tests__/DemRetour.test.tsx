import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemRetour } from "../DemRetour";

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

/**
 * Le rattrapage de « Ma journée ». Ce qui est vérifié ici n'est pas le
 * mécanisme d'annulation — il est prouvé côté serveur et dans
 * `src/lib/prospection/__tests__/annulation.test.ts` — mais les trois formes
 * que prend le bloc à l'écran : absent, annulable, refusé AVEC son motif.
 */

const geste = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  geste: "terminer",
  faitLe: new Date().toISOString(),
  entreprise: "Maçonnerie Dubois",
  titre: "Message 1",
  resume: "la tâche revient dans la file",
  verdict: { possible: true, motif: "" },
  ...over,
});

const repond = (gestes: unknown[]) =>
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({ gestes }) });

beforeEach(() => authedFetch.mockReset());

describe("DemRetour — revenir en arrière depuis le poste de travail", () => {
  it("ne prend aucune place quand il n'y a rien à annuler", async () => {
    repond([]);
    const { container } = render(<DemRetour />);
    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("propose d'annuler un geste, quel que soit le prospect ouvert au centre", async () => {
    repond([geste()]);
    render(<DemRetour />);
    expect(await screen.findByText("Maçonnerie Dubois")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
  });

  it("relit l'écran d'à côté une fois le geste défait", async () => {
    repond([geste()]);
    const apres = jest.fn();
    render(<DemRetour apres={apres} />);
    fireEvent.click(await screen.findByRole("button", { name: /Annuler/ }));
    await waitFor(() => expect(apres).toHaveBeenCalled());
    expect(authedFetch).toHaveBeenCalledWith(
      "/api/agent/gestes",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // LE POINT DE LA FONCTIONNALITÉ : un refus qui ne dit pas pourquoi ne vaut
  // pas mieux que pas de bouton du tout.
  it("dit pourquoi c'est refusé plutôt que de griser un bouton muet", async () => {
    repond([
      geste({
        verdict: { possible: false, motif: "Un geste plus récent existe sur ce prospect : annule celui-là d’abord." },
      }),
    ]);
    render(<DemRetour />);
    expect(await screen.findByText(/annule celui-là d’abord/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });
});
