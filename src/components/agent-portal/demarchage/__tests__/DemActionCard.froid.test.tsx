import React from "react";
import { render, screen } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemCohorte, DemarchageTask } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * L'APPEL À FROID N'EST PAS UNE SÉQUENCE CASSÉE.
 *
 * La carte déduisait tout de la séquence — jusqu'à son message d'erreur, qui
 * envoyait « ajouter un texte à l'étape » à quelqu'un qui n'a pas d'étape. Cent
 * fois par jour pendant la campagne, c'est-à-dire tout le temps. Elle doit
 * afficher qu'il n'y a rien de préparé et que c'est normal, plus l'accroche de
 * la cohorte — ce qui change vraiment d'une entreprise à l'autre.
 */

function froid(over: Partial<DemarchageTask> = {}, cohorte: DemCohorte | null = null): DemarchageTask {
  return {
    id: "t1",
    kind: "call",
    status: "pending",
    title: null,
    due_at: "2026-08-18T09:00:00.000Z",
    contact_id: null,
    entreprise_id: 7,
    opportunite_id: null,
    automation_id: null,
    enrollment_id: null,
    step_id: null,
    payload: {},
    contact: null,
    entreprise: { id: 7, name: "Maçonnerie Dubois", ville: "Rumilly", telephone: "0450112233" },
    sequence: null,
    intent: null,
    hors_sequence: true,
    cohorte,
    ...over,
  };
}

const renderCard = (task: DemarchageTask) =>
  render(
    <DemActionCard
      task={task}
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

describe("DemActionCard — l'appel à froid", () => {
  it("ne réclame pas de corriger une séquence qui n'existe pas", () => {
    renderCard(froid());
    expect(screen.queryByText(/ajoute un texte à l'étape dans la séquence/)).toBeNull();
    expect(screen.getByText(/aucun texte préparé, c'est normal/)).toBeInTheDocument();
  });

  it("renvoie vers la trame générique, seule chose à lire en décrochant", () => {
    renderCard(froid());
    expect(screen.getByText(/trame générique et les\s+objections sont dans l'onglet à côté/)).toBeInTheDocument();
  });

  it("rappelle l'accroche de la cohorte — ce n'est pas le même appel", () => {
    renderCard(froid({}, "B_sans_site"));
    expect(screen.getByText(/Il n'a rien en ligne/)).toBeInTheDocument();
    renderCard(froid({ id: "t2" }, "A_site_faible"));
    expect(screen.getByText(/Il a déjà un site/)).toBeInTheDocument();
  });

  it("écrit « à froid » là où une séquence écrirait son étape", () => {
    const { container } = renderCard(froid());
    expect(container.querySelector(".dm-card-h .ti")?.textContent).toMatch(/à froid$/);
    expect(container.querySelector(".dm-card-h .su")?.textContent).toMatch(/Premier contact/);
  });

  it("garde l'avertissement de séquence pour une VRAIE étape sans script", () => {
    // Là, il y a bien quelque chose à corriger : une étape sans texte.
    renderCard(
      froid({
        hors_sequence: false,
        sequence: { name: "Artisans", stepLabel: "Appel J+2", stepIndex: 2, totalSteps: 5, steps: [] },
      }),
    );
    expect(screen.getByText(/ajoute un texte à l'étape dans la séquence/)).toBeInTheDocument();
  });

  it("dit qu'un message à froid n'a aucun modèle, plutôt que d'afficher un champ vide sans explication", () => {
    renderCard(froid({ kind: "whatsapp" }, "A_site_faible"));
    expect(screen.getByText(/aucun modèle préparé/)).toBeInTheDocument();
  });
});
