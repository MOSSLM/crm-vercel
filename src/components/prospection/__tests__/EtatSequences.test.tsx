import React from "react";
import { render, screen } from "@testing-library/react";
import { EtatSequences } from "../EtatSequences";

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));

/**
 * L'écran ne calcule rien : tout vient de `etatDesSequences`, testé à part. Ce
 * qui se vérifie ici est ce que l'écran DIT — en particulier qu'il ne noie pas
 * les inscriptions garées dans une colonne, et qu'une panne de lecture ne se
 * lise jamais comme « plus personne en séquence ».
 */

const bloc = (over: Record<string, unknown> = {}) => ({
  index: 0,
  id: "a",
  kind: "whatsapp",
  label: "Premier message",
  jour: 0,
  inscrits: 0,
  taches: 0,
  enRetard: 0,
  reportees: 0,
  programmes: 0,
  garees: 0,
  prochain: null,
  motifs: [],
  ...over,
});

const sequence = (over: Record<string, unknown> = {}) => ({
  id: "S",
  nom: "S1 — Premier contact",
  statut: "on",
  blocs: [bloc()],
  actives: 0,
  taches: 0,
  enRetard: 0,
  garees: 0,
  programmes: 0,
  termines: 0,
  sorties: 0,
  horsPlan: 0,
  prochain: null,
  ...over,
});

const repond = (sequences: unknown[]) =>
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({ sequences }) });

beforeEach(() => authedFetch.mockReset());

describe("EtatSequences — où on en est", () => {
  it("montre chaque bloc avec ce qui s'y trouve", async () => {
    repond([
      sequence({
        actives: 3,
        taches: 2,
        blocs: [
          bloc({ inscrits: 1, taches: 1, enRetard: 1 }),
          bloc({ index: 1, id: "b", kind: "call", label: "Appel", inscrits: 2, taches: 1 }),
        ],
      }),
    ]);
    render(<EtatSequences />);
    expect(await screen.findByText("S1 — Premier contact")).toBeInTheDocument();
    expect(screen.getByText("Premier message")).toBeInTheDocument();
    expect(screen.getByText("Appel")).toBeInTheDocument();
    expect(screen.getByText("1 en retard")).toBeInTheDocument();
  });

  // LE POINT DE L'ÉCRAN. 524 inscriptions étaient dans ce cas sans qu'aucune
  // surface ne le dise.
  it("dit en toutes lettres que les garées n'attendent rien", async () => {
    repond([
      sequence({
        actives: 524,
        garees: 524,
        blocs: [
          bloc({
            inscrits: 524,
            garees: 524,
            motifs: [{ motif: "sequence_paused", nature: "reglage", n: 524 }],
          }),
        ],
      }),
    ]);
    render(<EtatSequences />);
    expect(await screen.findByText(/524 inscription\(s\) garée\(s\)\./)).toBeInTheDocument();
    expect(screen.getByText(/aucun passage du moteur ne les reprendra/)).toBeInTheDocument();
    // Le motif est nommé : c'est lui qui dit quoi lever.
    expect(screen.getByText(/séquence en pause/)).toBeInTheDocument();
  });

  it("signale les inscriptions posées sur une étape disparue", async () => {
    repond([sequence({ actives: 4, horsPlan: 4 })]);
    render(<EtatSequences />);
    expect(await screen.findByText(/4 inscription\(s\) hors plan\./)).toBeInTheDocument();
  });

  it("ne confond pas une panne de lecture avec une absence d'inscrits", async () => {
    authedFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "403" }) });
    render(<EtatSequences />);
    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(screen.queryByText("Aucune séquence à suivre")).not.toBeInTheDocument();
  });

  it("propose un premier geste quand il n'y a vraiment rien", async () => {
    repond([]);
    render(<EtatSequences />);
    expect(await screen.findByText("Aucune séquence à suivre")).toBeInTheDocument();
  });
});
