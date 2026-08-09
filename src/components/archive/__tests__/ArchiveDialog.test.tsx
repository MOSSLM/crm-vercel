import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ArchiveDialog, type ArchiveTarget } from "../ArchiveDialog";

const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({
  authedFetch: (...a: unknown[]) => authedFetch(...a),
}));

const target = (over: Partial<ArchiveTarget> = {}): ArchiveTarget => ({
  kind: "entreprise",
  opportunityIds: [],
  entrepriseIds: [42],
  label: "Menuiserie Durand",
  ...over,
});

const okResponse = (payload: unknown = { ok: true }) => ({
  ok: true,
  json: async () => payload,
});

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

beforeEach(() => {
  toastError.mockClear();
  toastSuccess.mockClear();
  authedFetch.mockReset().mockResolvedValue(okResponse());
});

/**
 * Radix Select s'appuie sur des API que jsdom n'implémente pas (capture de
 * pointeur, ResizeObserver, scrollIntoView). Sans ces prothèses le menu ne
 * s'ouvre jamais et aucun motif n'est sélectionnable.
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn(() => false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const chooseReason = async (value: string) => {
  // Le clavier plutôt que la souris : `pointerdown` passe par PointerEvent, que
  // jsdom n'implémente pas.
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: value });
  fireEvent.click(option);
};

describe("ArchiveDialog", () => {
  it("refuse d’archiver sans motif", () => {
    render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={jest.fn()} onDone={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

    expect(toastError).toHaveBeenCalledWith("Choisissez un motif.");
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("prévient que les opportunités suivent, et que les envois sont coupés", () => {
    render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={jest.fn()} onDone={jest.fn()} />);

    expect(screen.getByText(/Son opportunité sera archivée avec elle/)).toBeInTheDocument();
    expect(screen.getByText(/emails encore planifiés seront annulés/)).toBeInTheDocument();
  });

  it("n’annonce pas la cascade quand on n’archive qu’une opportunité", () => {
    render(
      <ArchiveDialog
        target={target({ kind: "opportunite", entrepriseIds: [], opportunityIds: ["o1"] })}
        apiBase="/api/archive"
        onClose={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Son opportunité sera archivée avec elle/)).not.toBeInTheDocument();
  });

  it("poste le motif choisi et prévient le parent", async () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={onClose} onDone={onDone} />);

    await chooseReason("Pas de budget");
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "  rappelé 3 fois  " } });
    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(authedFetch.mock.calls[0][0]).toBe("/api/archive");
    expect(bodyOf(authedFetch.mock.calls[0])).toEqual({
      action: "archive",
      opportunity_ids: [],
      entreprise_ids: [42],
      reason: "pas_de_budget",
      note: "rappelé 3 fois",
    });
    expect(onClose).toHaveBeenCalled();
  });

  describe("motif « refait par un concurrent »", () => {
    it("ne demande l’URL que pour ce motif", async () => {
      render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={jest.fn()} onDone={jest.fn()} />);

      expect(screen.queryByLabelText("Site du concurrent")).not.toBeInTheDocument();
      await chooseReason("A refait son site avec un concurrent");
      expect(screen.getByLabelText("Site du concurrent")).toBeInTheDocument();
    });

    // `canonicalizeDomain` ne valide rien : sans ce contrôle le registre se
    // remplirait de saisies libres.
    it("refuse une saisie qui n’est pas un domaine", async () => {
      render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={jest.fn()} onDone={jest.fn()} />);

      await chooseReason("A refait son site avec un concurrent");
      fireEvent.change(screen.getByLabelText("Site du concurrent"), {
        target: { value: "je sais plus" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("adresse du site"));
      expect(authedFetch).not.toHaveBeenCalled();
    });

    it("transmet l’URL et annonce le concurrent enregistré", async () => {
      authedFetch.mockResolvedValue(okResponse({ ok: true, concurrent: { domaine: "agence-web.fr" } }));
      render(<ArchiveDialog target={target()} apiBase="/api/archive" onClose={jest.fn()} onDone={jest.fn()} />);

      await chooseReason("A refait son site avec un concurrent");
      fireEvent.change(screen.getByLabelText("Site du concurrent"), {
        target: { value: "https://www.Agence-Web.fr" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

      await waitFor(() => expect(authedFetch).toHaveBeenCalled());
      expect(bodyOf(authedFetch.mock.calls[0])).toMatchObject({
        reason: "refait_par_concurrent",
        concurrent_url: "https://www.Agence-Web.fr",
      });
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("agence-web.fr"));
    });
  });

  describe("mode désarchivage", () => {
    it("rappelle le motif d’origine et poste l’action inverse", async () => {
      const onDone = jest.fn();
      render(
        <ArchiveDialog
          target={target({ currentReason: "pas_de_budget", currentNote: "rappelé 3 fois" })}
          apiBase="/api/agent/archive"
          onClose={jest.fn()}
          onDone={onDone}
        />,
      );

      expect(screen.getByText("Pas de budget")).toBeInTheDocument();
      expect(screen.getByText(/rappelé 3 fois/)).toBeInTheDocument();
      // Pas de formulaire : rien à ressaisir pour remettre la fiche en piste.
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Désarchiver" }));

      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(bodyOf(authedFetch.mock.calls[0])).toEqual({
        action: "unarchive",
        opportunity_ids: [],
        entreprise_ids: [42],
      });
    });
  });

  it("remonte l’erreur de l’API sans fermer le dialogue", async () => {
    const onClose = jest.fn();
    authedFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "entreprise_non_attribuee" }) });
    render(<ArchiveDialog target={target()} apiBase="/api/agent/archive" onClose={onClose} onDone={jest.fn()} />);

    await chooseReason("Hors cible");
    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("entreprise_non_attribuee"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
