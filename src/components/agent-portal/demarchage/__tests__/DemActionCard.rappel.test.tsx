import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchageTask } from "../types";
import { authedFetch } from "@/utils/authedFetch";

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), warning: jest.fn() }),
}));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn() }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

const fetchMock = authedFetch as unknown as jest.Mock;

/**
 * « IL M'A RAPPELÉ » — la porte de sortie du scénario.
 *
 * LE CAS QUI L'A FAIT ÉCRIRE : Azur Climat Froid, le 29/08/2026. L'accroche
 * WhatsApp part, le gérant rappelle dans l'heure, Bilal lui envoie la démo et
 * la plaquette. Le CRM n'a vu qu'un message sortant — et deux heures plus tard,
 * la séquence a posé dans la file une relance « je me permets de revenir vers
 * vous, si ce n'est pas le bon moment dites-le moi », parce que la seule voie
 * qu'elle connaissait était celle du silence.
 *
 * CE QUE CE FICHIER PROTÈGE, dans l'ordre d'importance :
 *   1. le bouton existe SUR TOUTE FICHE, attente comprise — c'est justement sur
 *      une attente qu'on découvre qu'il a appelé ;
 *   2. les pièces partent COCHÉES : quand quelqu'un appelle on lui envoie ce
 *      qu'on a, et c'est ce réflexe-là qui n'était journalisé nulle part ;
 *   3. rien ne part sans la note — un « il a rappelé » vide ne vaut pas mieux
 *      que le silence qu'il remplace.
 */

function tache(over: Partial<DemarchageTask> = {}): DemarchageTask {
  return {
    id: "t1",
    kind: "whatsapp",
    status: "pending",
    title: "Premier contact",
    due_at: "2026-08-29T09:00:00.000Z",
    contact_id: "c1",
    entreprise_id: 151,
    opportunite_id: "o1",
    automation_id: "a1",
    enrollment_id: "e1",
    step_id: "wa2",
    payload: { message: "Bonjour", phone: "0663596622" },
    contact: { id: "c1", first_name: "Said", last_name: "Ouzzine", tel: "0663596622", email: null },
    entreprise: { id: 151, name: "Azur Climat Froid", ville: "Dijon", telephone: "0663596622" },
    sequence: { name: "S1", stepLabel: "Relance WhatsApp", stepIndex: 6, totalSteps: 6, steps: [] },
    intent: null,
    ...over,
  };
}

const onRetire = jest.fn();

function carte(over: Partial<DemarchageTask> = {}) {
  return render(
    <DemActionCard
      task={tache(over)}
      company={null}
      audit={null}
      busy={false}
      onPatch={jest.fn()}
      onLogged={jest.fn()}
      onNext={jest.fn()}
      onReplied={jest.fn()}
      onRetire={onRetire}
      onBasculerEnAppel={jest.fn()}
    />,
  );
}

/** Le corps envoyé à la route, tel qu'elle l'a reçu. */
const corpsEnvoye = () => {
  const appel = fetchMock.mock.calls.find(
    ([url]) => typeof url === "string" && url.includes("/il-a-rappele"),
  );
  return appel ? JSON.parse(appel[1].body) : null;
};

beforeEach(() => {
  fetchMock.mockReset();
  onRetire.mockReset();
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.startsWith("/api/agent/notes?")
        ? { ok: true, json: async () => ({ notes: [] }) }
        : {
            ok: true,
            json: async () => ({
              ok: true,
              pieces_journalisees: ["demo", "plaquette"],
              pieces_sans_lien: [],
              sequence: { inscrit: true },
            }),
          },
    ),
  );
});

describe("le bouton « Il m'a rappelé »", () => {
  it("est là sur un message", () => {
    carte();
    expect(screen.getByRole("button", { name: /Il m'a rappelé/i })).toBeInTheDocument();
  });

  it("est là sur un appel", () => {
    carte({ kind: "call" });
    expect(screen.getByRole("button", { name: /Il m'a rappelé/i })).toBeInTheDocument();
  });

  /**
   * LE CAS QUI COMPTE LE PLUS. Une attente est l'endroit où la séquence croit
   * que le prospect se tait ; c'est donc l'endroit exact où l'on vient dire
   * qu'il a parlé. La barre d'actions n'y était pas rendue du tout.
   */
  it("est là sur une attente de réponse", () => {
    carte({ kind: "wait" });
    expect(screen.getByRole("button", { name: /Il m'a rappelé/i })).toBeInTheDocument();
  });
});

describe("ce que le panneau consigne", () => {
  it("part avec la démo et la plaquette cochées, l'audit non", async () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Il m'a rappelé/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ce qu'il a dit/i), {
      target: { value: "Refait déjà son site avec quelqu'un, veut voir la démo quand même." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Consigner l’échange/i }));

    await waitFor(() => expect(corpsEnvoye()).not.toBeNull());
    expect(corpsEnvoye()).toMatchObject({
      task_id: "t1",
      entreprise_id: 151,
      canal: "call",
      pieces: ["demo", "plaquette"],
    });
    expect(corpsEnvoye().note).toMatch(/Refait déjà son site/);
  });

  it("n'envoie RIEN sans la note", () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Il m'a rappelé/i }));
    // Le bouton est désactivé tant que la note est vide : la phrase EST le
    // livrable de ce geste, pas un commentaire facultatif.
    expect(screen.getByRole("button", { name: /Consigner l’échange/i })).toBeDisabled();
    expect(corpsEnvoye()).toBeNull();
  });

  it("laisse décocher une pièce qui n'est pas partie", async () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Il m'a rappelé/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /La plaquette/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ce qu'il a dit/i), {
      target: { value: "A rappelé, je n'ai envoyé que la démo." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Consigner l’échange/i }));

    await waitFor(() => expect(corpsEnvoye()).not.toBeNull());
    expect(corpsEnvoye().pieces).toEqual(["demo"]);
  });

  it("retient le canal choisi", async () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Il m'a rappelé/i }));
    fireEvent.click(screen.getByRole("button", { name: /Il a écrit sur WhatsApp/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ce qu'il a dit/i), {
      target: { value: "A répondu de lui-même sur WhatsApp." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Consigner l’échange/i }));

    await waitFor(() => expect(corpsEnvoye()).not.toBeNull());
    expect(corpsEnvoye().canal).toBe("whatsapp");
  });

  /** La carte doit enchaîner : la tâche a quitté la file par un autre chemin
   *  qu'un `PATCH`, exactement comme une sortie de canal. */
  it("recharge la file une fois l'échange consigné", async () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Il m'a rappelé/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ce qu'il a dit/i), {
      target: { value: "Il a rappelé." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Consigner l’échange/i }));

    await waitFor(() => expect(onRetire).toHaveBeenCalled());
  });
});
