import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Atelier } from "../Atelier";

/**
 * L'ATELIER, ET LES TROIS CHOSES QU'IL DOIT DIRE SANS SE TROMPER.
 *
 * C'est l'écran qu'on ouvre à l'extérieur, souvent vingt secondes entre deux
 * rendez-vous. Il n'avait aucun test : sa route est réservée aux admins, donc
 * un navigateur sans session ne montre qu'un état d'erreur, et rien ne se
 * vérifiait qu'à l'œil sur l'appareil de quelqu'un.
 *
 * 1. LES TROIS LIEUX SE COMPARENT. « 3 d'ici » ne veut rien dire sans « 340 au
 *    bureau » : c'est la comparaison qui dit s'il faut rentrer.
 * 2. « PRÊTES » ET « LOGO » NE SE MÉLANGENT PAS. Le logo ne bloque aucune
 *    fabrication ; le compter parmi les causes rendrait 98 % du parc « pas
 *    prêt » pour une raison que personne ne peut combler.
 * 3. UN LOGO QU'ON PEUT ALLER CHERCHER N'EST PAS UN LOGO QUI N'EXISTE PAS. Les
 *    additionner ferait passer une impossibilité pour du retard.
 */

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const fetchMock = jest.fn();
jest.mock("@/utils/authedFetch", () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
}));

/** Les chiffres réels du lot 2 « Froides » au 27/08, pour que le test parle. */
const REPONSE = {
  lots: [
    {
      lotId: 2,
      nom: "Froides",
      note: null,
      creeLe: "2026-08-13T09:00:00Z",
      total: 524,
      // Les COUVERTS, pas les manques : c'est ce que rend `lireCouverture`,
      // appliqué côté route. Le composant reçoit déjà la forme lue.
      couverts: {
        siret: 524,
        donnees: 484,
        constat: 512,
        demo: 24,
        audit: 24,
        proprietaire: 224,
        sequence: 0,
      },
    },
  ],
  // Déjà lu, comme les lots : `lirePretDemo` s'applique côté route. Les causes
  // arrivent donc rangées par EFFORT — les tags d'abord, le téléphone en
  // dernier — et les causes à zéro sont déjà tombées.
  pretDemo: [
    {
      lotId: 2,
      total: 524,
      pretes: 322,
      manques: [
        { cle: "service_tags", nombre: 196 },
        { cle: "ville", nombre: 20 },
        { cle: "code_postal", nombre: 20 },
        { cle: "telephone", nombre: 1 },
      ],
      logo: { avec: 12, surLeSite: 205, surReseau: 0, introuvable: 105 },
    },
  ],
  lissage: { serveur: 3, local: 340, humain: 7, passesOuvertes: 1 },
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(REPONSE) }),
  );
});

describe("l'atelier", () => {
  it("compare les trois lieux, et dit ce qui attend le bureau", async () => {
    render(<Atelier />);
    await screen.findByText("La file de lissage");

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    // L'honnêteté est ÉCRITE, pas seulement comptée : on doit savoir quoi
    // lancer en rentrant, pas découvrir la file en ouvrant son portable.
    expect(screen.getByText(/la machine/)).toBeInTheDocument();
    expect(screen.getByText(/runner\.mjs --boucle/)).toBeInTheDocument();
  });

  it("n'offre pas d'avancer une file vide côté serveur", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...REPONSE, lissage: { ...REPONSE.lissage, serveur: 0 } }),
      }),
    );
    render(<Atelier />);
    const bouton = await screen.findByRole("button", { name: /Rien à avancer d'ici/ });
    expect(bouton).toBeDisabled();
  });

  it("déplie un lot sur les causes de blocage, pas sur un total", async () => {
    render(<Atelier />);
    fireEvent.click(await screen.findByRole("button", { name: /Froides/ }));

    await waitFor(() => expect(screen.getByText("322")).toBeInTheDocument());
    // LA CAUSE, pas « 202 pas prêtes » : un total n'indique aucun geste.
    expect(screen.getByText("Sans tag de service")).toBeInTheDocument();
    expect(screen.getByText("196")).toBeInTheDocument();
    // Et le logo N'EST PAS une cause : il n'apparaît pas dans cette liste.
    expect(screen.queryByText(/^Sans logo$/)).toBeNull();
  });

  it("sépare les logos à prendre de ceux qui n'existent nulle part", async () => {
    render(<Atelier />);
    fireEvent.click(await screen.findByRole("button", { name: /Froides/ }));

    await screen.findByText(/205 sans logo en ont pourtant un/);
    // 105 introuvables ne sont pas du retard : ces fiches n'ont aucune URL.
    expect(screen.getByText(/aucune URL/)).toBeInTheDocument();
    // Les deux ne sont JAMAIS additionnés en « 310 à faire ».
    expect(screen.queryByText(/310/)).toBeNull();
  });
});
