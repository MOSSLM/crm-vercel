import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemActionCard } from "../DemActionCard";
import { SCRIPT_STEPS } from "@/lib/telephony/call-script";
import type { DemarchageTask } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/utils/authedFetch", () => ({ authedFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * La carte d'appel montre CE QUE LA SÉQUENCE A PRÉPARÉ, et rien d'autre.
 *
 * Avant, elle affichait l'argumentaire générique (le même pour tous les
 * prospects) et quatre objections, mais jamais le script rendu par le moteur
 * pour ce prospect-là — qui voyageait pourtant dans le payload de la tâche.
 */

const SCRIPT_ENTREPRISE = "Bonjour, je suis bien avec Toiture Martin ?";
const SCRIPT_CONTACT = "Bonjour Julien, je suis bien chez Toiture Martin ?";

function callTask(payload: DemarchageTask["payload"]): DemarchageTask {
  return {
    id: "t1",
    kind: "call",
    status: "pending",
    title: "Appel de découverte",
    due_at: "2026-08-13T09:00:00.000Z",
    contact_id: "c1",
    entreprise_id: 1,
    opportunite_id: null,
    automation_id: "a1",
    enrollment_id: "e1",
    step_id: "s1",
    payload,
    contact: { id: "c1", first_name: "Julien", last_name: "Martin", tel: "0646042876", email: null },
    entreprise: { id: 1, name: "Toiture Martin", ville: "Annecy", telephone: "0450000000" },
    sequence: { name: "Démarchage artisans", stepLabel: "Appel J+2", stepIndex: 2, totalSteps: 5, steps: [] },
    intent: null,
  };
}

const renderCard = (payload: DemarchageTask["payload"]) =>
  render(
    <DemActionCard
      task={callTask(payload)}
      company={null}
      audit={null}
      busy={false}
      onPatch={jest.fn()}
      onLogged={jest.fn()}
      onNext={jest.fn()}
      onReplied={jest.fn()}
    />,
  );

const DEUX_VERSIONS = {
  message: SCRIPT_ENTREPRISE,
  script: SCRIPT_ENTREPRISE,
  scriptName: "Script d'accroche artisan",
  variant: "company" as const,
  variantAlt: { variant: "contact" as const, message: SCRIPT_CONTACT },
};

describe("DemActionCard — la carte d'appel", () => {
  it("ouvre sur le script préparé par la séquence", () => {
    renderCard(DEUX_VERSIONS);
    expect(screen.getByText(SCRIPT_ENTREPRISE)).toBeInTheDocument();
    expect(screen.getByText("Script d'accroche artisan")).toBeInTheDocument();
  });

  it("ne montre plus la trame générique tant qu'on ne l'a pas demandée", () => {
    renderCard(DEUX_VERSIONS);
    expect(screen.queryByText(SCRIPT_STEPS[0].title)).toBeNull();
    expect(screen.queryByText(/J'ai déjà un site/)).toBeNull();
  });

  it("bascule entre la version entreprise et la version contact", () => {
    renderCard(DEUX_VERSIONS);
    fireEvent.click(screen.getByRole("button", { name: /À un contact/ }));
    expect(screen.getByText(SCRIPT_CONTACT)).toBeInTheDocument();
    expect(screen.queryByText(SCRIPT_ENTREPRISE)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /À l’entreprise/ }));
    expect(screen.getByText(SCRIPT_ENTREPRISE)).toBeInTheDocument();
  });

  it("n'offre aucune bascule quand le modèle n'a qu'une version", () => {
    renderCard({ message: SCRIPT_ENTREPRISE, variant: "company", variantAlt: null });
    expect(screen.queryByRole("group", { name: "Version du script" })).toBeNull();
    expect(screen.getByText(SCRIPT_ENTREPRISE)).toBeInTheDocument();
  });

  it("range la trame et les objections derrière leur onglet", () => {
    renderCard(DEUX_VERSIONS);
    fireEvent.click(screen.getByRole("tab", { name: /Trame/ }));

    for (const s of SCRIPT_STEPS) expect(screen.getByText(s.title)).toBeInTheDocument();
    expect(screen.getByText(/J'ai déjà un site/)).toBeInTheDocument();
    // Et le script de l'étape a laissé la place.
    expect(screen.queryByText(SCRIPT_ENTREPRISE)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Script de l/ }));
    expect(screen.getByText(SCRIPT_ENTREPRISE)).toBeInTheDocument();
  });

  it("le dit franchement quand l'étape n'a aucun script — sans inventer un texte", () => {
    renderCard({ message: "", variant: "company", variantAlt: null });
    expect(screen.getByText(/aucun script préparé/)).toBeInTheDocument();
    // La trame générique reste accessible, elle n'est simplement pas mise en avant.
    fireEvent.click(screen.getByRole("tab", { name: /Trame/ }));
    expect(screen.getByText(SCRIPT_STEPS[0].title)).toBeInTheDocument();
  });

  it("garde le numéro et l'issue de l'échange hors des onglets", () => {
    renderCard(DEUX_VERSIONS);
    const carte = screen.getByRole("tab", { name: /Trame/ }).closest(".dm-card")!;
    fireEvent.click(screen.getByRole("tab", { name: /Trame/ }));
    expect(within(carte as HTMLElement).getByText("0450000000")).toBeInTheDocument();
    expect(within(carte as HTMLElement).getByText(/Issue de l/)).toBeInTheDocument();
  });
});
