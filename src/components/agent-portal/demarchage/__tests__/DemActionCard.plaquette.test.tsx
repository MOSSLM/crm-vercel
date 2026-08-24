import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchageTask } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * « Je ne veux pas que la plaquette soit envoyée en lien […] je veux qu'elle
 * soit envoyée en PDF et que le téléchargement soit fait au clic sur le bouton
 * d'envoi. »
 *
 * Deux choses se vérifient ici, et l'ORDRE en est une : la feuille part avant
 * WhatsApp, sinon la boîte d'impression vole le focus à la conversation au
 * moment précis où l'agent va coller son message.
 */

const PLAQUETTE = "https://app.samadigitalstudio.fr/plaquette/abc123";

function task(payload: DemarchageTask["payload"]): DemarchageTask {
  return {
    id: "t1",
    kind: "whatsapp",
    status: "pending",
    title: "Plaquette",
    due_at: "2026-08-23T09:00:00.000Z",
    contact_id: "c1",
    entreprise_id: 1,
    opportunite_id: "o1",
    automation_id: "a1",
    enrollment_id: "e1",
    step_id: "plqWa",
    payload,
    contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
    entreprise: { id: 1, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
    sequence: { name: "S2 — Après la démo", stepLabel: "Plaquette", stepIndex: 2, totalSteps: 10, steps: [] },
    intent: null,
  };
}

const renderCard = (payload: DemarchageTask["payload"]) =>
  render(
    <DemActionCard
      task={task(payload)}
      company={null}
      audit={null}
      busy={false}
      onPatch={jest.fn()}
      onLogged={jest.fn()}
      onNext={jest.fn()}
      onReplied={jest.fn()}
      onRetire={jest.fn()}
    />,
  );

const AVEC = { message: "Bonjour Julien,\n\nJe vous joins notre plaquette.", plaquette_url: PLAQUETTE };
const SANS = { message: "Bonjour Julien, je suis bien chez Toiture Martin ?" };

describe("DemActionCard — la plaquette en pièce jointe", () => {
  let ouvertures: string[];
  beforeEach(() => {
    ouvertures = [];
    window.open = jest.fn((url?: string | URL) => {
      ouvertures.push(String(url));
      return null;
    }) as typeof window.open;
  });

  it("ouvre la feuille A4 imprimable AVANT WhatsApp", () => {
    renderCard(AVEC);
    fireEvent.click(screen.getByRole("button", { name: /Envoyer le WhatsApp/ }));
    expect(ouvertures).toHaveLength(2);
    expect(ouvertures[0]).toBe(`${PLAQUETTE}?a4&imprimer`);
    expect(ouvertures[1]).toContain("wa.me");
  });

  it("laisse rouvrir la plaquette seule, sans repasser par l'envoi", () => {
    renderCard(AVEC);
    fireEvent.click(screen.getByRole("button", { name: /Rouvrir la plaquette seule/ }));
    expect(ouvertures).toEqual([`${PLAQUETTE}?a4&imprimer`]);
  });

  it("dit ce qui va s'ouvrir, plutôt que de surprendre l'agent", () => {
    renderCard(AVEC);
    expect(screen.getByText(/Enregistrer en PDF/)).toBeInTheDocument();
    expect(screen.getByText(/ne contient aucun lien/)).toBeInTheDocument();
  });

  // Les six autres messages manuels de S1 et S2 ne joignent rien : un bouton
  // « plaquette » sur une accroche enverrait le mauvais document.
  it("ne montre rien sur une tâche qui ne joint pas de document", () => {
    renderCard(SANS);
    expect(screen.queryByRole("button", { name: /Rouvrir la plaquette/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer le WhatsApp/ }));
    expect(ouvertures).toHaveLength(1);
    expect(ouvertures[0]).toContain("wa.me");
  });
});
