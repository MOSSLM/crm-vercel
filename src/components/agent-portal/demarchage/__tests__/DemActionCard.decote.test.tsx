import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import type { DemarchagePatchBody, DemarchageTask } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
const authedFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ appel_cree: true }) });
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * LES DEUX SORTIES QUI NE SONT NI UN OUI NI UN NON.
 *
 * · « Mettre de côté » : le prospect n'est pas dispo en ce moment. Il n'est ni
 *   perdu ni convaincu — il est RANGÉ, et il revient tout seul à la date
 *   choisie. La tâche est replanifiée, jamais fermée.
 * · « Pas sur WhatsApp » : rien n'est parti, personne n'a rien dit. Le prospect
 *   sort de CETTE séquence pour cette raison-là, et reste joignable ailleurs.
 *
 * Sans ces deux gestes, les deux cas se rangeaient en « Fait » (on enregistre
 * un envoi qui n'a pas eu lieu, et la séquence relance sur un canal mort) ou en
 * « Pas intéressé » (on perd un prospect qui n'a jamais dit non).
 */

const tache = (over: Partial<DemarchageTask> = {}): DemarchageTask => ({
  id: "t1",
  kind: "whatsapp",
  status: "pending",
  title: "Premier contact",
  due_at: "2026-08-17T09:00:00.000Z",
  contact_id: "c1",
  entreprise_id: 1,
  opportunite_id: "o1",
  automation_id: "a1",
  enrollment_id: "e1",
  step_id: "s1",
  payload: { message: "Bonjour", phone: "0646042876" },
  contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
  entreprise: { id: 1, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
  sequence: { name: "Artisans", stepLabel: "WhatsApp J+0", stepIndex: 1, totalSteps: 5, steps: [] },
  intent: null,
  ...over,
});

function carte(over: Partial<DemarchageTask> = {}, onPatch = jest.fn(), onRetire = jest.fn()) {
  render(
    <DemActionCard
      task={tache(over)}
      company={null}
      audit={null}
      busy={false}
      onPatch={onPatch as (b: Omit<DemarchagePatchBody, "id">) => void}
      onLogged={jest.fn()}
      onNext={jest.fn()}
      onReplied={jest.fn()}
      onRetire={onRetire}
    />,
  );
  return { onPatch, onRetire };
}

beforeEach(() => authedFetch.mockClear());

describe("DemActionCard — mettre de côté", () => {
  it("range la tâche à la date choisie, sans la fermer ni la perdre", () => {
    const { onPatch } = carte();
    fireEvent.click(screen.getByRole("button", { name: /Mettre de côté/ }));
    fireEvent.click(screen.getByRole("button", { name: "1 mois" }));
    fireEvent.change(screen.getByPlaceholderText(/Pourquoi maintenant/), {
      target: { value: "En congés jusqu'à la rentrée" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Mettre de côté jusqu'au/ }));

    const envoye = onPatch.mock.calls[0][0];
    // `snoozed` et pas `done` : la tâche dort, elle n'est pas faite. Et pas
    // `skipped` non plus — elle doit revenir.
    expect(envoye.status).toBe("snoozed");
    expect(envoye.step_outcome).toBe("later");
    expect(envoye.note).toBe("En congés jusqu'à la rentrée");
    // Un mois plus tard, à 9 h : la date part bien, sinon `due_at` ne bouge pas
    // et la tâche resterait dans la file du jour.
    const retour = new Date(envoye.snooze_until as string);
    const jours = Math.round((retour.getTime() - Date.now()) / 86_400_000);
    expect(jours).toBeGreaterThanOrEqual(29);
    expect(jours).toBeLessThanOrEqual(31);
  });

  it("n'exige aucun motif — ranger quelqu'un ne se justifie pas", () => {
    const { onPatch } = carte();
    fireEvent.click(screen.getByRole("button", { name: /Mettre de côté/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mettre de côté jusqu'au/ }));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ status: "snoozed", note: undefined }));
  });

  it("ne propose plus « Mettre de côté » deux fois", () => {
    // Le geste a remplacé la pastille d'issue `later` : deux chemins pour le
    // même acte, dont un qui oblige à composer une date à la main.
    carte();
    expect(screen.getAllByRole("button", { name: /^Mettre de côté$/ })).toHaveLength(1);
  });

  it("relit le motif quand la tâche revient de sa mise de côté", () => {
    carte({
      status: "snoozed",
      payload: {
        message: "Bonjour",
        mise_de_cote: { jusquau: "2026-09-15T09:00:00.000Z", motif: "Chantier jusqu'au 15", le: "2026-08-17T10:00:00.000Z" },
      },
    });
    expect(screen.getByText(/Chantier jusqu'au 15/)).toBeInTheDocument();
  });
});

describe("DemActionCard — pas sur WhatsApp", () => {
  it("sort le prospect de la séquence et lui garde un appel", async () => {
    const { onRetire } = carte();
    fireEvent.click(screen.getByRole("button", { name: /Pas sur WhatsApp/ }));
    fireEvent.click(screen.getByRole("button", { name: /Le sortir de la séquence WhatsApp/ }));

    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    const [url, init] = authedFetch.mock.calls[0];
    expect(url).toBe("/api/agent/demarchage/hors-canal");
    expect(JSON.parse((init as { body: string }).body)).toMatchObject({
      task_id: "t1",
      // Coché par défaut : un prospect parfaitement joignable au téléphone ne
      // doit pas disparaître de la file au seul motif qu'il n'a pas WhatsApp.
      basculer_appel: true,
    });
    await waitFor(() => expect(onRetire).toHaveBeenCalled());
  });

  it("laisse décocher le repli téléphone", async () => {
    carte();
    fireEvent.click(screen.getByRole("button", { name: /Pas sur WhatsApp/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Le sortir de la séquence WhatsApp/ }));

    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    const [, init] = authedFetch.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body).basculer_appel).toBe(false);
  });

  it("ne le propose pas sur un appel — un numéro sonne ou ne sonne pas", () => {
    carte({ kind: "call" });
    expect(screen.queryByRole("button", { name: /Pas sur WhatsApp/ })).toBeNull();
    // La mise de côté, elle, vaut pour tous les canaux.
    expect(screen.getByRole("button", { name: /Mettre de côté/ })).toBeInTheDocument();
  });
});
