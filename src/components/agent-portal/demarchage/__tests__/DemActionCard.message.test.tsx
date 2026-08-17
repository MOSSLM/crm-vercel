import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchagePatchBody, DemarchageTask } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * La carte message ne propose plus la bibliothèque entière de modèles, mais les
 * DEUX versions du modèle de l'étape — le geste de la carte WhatsApp du
 * pipeline commercial. Et « Fait » suffit à boucler l'action : cocher une issue
 * reste possible, ce n'est plus un péage.
 */

const V_ENTREPRISE = "Bonjour, je suis bien chez Toiture Martin ?";
const V_CONTACT = "Bonjour Julien, je suis bien chez Toiture Martin ?";

function messageTask(payload: DemarchageTask["payload"], kind: DemarchageTask["kind"] = "whatsapp"): DemarchageTask {
  return {
    id: "t1",
    kind,
    status: "pending",
    title: "Premier contact",
    due_at: "2026-08-13T09:00:00.000Z",
    contact_id: "c1",
    entreprise_id: 1,
    opportunite_id: "o1",
    automation_id: "a1",
    enrollment_id: "e1",
    step_id: "s1",
    payload,
    contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
    entreprise: { id: 1, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
    sequence: { name: "Démarchage artisans", stepLabel: "WhatsApp J+0", stepIndex: 1, totalSteps: 5, steps: [] },
    intent: null,
  };
}

function renderCard(
  payload: DemarchageTask["payload"],
  over: { kind?: DemarchageTask["kind"]; onPatch?: (b: Omit<DemarchagePatchBody, "id">) => void; onNext?: () => void } = {},
) {
  return render(
    <DemActionCard
      task={messageTask(payload, over.kind)}
      company={null}
      audit={null}
      busy={false}
      onPatch={over.onPatch ?? jest.fn()}
      onLogged={jest.fn()}
      onNext={over.onNext ?? jest.fn()}
      onReplied={jest.fn()}
      onRetire={jest.fn()}
    />,
  );
}

const DEUX_VERSIONS = {
  message: V_ENTREPRISE,
  variant: "company" as const,
  variantAlt: { variant: "contact" as const, message: V_CONTACT },
};

describe("DemActionCard — la carte message", () => {
  it("bascule entre la version entreprise et la version contact", () => {
    const { container } = renderCard(DEUX_VERSIONS);
    // La zone du message, pas celle de la note d'issue.
    const zone = () => container.querySelector<HTMLTextAreaElement>(".dm-msg textarea")!;
    expect(zone().value).toBe(V_ENTREPRISE);

    fireEvent.click(screen.getByRole("button", { name: /À un contact/ }));
    expect(zone().value).toBe(V_CONTACT);

    fireEvent.click(screen.getByRole("button", { name: /À l’entreprise/ }));
    expect(zone().value).toBe(V_ENTREPRISE);
  });

  it("ne propose plus la bibliothèque de modèles", () => {
    const { container } = renderCard(DEUX_VERSIONS);
    expect(container.querySelector(".dm-tpls")).toBeNull();
    expect(screen.queryByText(/Modèles :/)).toBeNull();
    // Deux versions, deux boutons — pas un de plus.
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".dm-variant-b")).toHaveLength(2);
  });

  it("n'affiche aucune bascule quand le modèle n'a qu'une version", () => {
    const { container } = renderCard({ message: V_ENTREPRISE, variant: "company", variantAlt: null });
    expect(container.querySelector(".dm-variant")).toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>(".dm-msg textarea")!.value).toBe(V_ENTREPRISE);
  });
});

describe("DemActionCard — valider l'envoi", () => {
  const bouton = () => screen.getByRole("button", { name: /Message envoyé — c'est fait/ });

  it("boucle la tâche d'un seul geste, sans exiger d'issue", () => {
    const onPatch = jest.fn();
    renderCard(DEUX_VERSIONS, { onPatch });

    expect(bouton()).toBeEnabled();
    fireEvent.click(bouton());

    expect(onPatch).toHaveBeenCalledWith({ status: "done", opportunite_id: "o1", note: undefined });
    // Rien n'est inventé : aucune issue n'a été cochée, aucune n'est envoyée.
    expect(onPatch.mock.calls[0][0]).not.toHaveProperty("step_outcome");
  });

  it("ne propose PLUS « a répondu » sur un message", () => {
    // Le double geste absurde : cocher « a répondu » ici, puis une seconde fois
    // sur l'attente pour débloquer la suite. La réponse se déclare à un seul
    // endroit — la tâche d'attente.
    renderCard(DEUX_VERSIONS);
    expect(screen.queryByRole("button", { name: "A répondu" })).toBeNull();
    expect(screen.queryByRole("button", { name: /A répondu, peu intéressé/ })).toBeNull();
  });

  it("garde les issues qui ne supposent aucune réponse", () => {
    renderCard(DEUX_VERSIONS);
    expect(screen.getByRole("button", { name: /Bloqué/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pas de réponse" })).toBeInTheDocument();
  });

  it("n'affiche le bouton d'issue que si on en coche une", () => {
    const onPatch = jest.fn();
    renderCard(DEUX_VERSIONS, { onPatch });
    expect(screen.queryByRole("button", { name: /Enregistrer l'issue/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Bloqué/ }));
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer l'issue · Bloqué/ }));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ status: "done", step_outcome: "blocked" }));
  });

  it("marque l'issue comme facultative", () => {
    renderCard(DEUX_VERSIONS);
    expect(screen.getByText("facultatif")).toBeInTheDocument();
  });
});

describe("DemActionCard — l'attente de réponse", () => {
  const waitTask: DemarchageTask = { ...messageTask({}, "wait"), id: "wait:e1", title: "En attente de réponse" };

  it("laisse passer à la tâche suivante sans rien déclarer", () => {
    const onNext = jest.fn();
    render(
      <DemActionCard
        task={waitTask}
        company={null}
        audit={null}
        busy={false}
        onPatch={jest.fn()}
        onLogged={jest.fn()}
        onNext={onNext}
        onReplied={jest.fn()}
      onRetire={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Tâche suivante/ }));
    expect(onNext).toHaveBeenCalled();
  });

  it("garde « le prospect a répondu » distinct du passage à la suite", () => {
    const onNext = jest.fn();
    render(
      <DemActionCard
        task={waitTask}
        company={null}
        audit={null}
        busy={false}
        onPatch={jest.fn()}
        onLogged={jest.fn()}
        onNext={onNext}
        onReplied={jest.fn()}
      onRetire={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Le prospect a répondu/ })).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});
