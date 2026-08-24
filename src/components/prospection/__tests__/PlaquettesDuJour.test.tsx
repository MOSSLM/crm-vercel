import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlaquettesDuJour } from "../PlaquettesDuJour";

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));

/**
 * La chaîne d'envoi. Ce qui se vérifie ici n'est pas la mise en page mais les
 * trois règles qui décident si la passe est utilisable :
 *   · elle SAUTE ce qui n'est pas prêt (pas de PDF, pas de numéro) plutôt que
 *     d'ouvrir une conversation vide ;
 *   · elle n'ouvre qu'UNE fenêtre et la renavigue — un `window.open` par
 *     prospect serait coupé par le bloqueur dès le deuxième ;
 *   · elle ne masque jamais un prospect écarté : il reste dans la liste, avec
 *     sa raison.
 */

const plaquette = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  entreprise: "Toiture Martin",
  ville: "Annecy",
  prenom: "Julien",
  tel: "+33646042876",
  message: "Bonjour Julien,",
  whatsapp: "https://wa.me/33646042876?text=Bonjour",
  pdf: "https://stockage/signe/1",
  pdfNom: "toiture-martin-2026-08-23.pdf",
  pdfLe: "2026-08-23T20:00:00Z",
  reportee: false,
  dueAt: "2026-08-23T07:00:00Z",
  ...over,
});

const repond = (plaquettes: unknown[]) =>
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({ plaquettes }) });

beforeEach(() => {
  authedFetch.mockReset();
  jest.useRealTimers();
});

describe("PlaquettesDuJour — la chaîne d'envoi", () => {
  it("compte ce qui est réellement prêt, pas ce qui est en file", async () => {
    repond([
      plaquette(),
      plaquette({ id: "t2", entreprise: "Sans PDF", pdf: null }),
      plaquette({ id: "t3", entreprise: "Sans numéro", whatsapp: null, tel: null }),
    ]);
    render(<PlaquettesDuJour />);
    expect(await screen.findByText(/1 plaquette\(s\) prête\(s\)/)).toBeInTheDocument();
  });

  // Un prospect écarté qu'on masquerait disparaîtrait sans que personne ne sache
  // pourquoi — alors que la cause est connue et se corrige.
  it("garde dans la liste ce qu'elle saute, en disant pourquoi", async () => {
    repond([plaquette({ id: "t2", entreprise: "Sans PDF", pdf: null })]);
    render(<PlaquettesDuJour />);
    expect(await screen.findByText("Sans PDF")).toBeInTheDocument();
    expect(screen.getByText("à fabriquer")).toBeInTheDocument();
    expect(screen.getByText(/1 plaquette\(s\) sans PDF/)).toBeInTheDocument();
  });

  it("n'ouvre qu'une fenêtre et la renavigue, plutôt que d'en ouvrir une par prospect", async () => {
    repond([plaquette(), plaquette({ id: "t2", whatsapp: "https://wa.me/33600000002?text=B" })]);
    const faussefenetre = { location: { href: "" }, closed: false };
    const open = jest.fn(() => faussefenetre as unknown as Window);
    window.open = open as typeof window.open;

    render(<PlaquettesDuJour />);
    fireEvent.click(await screen.findByRole("button", { name: /Préparer les 2 conversations/ }));

    await waitFor(() => expect(faussefenetre.location.href).toBe("https://wa.me/33600000002?text=B"), {
      timeout: 8000,
    });
    // UNE seule ouverture pour deux prospects : la seconde est une renavigation.
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://wa.me/33646042876?text=Bonjour", "sama-plaquettes");
  }, 15000);

  it("ne prétend pas qu'il y a du travail quand la file est vide", async () => {
    repond([]);
    render(<PlaquettesDuJour />);
    expect(await screen.findByText("Aucune plaquette à envoyer")).toBeInTheDocument();
  });

  it("marque une plaquette envoyée sans recharger toute la file", async () => {
    repond([plaquette()]);
    render(<PlaquettesDuJour />);
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    fireEvent.click(await screen.findByRole("button", { name: /Envoyée/ }));
    expect(await screen.findByText("envoyée")).toBeInTheDocument();
    expect(authedFetch).toHaveBeenCalledWith(
      "/api/agent/tasks",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
