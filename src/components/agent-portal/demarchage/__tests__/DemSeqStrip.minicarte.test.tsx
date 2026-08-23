import React from "react";
import { render, screen } from "@testing-library/react";
import { DemSeqStrip } from "../DemSeqStrip";
import type { DemarchageSequenceInfo } from "../types";

/**
 * La frise mentait par cadrage : 22 blocs de 104 px dans une colonne de six
 * cents, l'étape en cours hors champ. La mini-carte est la réponse qui ne
 * dépend pas de la largeur — elle porte la séquence ENTIÈRE, toujours.
 *
 * Ce qui se teste ici est donc sa COMPLÉTUDE et sa position. Le recadrage de
 * la piste, lui, est du DOM de mise en page (`scrollTo`, `clientWidth`) que
 * jsdom ne mesure pas : le vérifier ici ne prouverait que le mock.
 */

const longue = (stepIndex: number): DemarchageSequenceInfo => ({
  name: "S1 — Premier contact",
  stepLabel: "WhatsApp 2",
  stepIndex,
  totalSteps: 22,
  steps: Array.from({ length: 22 }, (_, i) => ({
    kind: i % 3 === 0 ? "condition" : "whatsapp",
    day: 0,
    label: `Bloc ${i + 1}`,
  })),
});

const minicarte = () => screen.getByRole("group", { name: "Position dans la séquence" });

describe("DemSeqStrip — la mini-carte", () => {
  it("porte un repère par bloc, quelle que soit la longueur", () => {
    render(<DemSeqStrip sequence={longue(6)} />);
    expect(minicarte().querySelectorAll("button")).toHaveLength(22);
  });

  it("marque l'étape en cours, et elle seule", () => {
    render(<DemSeqStrip sequence={longue(6)} />);
    const reperes = [...minicarte().querySelectorAll("button")];
    expect(reperes.filter((b) => b.dataset.s === "cur")).toHaveLength(1);
    expect(reperes[5].dataset.s).toBe("cur");
    // Ce qui précède est fait, ce qui suit reste à faire : la position se lit
    // sans avoir à compter.
    expect(reperes[4].dataset.s).toBe("done");
    expect(reperes[6].dataset.s).toBe("todo");
  });

  it("distingue les blocs de structure des gestes", () => {
    render(<DemSeqStrip sequence={longue(6)} />);
    const reperes = [...minicarte().querySelectorAll("button")];
    expect(reperes[0].dataset.struct).toBe("true");
    expect(reperes[1].dataset.struct).toBeUndefined();
  });

  it("nomme chaque repère : la barre ne se lit pas qu'à l'œil", () => {
    render(<DemSeqStrip sequence={longue(6)} />);
    expect(screen.getByRole("button", { name: "6. Bloc 6" })).toBeInTheDocument();
  });
});
