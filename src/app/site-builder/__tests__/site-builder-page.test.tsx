import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SiteBuilderV2ListPage from "../page";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
jest.mock("@/components/layout/AppLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Les boîtes d'import tirent JSZip et l'éditeur : hors sujet pour ce test.
jest.mock("@/components/site-builder/claude-design/DesignImportDialog", () => ({
  DesignImportDialog: () => null,
}));
jest.mock("@/components/site-builder/claude-design/MultiPageImportDialog", () => ({
  MultiPageImportDialog: () => null,
}));
jest.mock("@/components/site-builder/claude-design/CreateDemoSiteDialog", () => ({
  CreateDemoSiteDialog: ({ template }: { template: { name: string } | null }) =>
    template ? <div>Créer un site à partir de « {template.name} »</div> : null,
}));

const authedFetch = jest.fn();
jest.mock("@/utils/authedFetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));

const SITES = [
  { id: "t1", name: "Plombier", is_claude_design: true, is_template: true, source_template_id: null },
  { id: "t2", name: "Couvreur", is_claude_design: true, is_template: true, source_template_id: null },
  {
    id: "d1", name: "Dupont SARL", is_claude_design: true, is_template: false,
    source_template_id: "t1", build_stage: "en_cours",
  },
  {
    id: "d2", name: "Martin SAS", is_claude_design: true, is_template: false,
    source_template_id: "t1", build_stage: "pret", is_published: true, published_subdomain: "martin",
  },
  {
    id: "d3", name: "Legacy Corp", is_claude_design: true, is_template: false,
    source_template_id: null, build_stage: "a_faire",
  },
  { id: "c1", name: "Site classique", is_claude_design: false, is_template: false },
];

/** Les onglets Radix basculent sur mousedown, pas sur un click synthétique. */
const selectTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }));

const openClaudeTab = async () => {
  render(<SiteBuilderV2ListPage />);
  await screen.findByRole("tab", { name: /Claude Design \(5\)/ });
  selectTab(/Claude Design \(5\)/);
  return screen.findByRole("tab", { name: /Templates \(2\)/ });
};

/** Le panneau visible de l'onglet Claude Design (celui qui porte les cartes). */
const claudePanel = () => screen.getAllByRole("tabpanel").at(-1) as HTMLElement;

/** La carte (Card) qui porte ce nom de site. */
const cardOf = (panel: HTMLElement, name: string) =>
  within(panel).getByText(name).closest(".bg-card") as HTMLElement;

beforeEach(() => {
  authedFetch.mockReset();
  authedFetch.mockResolvedValue({ ok: true, json: async () => SITES });
  window.confirm = jest.fn(() => false);
});

describe("Site Builder — séparation template / site démo", () => {
  it("compte les deux espaces séparément dans les sous-onglets", async () => {
    await openClaudeTab();
    expect(screen.getByRole("tab", { name: /Templates \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sites démo \(3\)/ })).toBeInTheDocument();
  });

  it("ne montre que les modèles dans l'espace template", async () => {
    await openClaudeTab();
    const panel = claudePanel();
    expect(within(panel).getByText("Plombier")).toBeInTheDocument();
    expect(within(panel).getByText("Couvreur")).toBeInTheDocument();
    expect(within(panel).queryByText("Dupont SARL")).not.toBeInTheDocument();
    // Le site classique reste dans son propre onglet.
    expect(within(panel).queryByText("Site classique")).not.toBeInTheDocument();
  });

  it("affiche sur chaque template le nombre de sites qui en sont issus", async () => {
    await openClaudeTab();
    const panel = claudePanel();
    expect(within(panel).getByText(/2 sites démo créés/)).toBeInTheDocument();
    expect(within(panel).getByText(/Aucun site démo pour l'instant/)).toBeInTheDocument();
  });

  it("ne montre que les démos dans l'espace démo, avec leur template d'origine", async () => {
    await openClaudeTab();
    selectTab(/Sites démo \(3\)/);

    const panel = claudePanel();
    await within(panel).findByText("Dupont SARL");
    expect(within(panel).getByText("Martin SAS")).toBeInTheDocument();
    expect(within(panel).queryByText("Plombier")).not.toBeInTheDocument();
    expect(within(panel).getAllByText(/Depuis « Plombier »/)).toHaveLength(2);
    // Une démo créée avant le suivi des templates est signalée, pas cachée.
    expect(within(panel).getByText("Origine inconnue")).toBeInTheDocument();
  });

  it("passe à l'espace démo filtré quand on clique le compteur d'un template", async () => {
    await openClaudeTab();
    fireEvent.click(screen.getByText(/2 sites démo créés/));

    const panel = claudePanel();
    await within(panel).findByText("Dupont SARL");
    expect(within(panel).getByText("Martin SAS")).toBeInTheDocument();
    expect(within(panel).queryByText("Legacy Corp")).not.toBeInTheDocument();
    expect((within(panel).getByLabelText("Template :") as HTMLSelectElement).value).toBe("t1");
  });

  it("isole les démos sans template exploitable", async () => {
    await openClaudeTab();
    selectTab(/Sites démo \(3\)/);

    const panel = claudePanel();
    const select = await within(panel).findByLabelText("Template :");
    fireEvent.change(select, { target: { value: "__none__" } });

    expect(within(panel).getByText("Legacy Corp")).toBeInTheDocument();
    expect(within(panel).queryByText("Dupont SARL")).not.toBeInTheDocument();
  });

  it("prévient que les sites démo survivent à la suppression de leur template", async () => {
    await openClaudeTab();
    const panel = claudePanel();
    const plombier = cardOf(panel, "Plombier");
    fireEvent.click(within(plombier).getByTitle("Supprimer ce template"));

    const message = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain("Plombier");
    expect(message).toContain("2 sites démo");
    expect(message).toContain("ne seront PAS supprimés");
  });

  it("supprime un site démo sans avertissement de modèle", async () => {
    (window.confirm as jest.Mock).mockReturnValue(true);
    authedFetch
      .mockResolvedValueOnce({ ok: true, json: async () => SITES })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await openClaudeTab();
    selectTab(/Sites démo \(3\)/);
    const panel = claudePanel();
    await within(panel).findByText("Dupont SARL");
    fireEvent.click(within(cardOf(panel, "Dupont SARL")).getByTitle("Supprimer ce site démo"));

    expect((window.confirm as jest.Mock).mock.calls[0][0]).toBe("Supprimer le site « Dupont SARL » ?");
    await waitFor(() =>
      expect(authedFetch).toHaveBeenCalledWith("/api/site-builder/sites/d1", { method: "DELETE" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Sites démo \(2\)/ })).toBeInTheDocument(),
    );
  });

  it("propose de créer un site démo depuis un template", async () => {
    await openClaudeTab();
    const panel = claudePanel();
    fireEvent.click(within(cardOf(panel, "Plombier")).getByRole("button", { name: /Site démo/ }));

    expect(await screen.findByText(/Créer un site à partir de « Plombier »/)).toBeInTheDocument();
  });
});
