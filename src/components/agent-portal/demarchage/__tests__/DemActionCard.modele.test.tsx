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
 * LE TEXTE EST REFAIT À L'OUVERTURE DE LA CARTE, et le bouton reste pour le
 * rattrapage. Ce qu'il fallait éviter n'a jamais été le rafraîchissement, mais
 * qu'il tombe SOUS LES YEUX DE QUELQU'UN QUI VIENT DE RELIRE : le message
 * partirait différent de celui qu'il a lu. Une passe unique à l'ouverture,
 * avant toute lecture, ne pose pas ce problème — et elle épargne un clic sur
 * chaque plaquette, ce qui était le grief.
 *
 * Ce qui se vérifie ici : le nouveau texte remplace l'ancien DANS le champ
 * (sans quoi l'agent enverrait ce qu'il voit, c'est-à-dire l'ancien), la passe
 * d'ouverture n'écrase JAMAIS ce que l'agent a tapé, et rien n'est demandé sur
 * une tâche sans étape de séquence — celles qu'une action `create_task` a
 * posées n'ont aucun modèle à relire, la route y répondrait 409.
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

/** Les appels à la route de rechargement, dans l'ordre. */
const appelsRechargement = () =>
  (authedFetch as jest.Mock).mock.calls.filter(
    ([url]) => url === "/api/agent/demarchage/recharger-message",
  );

describe("recharger le message depuis le modèle", () => {
  // LE GRIEF D'ORIGINE : « je ne veux pas avoir à appuyer sur recharger le
  // message chaque fois que j'envoie une plaquette ».
  it("refait le texte à l'ouverture de la carte, sans le moindre clic", async () => {
    (authedFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, inchange: false, message: NOUVEAU, variant: "company" }),
    });
    renderCard();

    await waitFor(() => expect(champ()).toHaveValue(NOUVEAU));
    expect(appelsRechargement()).toHaveLength(1);
    expect(JSON.parse(appelsRechargement()[0][1].body)).toEqual({ task_id: "t1" });
    // Et l'écran le dit : un texte qui change sans qu'on ait rien demandé se
    // lirait sinon comme un bug d'affichage.
    expect(await screen.findByText(/refait depuis le modèle/i)).toBeInTheDocument();
  });

  // LA LIMITE DE LA PASSE AUTOMATIQUE, et elle n'est pas négociable : personne
  // ne doit voir sa propre phrase disparaître parce qu'une réponse réseau est
  // arrivée après qu'il a commencé à écrire.
  it("n'écrase jamais un texte déjà retouché à la main", async () => {
    let repondre: (v: unknown) => void = () => {};
    (authedFetch as jest.Mock).mockImplementation((url: string) =>
      url === "/api/agent/demarchage/recharger-message"
        ? new Promise((res) => {
            repondre = res;
          })
        : Promise.resolve({ ok: true, json: async () => ({}) }),
    );
    renderCard();

    fireEvent.change(champ(), { target: { value: "Bonjour Julien, je me permets…" } });
    repondre({ ok: true, json: async () => ({ ok: true, inchange: false, message: NOUVEAU }) });

    await waitFor(() => expect(appelsRechargement()).toHaveLength(1));
    expect(champ()).toHaveValue("Bonjour Julien, je me permets…");
  });

  it("ne demande rien sur une tâche qui ne vient pas d'une séquence", async () => {
    (authedFetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    renderCard(task({ enrollment_id: null, step_id: null }));
    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    expect(appelsRechargement()).toHaveLength(0);
  });

  it("remplace le texte du champ par celui que rend le modèle actuel", async () => {
    (authedFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, inchange: false, message: NOUVEAU }),
    });
    renderCard();
    // La passe d'ouverture a déjà posé le texte du modèle : le bouton se juge
    // sur ce qu'il fait EN PLUS, pas sur le premier rendu.
    await waitFor(() => expect(champ()).toHaveValue(NOUVEAU));
    fireEvent.change(champ(), { target: { value: "brouillon" } });

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
    (authedFetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    renderCard(task({ enrollment_id: null, step_id: null }));
    expect(screen.queryByRole("button", { name: /recharger le modèle/i })).not.toBeInTheDocument();
  });
});
