import React from "react";
import { render, screen } from "@testing-library/react";
import { DemSeqStrip } from "../DemSeqStrip";
import type { DemarchageSequenceInfo } from "../types";

/**
 * La frise n'a rien à dessiner pour un appel à froid — la BANDE, si.
 *
 * Sans séquence, la frise rendait `null` : l'écran s'ouvrait sur la carte
 * d'action sans un mot sur qui on appelle ni pourquoi celle-là. À sa place, on
 * dit la seule chose vraie et utile : jamais contactée, et l'accroche de sa
 * cohorte.
 */

const sequence: DemarchageSequenceInfo = {
  name: "Artisans — 5 touches",
  stepLabel: "Appel J+2",
  stepIndex: 2,
  totalSteps: 5,
  steps: [
    { kind: "call", day: 0, label: "Premier appel" },
    { kind: "whatsapp", day: 2, label: "Relance WhatsApp" },
  ],
};

describe("DemSeqStrip — hors séquence", () => {
  it("annonce l'appel à froid à la place de la frise", () => {
    render(<DemSeqStrip sequence={null} horsSequence cohorte="A_site_faible" />);
    expect(screen.getByText("Appel à froid")).toBeInTheDocument();
    expect(screen.getByText("jamais contactée")).toBeInTheDocument();
  });

  it("donne l'accroche et le document de la cohorte", () => {
    render(<DemSeqStrip sequence={null} horsSequence cohorte="A_site_faible" />);
    expect(screen.getByText(/Cohorte A/)).toBeInTheDocument();
    expect(screen.getByText(/Le document, c'est l'audit/)).toBeInTheDocument();
  });

  it("se tait pour une tâche sans séquence qui n'est pas à froid non plus", () => {
    // Rien de vrai à dire : rien à afficher. C'est le comportement d'avant, et
    // il ne change pas — une vieille ligne sans séquence n'est pas une ligne
    // de campagne.
    const { container } = render(<DemSeqStrip sequence={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dessine toujours la frise quand il y a une séquence", () => {
    render(<DemSeqStrip sequence={sequence} />);
    expect(screen.getByText("Artisans — 5 touches")).toBeInTheDocument();
    expect(screen.getByText("Relance WhatsApp")).toBeInTheDocument();
    expect(screen.queryByText("Appel à froid")).toBeNull();
  });
});
