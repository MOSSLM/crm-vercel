import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemHorsFile } from "../DemHorsFile";
import type { CompanyBundle } from "../types";

jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/components/telephony/CallProvider", () => ({ useTelephonyOptional: () => null }));

/**
 * L'entreprise qui rappelle n'a rien de prévu aujourd'hui — sinon elle serait
 * déjà dans la file. Sa fiche doit donc s'ouvrir SANS tâche : de quoi tenir la
 * conversation en cours, et rien qui prétende fermer quoi que ce soit.
 */

const bundle = (over: Partial<CompanyBundle> = {}): CompanyBundle => ({
  entreprise: {
    id: 7,
    name: "Maçonnerie Dubois",
    ville: "Rumilly",
    code_postal: "74150",
    adresse: "12 rue des Écoles",
    telephone: "0450112233",
    email: null,
    site_web_canonique: null,
    siret: null,
    owner_id: null,
  },
  donneesPubliques: null,
  contacts: [],
  site: null,
  upcomingBooking: null,
  opportunite: null,
  ...over,
});

describe("DemHorsFile — la fiche ouverte sans tâche", () => {
  it("met le numéro sous la main, appelable en un clic", () => {
    render(<DemHorsFile company={bundle()} onRetour={jest.fn()} />);
    expect(screen.getByRole("button", { name: /0450112233/ })).toBeInTheDocument();
  });

  it("ne prétend pas qu'il y a une affaire quand il n'y en a pas", () => {
    render(<DemHorsFile company={bundle()} onRetour={jest.fn()} />);
    expect(screen.getByText("aucune affaire ouverte")).toBeInTheDocument();
  });

  it("dit où en est l'affaire et le RDV déjà pris", () => {
    render(
      <DemHorsFile
        company={bundle({
          opportunite: { id: "o1", name: "Site vitrine", montant: null, stageNom: "Proposition" },
          upcomingBooking: {
            id: "b1",
            event_title: "Démo",
            start_at: "2026-08-20T09:00:00.000Z",
            end_at: "2026-08-20T09:30:00.000Z",
            status: "confirmed",
            invitee_name: "Paul Dubois",
          },
        })}
        onRetour={jest.fn()}
      />,
    );
    expect(screen.getByText(/Site vitrine · Proposition/)).toBeInTheDocument();
    expect(screen.getByText(/RDV le/)).toBeInTheDocument();
  });

  it("prévient quand aucun numéro n'est connu, plutôt que de n'afficher rien", () => {
    const sansTel = bundle();
    sansTel.entreprise.telephone = null;
    render(<DemHorsFile company={sansTel} onRetour={jest.fn()} />);
    expect(screen.getByText(/Aucun numéro connu sur cette fiche/)).toBeInTheDocument();
  });

  it("rend la file en un geste", () => {
    const onRetour = jest.fn();
    render(<DemHorsFile company={bundle()} onRetour={onRetour} />);
    fireEvent.click(screen.getByRole("button", { name: /Retour à la file/ }));
    expect(onRetour).toHaveBeenCalled();
  });

  it("ne ferme aucune carte — il n'y a pas de tâche ici", () => {
    render(<DemHorsFile company={bundle()} onRetour={jest.fn()} />);
    expect(screen.queryByText(/Issue de l'échange/)).toBeNull();
    expect(screen.getByText(/aucune carte ne se ferme ici/)).toBeInTheDocument();
  });

  /**
   * CE QUI A CHANGÉ LE 01/09/2026, ET CE QUI NE DOIT PAS CHANGER AVEC.
   *
   * La fiche sait désormais consigner un échange — sans quoi un prospect en
   * attente entre deux étapes n'a aucune surface le jour où il répond (cf.
   * l'en-tête de `DemEchange`). Mais le geste reste REPLIÉ : la carte s'ouvre
   * sur ce qui sert à tenir la conversation, pas sur un formulaire. Déplier par
   * défaut ferait de cette fiche un écran de saisie, ce qu'elle n'est pas.
   */
  it("offre de consigner un échange, replié tant qu'on ne le demande pas", () => {
    render(<DemHorsFile company={bundle()} onRetour={jest.fn()} />);
    const ouvrir = screen.getByRole("button", { name: /Consigner un échange/ });
    expect(screen.queryByText(/Ce qui s'est passé/)).toBeNull();

    fireEvent.click(ouvrir);
    expect(screen.getByText(/Ce qui s'est passé/)).toBeInTheDocument();
    // Aucune pièce n'est cochée d'avance : la preuve d'un envoi ne se coche pas
    // toute seule.
    for (const c of screen.getAllByRole("checkbox")) expect(c).not.toBeChecked();
  });
});
