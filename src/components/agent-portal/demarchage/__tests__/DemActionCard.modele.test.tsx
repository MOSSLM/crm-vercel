import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchageTask } from "../types";
import { authedFetch } from "@/utils/authedFetch";

/**
 * « J'ai changé les modèles de message, mais ça ne semble pas pris en compte
 * dans les cartes de ma journée. »
 *
 * CE QUE CE TEST PROTÈGE, ET POURQUOI IL EXISTE. Le moteur rend le message AU
 * MOMENT où il pose l'étape, et l'écrit dans `prospection_tasks.payload` ; la
 * carte lit cette charge utile, jamais le modèle. C'est délibéré — l'agent doit
 * voir ce que le moteur a préparé — mais ça veut dire qu'un modèle corrigé ne
 * rattrape que les tâches créées après. Au 28/08/2026, quarante-neuf tâches
 * « Plaquette » en attente portaient encore le texte d'avant.
 *
 * Le bouton est la porte, et elle est EXPLICITE : rien ne se recalcule tout
 * seul. Un rafraîchissement automatique changerait le texte sous les yeux de
 * quelqu'un qui vient de le relire, et ferait diverger l'écran de ce qui a été
 * journalisé.
 *
 * Deux choses se vérifient : le nouveau texte remplace l'ancien DANS le champ
 * (sans quoi l'agent enverrait ce qu'il voit, c'est-à-dire l'ancien), et le
 * bouton n'apparaît pas sur une tâche sans étape de séquence — celles qu'une
 * action `create_task` a posées n'ont aucun modèle à relire.
 */

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn() }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

const ANCIEN = "Bonjour Julien,\n\nJe vous joins notre plaquette.";
const NOUVEAU = "Bonjour Julien,\nSuite à notre échange, je vous envoie comme prévu la plaquette.";

function task(over: Partial<DemarchageTask> = {}): DemarchageTask {
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
    payload: { message: ANCIEN },
    contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
    entreprise: { id: 1, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
    sequence: { name: "S2 — Après la démo", stepLabel: "Plaquette", stepIndex: 2, totalSteps: 10, steps: [] },
    intent: null,
    ...over,
  };
}

const renderCard = (t: DemarchageTask = task()) =>
  render(
    <DemActionCard
      task={t}
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

const bouton = () => screen.getByRole("button", { name: /recharger le modèle/i });
/** Le champ du message : la carte porte aussi celui de la note interne. */
const champ = () => screen.getAllByRole("textbox")[0];

beforeEach(() => {
  (authedFetch as jest.Mock).mockReset();
});

describe("recharger le message depuis le modèle", () => {
  it("remplace le texte du champ par celui que rend le modèle actuel", async () => {
    (authedFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, inchange: false, message: NOUVEAU }),
    });
    renderCard();
    expect(champ()).toHaveValue(ANCIEN);

    fireEvent.click(bouton());

    await waitFor(() => expect(champ()).toHaveValue(NOUVEAU));
    // La carte appelle aussi ses notes au montage : on cherche l'appel, on ne
    // suppose pas qu'il est le premier.
    const appel = (authedFetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/agent/demarchage/recharger-message",
    );
    expect(appel).toBeDefined();
    expect(JSON.parse(appel![1].body)).toEqual({ task_id: "t1" });
  });

  it("laisse le texte en place quand le rechargement échoue", async () => {
    // Étape supprimée, modèle vide, tâche close : la route répond 409. Vider le
    // champ mettrait l'agent devant un écran blanc au moment d'envoyer.
    (authedFetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Le modèle de cette étape est vide — rien à recharger." }),
    });
    renderCard();

    fireEvent.click(bouton());

    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    expect(champ()).toHaveValue(ANCIEN);
  });

  it("n'apparaît pas sur une tâche qui ne vient pas d'une séquence", () => {
    renderCard(task({ enrollment_id: null, step_id: null }));
    expect(screen.queryByRole("button", { name: /recharger le modèle/i })).not.toBeInTheDocument();
  });
});
