import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchageTask } from "../types";
import { authedFetch } from "@/utils/authedFetch";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn() }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

const fetchMock = authedFetch as unknown as jest.Mock;

/**
 * DEUX GRIEFS, UNE CARTE.
 *
 * 1. « Les boutons "fait" et "envoyer le message" se ressemblent trop. » Ils
 *    étaient deux blocs pleine largeur à dix pixels l'un de l'autre. Ils sont
 *    maintenant deux objets de FORMES différentes, et le second ne se remplit
 *    qu'une fois le geste réellement accompli.
 * 2. « À toutes les étapes on doit pouvoir noter ce que le client a dit, et
 *    consulter les notes très facilement. » Une note ne pouvait s'écrire qu'en
 *    bouclant une tâche : ce qui se dit au milieu d'une conversation n'avait
 *    nulle part où aller.
 */

const NOTES = [
  { id: "n1", texte: "Rappeler en septembre", le: "2026-08-18T10:00:00.000Z", auteur: "Bilal", motif: null },
  { id: "n2", texte: "Pas le bon interlocuteur", le: "2026-08-12T10:00:00.000Z", auteur: "Bilal", motif: null },
  { id: "n3", texte: "Numéro du gérant obtenu", le: "2026-08-02T10:00:00.000Z", auteur: null, motif: null },
];

function tache(over: Partial<DemarchageTask> = {}): DemarchageTask {
  return {
    id: "t1",
    kind: "whatsapp",
    status: "pending",
    title: "Premier contact",
    due_at: "2026-08-13T09:00:00.000Z",
    contact_id: "c1",
    entreprise_id: 42,
    opportunite_id: "o1",
    automation_id: "a1",
    enrollment_id: "e1",
    step_id: "s1",
    payload: { message: "Bonjour", phone: "0646042876" },
    contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
    entreprise: { id: 42, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
    sequence: { name: "S1", stepLabel: "WhatsApp J+0", stepIndex: 1, totalSteps: 5, steps: [] },
    intent: null,
    ...over,
  };
}

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
      onRetire={jest.fn()}
    />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.startsWith("/api/agent/notes?")
        ? { ok: true, json: async () => ({ notes: NOTES }) }
        : { ok: true, json: async () => ({}) },
    ),
  );
  window.open = jest.fn();
});

describe("DemActionCard — envoyer et boucler ne se ressemblent plus", () => {
  it("donne au geste qui boucle une forme à lui, pas un second gros bouton", () => {
    const { container } = carte();
    // L'envoi reste un bloc plein à la couleur du canal ; boucler est une barre.
    expect(container.querySelector(".dm-cta")).not.toBeNull();
    const barre = container.querySelector<HTMLElement>(".dm-fait")!;
    expect(barre).not.toBeNull();
    // Et elle annonce ce qu'elle fait à la file.
    expect(barre.textContent).toContain("suivant");
  });

  it("laisse le bouton d'envoi en avant tant que rien n'est parti", () => {
    const { container } = carte();
    expect(container.querySelector<HTMLElement>(".dm-fait")!.dataset.arme).toBeUndefined();
    expect(container.querySelector<HTMLElement>(".dm-cta")!.dataset.fait).toBeUndefined();
    expect(screen.getByRole("button", { name: /Marquer comme fait/ })).toBeInTheDocument();
  });

  it("échange les rôles une fois le message envoyé", async () => {
    const { container } = carte();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer le WhatsApp/ }));
    await waitFor(() =>
      expect(container.querySelector<HTMLElement>(".dm-fait")!.dataset.arme).toBe("1"),
    );
    // Le bouton d'envoi recule : il a fait son travail.
    expect(container.querySelector<HTMLElement>(".dm-cta")!.dataset.fait).toBe("1");
    expect(screen.getByRole("button", { name: /C'est fait/ })).toBeInTheDocument();
  });
});

describe("DemActionCard — noter et relire, à chaque étape", () => {
  it("montre les dernières notes du prospect sans déplier tout l'historique", async () => {
    const { container } = carte();
    await waitFor(() => expect(container.querySelectorAll(".dm-notes .n1").length).toBe(2));
    expect(screen.getByText("Rappeler en septembre")).toBeInTheDocument();
    // La troisième attend qu'on la demande.
    expect(screen.queryByText("Numéro du gérant obtenu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "tout voir" }));
    expect(screen.getByText("Numéro du gérant obtenu")).toBeInTheDocument();
  });

  it("dit de qui est la note — c'est tout le grief « je ne vois pas celles de Bilal »", async () => {
    const { container } = carte();
    await waitFor(() => expect(container.querySelectorAll(".dm-notes .n1").length).toBe(2));
    const quands = Array.from(container.querySelectorAll<HTMLElement>(".dm-notes .n1 .q")).map(
      (q) => q.textContent,
    );
    expect(quands.every((q) => q?.includes("Bilal"))).toBe(true);
  });

  it("enregistre une note seule, sans rien fermer, et vide le champ", async () => {
    const { container } = carte();
    await waitFor(() => expect(container.querySelector(".dm-notes")).not.toBeNull());
    const zone = container.querySelector<HTMLTextAreaElement>(".dm-notes textarea")!;
    fireEvent.change(zone, { target: { value: "Il rappelle lundi" } });
    fireEvent.click(screen.getByRole("button", { name: /Noter/ }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]: [string, RequestInit | undefined]) => u === "/api/agent/notes" && i?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        entreprise_id: 42,
        texte: "Il rappelle lundi",
        step_id: "s1",
      });
    });
    // Vidé : sans ça la note repartirait une seconde fois avec la tâche.
    await waitFor(() => expect(zone.value).toBe(""));
  });

  it("propose de noter jusque sur une attente de réponse", async () => {
    const { container } = carte({ kind: "wait", payload: {} });
    await waitFor(() => expect(container.querySelector(".dm-notes")).not.toBeNull());
    expect(screen.getByRole("button", { name: /Le prospect a répondu/ })).toBeInTheDocument();
  });
});
