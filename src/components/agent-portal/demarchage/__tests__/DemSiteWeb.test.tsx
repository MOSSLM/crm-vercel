import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemSiteWeb } from "../DemSiteWeb";

const mockFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({
  authedFetch: (...a: unknown[]) => mockFetch(...a),
}));
jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));

/**
 * LA LIGNE « SITE » — le seul endroit du CRM où un humain tranche.
 *
 * Ce que ce fichier garde tient en une phrase : on ne doit jamais pouvoir
 * écrire, ni même laisser croire, une chose qu'on n'a pas vérifiée. D'où trois
 * verrous testés — l'adresse invalide qui ne part pas, la case qui refuse de
 * cohabiter avec une adresse, et la case déjà constatée qui ne se décoche pas
 * (la table des constats est append-only : elle ne se dédit pas).
 */

const ok = () => ({ ok: true, json: async () => ({ ok: true }) });

const monter = (over: Partial<React.ComponentProps<typeof DemSiteWeb>> = {}) => {
  const onEnregistre = jest.fn();
  render(
    <DemSiteWeb
      entrepriseId={42}
      nom="FA PLOMBERIE"
      ville="Royan"
      url={null}
      etatSite="inconnu"
      constateLe={null}
      onEnregistre={onEnregistre}
      {...over}
    />,
  );
  return { onEnregistre };
};

const champ = () => screen.getByLabelText("Adresse du site de l'entreprise");
const caseAucunSite = () => screen.getByRole("checkbox");

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(ok());
});

describe("DemSiteWeb — chercher, corriger, constater", () => {
  /**
   * Le CRM sait chercher tout seul et bute sur le CAPTCHA de Google
   * (cf. CLAUDE.md). Un humain qui clique est la seule méthode qui marche : le
   * bouton n'appelle donc RIEN, il ouvre un onglet.
   */
  it("ouvre une recherche Google sur le nom et la ville, sans rien appeler", () => {
    const open = jest.fn();
    Object.defineProperty(window, "open", { value: open, writable: true });
    monter();
    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    expect(open.mock.calls[0][0]).toBe("https://www.google.com/search?q=FA%20PLOMBERIE%20Royan");
    expect(open.mock.calls[0][1]).toBe("_blank");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("ne propose « Enregistrer » que si l'adresse a changé", () => {
    monter({ url: "https://plombier-royan.fr", etatSite: "present" });
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).toBeNull();
    fireEvent.change(champ(), { target: { value: "https://plombier-royan.fr/contact" } });
    expect(screen.getByRole("button", { name: /Enregistrer/ })).toBeInTheDocument();
  });

  it("écrit l'adresse saisie sur la fiche et rejoue l'écran", async () => {
    const { onEnregistre } = monter();
    fireEvent.change(champ(), { target: { value: "plombier-royan.fr" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    await screen.findByRole("button", { name: /Enregistrer/ });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/agent/demarchage/site");
    expect(JSON.parse(String(init.body))).toEqual({ entreprise_id: 42, url: "plombier-royan.fr" });
    expect(onEnregistre).toHaveBeenCalled();
  });

  /**
   * Une adresse fautive écrite en base sortirait la fiche du stock « sans
   * site » sans que rien ne le signale : on la refuse AVANT le réseau, la route
   * la refusant de son côté.
   */
  it("refuse une saisie qui n'est pas une adresse, sans même appeler la route", () => {
    monter();
    fireEvent.change(champ(), { target: { value: "il n'en a pas" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("déclare l'absence quand le champ est vide", async () => {
    const { onEnregistre } = monter();
    fireEvent.click(caseAucunSite());
    await screen.findByRole("checkbox");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ entreprise_id: 42, aucun_site: true });
    expect(onEnregistre).toHaveBeenCalled();
  });

  it("verrouille la case tant qu'une adresse est saisie — les deux se contredisent", () => {
    monter({ url: "https://plombier-royan.fr", etatSite: "present" });
    expect(caseAucunSite()).toBeDisabled();
    expect(caseAucunSite()).not.toBeChecked();
  });

  it("montre l'absence déjà constatée, cochée et non décochable", () => {
    monter({ etatSite: "absent", constateLe: "2026-08-17T10:00:00.000Z" });
    expect(caseAucunSite()).toBeChecked();
    // Append-only : on ne retire pas un constat, on en pose un autre en
    // saisissant une adresse.
    expect(caseAucunSite()).toBeDisabled();
  });

  /** Une case décochée veut dire « on ne sait pas », jamais « il a un site ». */
  it("écrit l'état courant en clair à côté de la case", () => {
    monter();
    expect(screen.getByText("sans site · à vérifier")).toBeInTheDocument();
  });

  it("remet le champ à la fiche affichée quand on change de prospect", () => {
    const { rerender } = render(
      <DemSiteWeb
        entrepriseId={1}
        nom="A"
        ville="Lyon"
        url="https://a.fr"
        etatSite="present"
        constateLe={null}
        onEnregistre={jest.fn()}
      />,
    );
    // Sans ça, l'adresse du précédent reste à l'écran et se ferait enregistrer
    // sur le suivant au premier clic.
    rerender(
      <DemSiteWeb
        entrepriseId={2}
        nom="B"
        ville="Lyon"
        url={null}
        etatSite="inconnu"
        constateLe={null}
        onEnregistre={jest.fn()}
      />,
    );
    expect(champ()).toHaveValue("");
  });
});
