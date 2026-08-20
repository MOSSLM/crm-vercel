import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PipelineMatrix } from "../PipelineMatrix";
import type { BoardItem, BulkHandlers, MatrixHandlers } from "../types";

/**
 * « Créer les plaquettes » dans la barre de sélection.
 *
 * L'action a UNE particularité qui la distingue de toutes ses voisines, et
 * c'est elle qu'on garde ici : son éligibilité ne dépend d'AUCUNE étape du
 * pipeline. Pas de site, pas d'audit, pas de projet enrichi — il suffit d'une
 * entreprise, parce que la plaquette est le document de la cohorte qui n'a
 * justement rien de tout ça. La brancher par erreur sur `site` ou `audit`
 * (comme ses deux voisines de barre) la rendrait vide exactement pour les trois
 * cents entreprises à qui elle est destinée.
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

/** La cohorte B : ni site, ni audit, ni enrichissement validé. */
const sansRien = item({ id: "b1", name: "Alpha", entreprise_id: 11 });
/** Une ligne d'opportunité sans fiche entreprise : aucun jeton possible. */
const sansEntreprise = item({ id: "b2", name: "Beta", entreprise_id: null });

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

function renderMatrix(rows: BoardItem[]) {
  const bulk = {
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

  render(
    <PipelineMatrix
      items={rows}
      agents={[]}
      templates={[{ id: "t1", name: "Template", is_claude_design: true }]}
      pipelines={[]}
      templateId="t1"
      onTemplateChange={jest.fn()}
      loading={false}
      working={null}
      onRefresh={jest.fn()}
      handlers={noopHandlers}
      bulk={bulk}
    />,
  );
  return bulk;
}

const bar = () => within(screen.getByRole("group", { name: "Actions de masse" }));
const bouton = () => bar().getByRole("button", { name: /Créer les plaquettes/ });

describe("Créer les plaquettes — l'action de masse", () => {
  it("prend les lignes qui n'ont ni site ni audit : c'est toute la cohorte visée", () => {
    const bulk = renderMatrix([sansRien]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    fireEvent.click(bouton());

    expect(bulk.onCreerPlaquettes).toHaveBeenCalledTimes(1);
    expect(bulk.onCreerPlaquettes.mock.calls[0][0].map((i: BoardItem) => i.id)).toEqual(["b1"]);
  });

  it("écarte les lignes sans fiche entreprise — il n'y a rien à quoi rattacher un jeton", () => {
    const bulk = renderMatrix([sansRien, sansEntreprise]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    fireEvent.click(bouton());

    expect(bulk.onCreerPlaquettes.mock.calls[0][0].map((i: BoardItem) => i.id)).toEqual(["b1"]);
  });

  it("annonce le nombre d'éligibles sur le bouton", () => {
    // Le compte est ce qui permet de vérifier la sélection AVANT de cliquer :
    // deux lignes cochées, une seule éligible, ça doit se voir.
    renderMatrix([sansRien, sansEntreprise]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    expect(bouton()).toHaveTextContent("1");
  });

  it("reste inerte quand la sélection ne porte aucune entreprise", () => {
    renderMatrix([sansEntreprise]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    expect(bouton()).toBeDisabled();
  });
});
