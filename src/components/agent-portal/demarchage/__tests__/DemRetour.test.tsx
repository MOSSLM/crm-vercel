import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemRetour } from "../DemRetour";

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

/**
 * Le rattrapage de « Ma journée ». Ce qui est vérifié ici n'est pas le
 * mécanisme d'annulation — il est prouvé côté serveur et dans
 * `src/lib/prospection/__tests__/annulation.test.ts` — mais les formes que
 * prend le bloc à l'écran : absent, replié, annulable, refusé AVEC son motif.
 *
 * LE REPLI EST LA FONCTIONNALITÉ, PAS UN DÉTAIL D'HABILLAGE. Déplié, ce bloc
 * poussait la carte de message de près de 250 px vers le bas : on arrivait sur
 * l'écran d'envoi et on voyait d'abord la liste de ce qu'on regrette. Un test
 * tient donc le fait qu'aucun geste n'est listé tant qu'on n'a pas ouvert.
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
  /** La flèche du coin : c'est elle qui ouvre la liste. */
  const flechee = () => screen.findByRole("button", { name: "Revenir en arrière" });

  it("ne prend aucune place quand il n'y a rien à annuler", async () => {
    repond([]);
    const { container } = render(<DemRetour />);
    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  // LE POINT DE LA VERSION REPLIÉE : ce qu'on vient faire sur cet écran est
  // d'envoyer un message, pas de relire ses regrets. Le nombre suffit à dire
  // qu'il y a quelque chose à rattraper.
  it("ne montre qu'une flèche et un compteur tant qu'on ne l'ouvre pas", async () => {
    repond([geste(), geste({ id: "g2", entreprise: "Plomberie Roux" })]);
    render(<DemRetour />);
    expect(await flechee()).toHaveTextContent("2");
    expect(screen.queryByText("Maçonnerie Dubois")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it("propose d'annuler un geste, quel que soit le prospect ouvert au centre", async () => {
    repond([geste()]);
    render(<DemRetour />);
    fireEvent.click(await flechee());
    expect(await screen.findByText("Maçonnerie Dubois")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
  });

  it("relit l'écran d'à côté une fois le geste défait", async () => {
    repond([geste()]);
    const apres = jest.fn();
    render(<DemRetour apres={apres} />);
    fireEvent.click(await flechee());
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
    fireEvent.click(await flechee());
    expect(await screen.findByText(/annule celui-là d’abord/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });
});
