import React from "react";
import { render, screen } from "@testing-library/react";
import { PipelineMatrix } from "../PipelineMatrix";
import type { BoardItem, BulkHandlers, MatrixHandlers } from "../types";

/**
 * La colonne « Plaquette » — et surtout ses DEUX PDF.
 *
 * CE QUI SE JOUE ICI EST UN CHOIX DE FORMAT, PAS UN BOUTON DE PLUS. La plaquette
 * ne part plus en lien mais en PDF que l'agent joint lui-même, et les deux
 * destinations n'attendent pas le même document : l'A4 se joint à un mail, le
 * gabarit mobile sort sept pages au format téléphone — c'est celui qu'on dépose
 * dans WhatsApp, où un A4 arrive en vignette qu'il faut pincer pour lire. Le
 * second existait en maquette, paginé pour l'impression, et n'avait AUCUN chemin
 * depuis le CRM : `veutImprimer` exigeait `?a4`.
 *
 * Ce que le test tient, c'est la couture entre les deux moitiés du geste : la
 * cellule compose `?imprimer` sans `a4` pour le mobile, et la page publique lit
 * exactement ce paramètre-là (`page-jeton.test.tsx`). Une des deux qui bougerait
 * seule rendrait un bouton silencieusement inopérant — il ouvrirait bien un
 * onglet, mais sur le document de l'autre format, ou sans boîte d'impression.
 */

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() }),
}));

const URL_PLAQUETTE = "https://app.exemple.fr/plaquette/a1b2c3d4e5f60718";

function item(over: Partial<BoardItem> & { id: string; name: string }): BoardItem {
  return {
    entreprise_id: 1,
    pipeline_id: null,
    company_name: over.name,
    company_url: null,
    logo_url: null,
    ville: "Annecy",
    priorite: null,
    montant: null,
    type: null,
    mrr: null,
    recurrence_months: null,
    tags: null,
    enriched: false,
    enrichment: null,
    project: null,
    site: null,
    audit: null,
    agent: null,
    missing_for_site: [],
    column: 1,
    ...over,
  };
}

const noopHandlers: MatrixHandlers = {
  onEnrich: jest.fn(),
  onValidateEnrich: jest.fn(),
  onCreateSite: jest.fn(),
  onRegenerateSite: jest.fn(),
  onValidateSite: jest.fn(),
  onCreateAudit: jest.fn(),
  onValidateAudit: jest.fn(),
  onAssign: jest.fn(),
  onMove: jest.fn(),
  onDetails: jest.fn(),
  onNotes: jest.fn(),
  onArchive: jest.fn(),
  onUnarchive: jest.fn(),
};

const noopBulk = {
  onEnrich: jest.fn(),
  onComplete: jest.fn(),
  onValidateEnrich: jest.fn(),
  onCreateSites: jest.fn(),
  onRegenerateSites: jest.fn(),
  onTirerImages: jest.fn(),
  onAnalyserSites: jest.fn(),
  onMesurerPsi: jest.fn(),
  onPreparerVignettes: jest.fn(),
  onValidateSites: jest.fn(),
  onPublierSites: jest.fn(),
  onCreateAudits: jest.fn(),
  onValidateAudits: jest.fn(),
  onCreerPlaquettes: jest.fn(),
  onMove: jest.fn(),
  onArchive: jest.fn(),
} satisfies BulkHandlers;

function renderCellule(plaquette: BoardItem["plaquette"]) {
  render(
    <PipelineMatrix
      items={[item({ id: "b1", name: "Alpha", entreprise_id: 11, plaquette })]}
      agents={[]}
      templates={[{ id: "t1", name: "Template", is_claude_design: true }]}
      pipelines={[]}
      templateId="t1"
      onTemplateChange={jest.fn()}
      loading={false}
      working={null}
      onRefresh={jest.fn()}
      handlers={noopHandlers}
      bulk={noopBulk}
      hasPlaquette
    />,
  );
}

const prete = { url: URL_PLAQUETTE, cree_le: "2026-08-20T09:00:00Z", vues: 0, vu_le: null };

describe("les deux PDF de la plaquette", () => {
  it("ouvre l'A4 avec sa boîte d'impression", () => {
    renderCellule(prete);
    expect(screen.getByRole("link", { name: /PDF A4/ })).toHaveAttribute(
      "href",
      `${URL_PLAQUETTE}?a4&imprimer`,
    );
  });

  it("ouvre le mobile sans `a4` — c'est son absence qui sert le gabarit téléphone", () => {
    // `?a4` est le SEUL discriminant de format côté page : l'ajouter au lien
    // mobile servirait la feuille, et l'agent enregistrerait deux fois le même
    // PDF sans voir la différence avant de l'avoir joint.
    renderCellule(prete);
    expect(screen.getByRole("link", { name: /PDF mobile/ })).toHaveAttribute(
      "href",
      `${URL_PLAQUETTE}?imprimer`,
    );
  });

  it("n'offre aucun PDF tant que le jeton n'est pas frappé", () => {
    // Sans jeton il n'y a pas d'URL nominative : imprimer le dépliant collectif
    // rendrait un document qui ne nomme personne et ne porte aucune démo.
    renderCellule({ url: null, cree_le: null, vues: 0, vu_le: null });
    expect(screen.queryByRole("link", { name: /PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Préparer/ })).toBeInTheDocument();
  });
});
