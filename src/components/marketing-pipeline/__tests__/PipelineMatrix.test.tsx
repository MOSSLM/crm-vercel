import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PipelineMatrix } from "../PipelineMatrix";
import type { BoardItem, BulkHandlers, MatrixHandlers } from "../types";

jest.mock("next/link", () => ({
  __esModule: true,
  // `title` compris : c'est par lui qu'on retrouve les liens des cartes.
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

/** Une ligne du board, à l'étape voulue selon ce qu'on lui donne. */
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

const project = (validated: boolean) => ({
  id: "p1",
  pret_pour_lm: true,
  enrichment_validated: validated,
  statut: "framer",
  enrichment_error: null,
  enrichment_attempts: null,
});

/** À enrichir (rien n'a tourné). */
const aEnrichir = item({ id: "a", name: "Alpha" });
/** Enrichie, en attente de validation des données. */
const aValider = item({ id: "b", name: "Beta", enriched: true, project: project(false) });
/** Validée : c'est le site démo qu'il faut faire. */
const aFaireSite = item({ id: "c", name: "Gamma", enriched: true, project: project(true) });
/** Site validé : c'est l'audit qu'il faut faire. */
const aFaireAudit = item({
  id: "d",
  name: "Delta",
  enriched: true,
  project: project(true),
  site: { id: "s1", name: "s", build_stage: "pret", is_published: false, url: null, is_claude_design: true },
});

const ROWS = [aEnrichir, aValider, aFaireSite, aFaireAudit];

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
};

/**
 * Lignes portant des variables manquantes et des tickets — le matériel des
 * tris/filtres « complétude » et « tickets ».
 */
const TRIAGE_ROWS: BoardItem[] = [
  item({ id: "m0", name: "Zeta", missing_for_site: [] }),
  item({ id: "m3", name: "Yota", missing_for_site: ["Ville", "Téléphone", "Note moyenne"] }),
  item({
    id: "m1",
    name: "Xena",
    missing_for_site: ["Ville"],
    notes: { open: 2, total: 3, open_subjects: ["site"] },
  }),
];

function renderRows(rows: BoardItem[], handlers: MatrixHandlers = noopHandlers) {
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
      handlers={handlers}
      bulk={{
        onEnrich: jest.fn(),
        onValidateEnrich: jest.fn(),
        onCreateSites: jest.fn(),
        onValidateSites: jest.fn(),
        onCreateAudits: jest.fn(),
        onValidateAudits: jest.fn(),
        onAssign: jest.fn(),
        onMove: jest.fn(),
      }}
    />,
  );
}

function renderMatrix(bulk: Partial<BulkHandlers> = {}) {
  const bulkHandlers: BulkHandlers = {
    onEnrich: jest.fn(),
    onValidateEnrich: jest.fn(),
    onCreateSites: jest.fn(),
    onValidateSites: jest.fn(),
    onCreateAudits: jest.fn(),
    onValidateAudits: jest.fn(),
    onAssign: jest.fn(),
    onMove: jest.fn(),
    ...bulk,
  };
  render(
    <PipelineMatrix
      items={ROWS}
      agents={[]}
      templates={[{ id: "t1", name: "Template", is_claude_design: true }]}
      pipelines={[]}
      templateId="t1"
      onTemplateChange={jest.fn()}
      loading={false}
      working={null}
      onRefresh={jest.fn()}
      handlers={noopHandlers}
      bulk={bulkHandlers}
    />,
  );
  return bulkHandlers;
}

const rowCheckbox = (name: string) => screen.getByRole("checkbox", { name: `Sélectionner ${name}` });
/** La barre d'actions de masse — les cartes ont des boutons de même nom. */
const bar = () => within(screen.getByRole("group", { name: "Actions de masse" }));
const rowNames = () => screen.getAllByRole("checkbox", { name: /^Sélectionner / }).map((c) => c.getAttribute("aria-label"));

describe("PipelineMatrix — sélection multiple", () => {
  it("n'affiche la barre d'actions de masse qu'une fois des lignes cochées", async () => {
    renderMatrix();
    expect(screen.queryByText(/sélectionnée/)).not.toBeInTheDocument();

    fireEvent.click(rowCheckbox("Alpha"));
    fireEvent.click(rowCheckbox("Beta"));

    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
  });

  it("envoie toutes les lignes cochées à l'enrichissement d'un coup", async () => {
    const bulk = renderMatrix();
    fireEvent.click(rowCheckbox("Alpha"));
    fireEvent.click(rowCheckbox("Gamma"));

    fireEvent.click(bar().getByRole("button", { name: /^Enrichir/ }));

    expect(bulk.onEnrich).toHaveBeenCalledTimes(1);
    const [items, overwrite] = (bulk.onEnrich as jest.Mock).mock.calls[0];
    expect(items.map((i: BoardItem) => i.id)).toEqual(["a", "c"]);
    expect(overwrite).toBe(false);
  });

  it("« Tout sélectionner » coche les lignes affichées", async () => {
    renderMatrix();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tout sélectionner" }));
    expect(screen.getByText("4 sélectionnées")).toBeInTheDocument();
  });

  it("ne passe à chaque action que les lignes qui la concernent", async () => {
    const bulk = renderMatrix();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tout sélectionner" }));

    // Créer les sites : seules les lignes sans site.
    fireEvent.click(bar().getByRole("button", { name: /Créer les sites/ }));
    expect((bulk.onCreateSites as jest.Mock).mock.calls[0][0].map((i: BoardItem) => i.id)).toEqual(["a", "b", "c"]);

    // Valider les données : seules celles qui ont un projet non validé.
    fireEvent.click(bar().getByRole("button", { name: /Valider données/ }));
    expect((bulk.onValidateEnrich as jest.Mock).mock.calls[0][0].map((i: BoardItem) => i.id)).toEqual(["b"]);
  });

  it("propage la case « Écraser » au ré-enrichissement", async () => {
    const bulk = renderMatrix();
    fireEvent.click(rowCheckbox("Alpha"));
    fireEvent.click(bar().getByRole("checkbox", { name: /Écraser/ }));
    fireEvent.click(bar().getByRole("button", { name: /^Ré-enrichir/ }));

    expect((bulk.onEnrich as jest.Mock).mock.calls[0][1]).toBe(true);
  });
});

describe("PipelineMatrix — filtre et tri par étape", () => {
  it("ne garde que les lignes dont l'étape en cours est celle choisie", async () => {
    renderMatrix();
    fireEvent.change(screen.getByTitle(/Ne garder que les lignes/), { target: { value: "2" } });

    // Étape 3 (index 2) = Site démo : la ligne validée mais sans site.
    expect(rowNames()).toEqual(["Sélectionner Gamma"]);
  });

  it("garde les compteurs d'en-tête stables quand on filtre sur une étape", async () => {
    renderMatrix();
    const head = screen.getByTitle(/l'étape « Audit »/);
    expect(within(head).getByText("1")).toBeInTheDocument(); // 1 ligne en cours d'audit

    fireEvent.change(screen.getByTitle(/Ne garder que les lignes/), { target: { value: "0" } });

    expect(rowNames()).toEqual(["Sélectionner Alpha"]);
    // Le compteur de la colonne Audit ne tombe pas à zéro : sinon le filtre par
    // en-tête ne serait plus lisible.
    expect(within(screen.getByTitle(/l'étape « Audit »/)).getByText("1")).toBeInTheDocument();
  });

  it("filtre aussi en cliquant sur l'en-tête de colonne, et le clic suivant l'enlève", async () => {
    renderMatrix();
    const auditHead = screen.getByTitle(/l'étape « Audit »/);
    fireEvent.click(auditHead);
    expect(rowNames()).toEqual(["Sélectionner Delta"]);

    fireEvent.click(screen.getByTitle("Enlever le filtre"));
    expect(rowNames()).toHaveLength(4);
  });

  it("trie de la moins avancée à la plus avancée, et l'inverse", async () => {
    renderMatrix();
    const sort = screen.getByTitle("Ordre des lignes");

    fireEvent.change(sort, { target: { value: "stage-asc" } });
    expect(rowNames()).toEqual([
      "Sélectionner Alpha",
      "Sélectionner Beta",
      "Sélectionner Gamma",
      "Sélectionner Delta",
    ]);

    fireEvent.change(sort, { target: { value: "stage-desc" } });
    expect(rowNames()).toEqual([
      "Sélectionner Delta",
      "Sélectionner Gamma",
      "Sélectionner Beta",
      "Sélectionner Alpha",
    ]);
  });
});

describe("PipelineMatrix — tri et filtre sur la complétude et les tickets", () => {
  it("trie par nombre de variables manquantes, dans les deux sens", () => {
    renderRows(TRIAGE_ROWS);
    const sort = screen.getByTitle("Ordre des lignes");

    fireEvent.change(sort, { target: { value: "missing-desc" } });
    expect(rowNames()).toEqual(["Sélectionner Yota", "Sélectionner Xena", "Sélectionner Zeta"]);

    fireEvent.change(sort, { target: { value: "missing-asc" } });
    expect(rowNames()).toEqual(["Sélectionner Zeta", "Sélectionner Xena", "Sélectionner Yota"]);
  });

  it("remonte les lignes qui portent un ticket en cours", () => {
    renderRows(TRIAGE_ROWS);
    fireEvent.change(screen.getByTitle("Ordre des lignes"), { target: { value: "notes" } });
    expect(rowNames()[0]).toBe("Sélectionner Xena");
  });

  it("filtre sur les fiches incomplètes puis complètes", () => {
    renderRows(TRIAGE_ROWS);
    const dataFilter = screen.getByTitle(/Complétude des variables/);

    fireEvent.change(dataFilter, { target: { value: "incomplete" } });
    expect(rowNames()).toEqual(["Sélectionner Yota", "Sélectionner Xena"]);

    fireEvent.change(dataFilter, { target: { value: "complete" } });
    expect(rowNames()).toEqual(["Sélectionner Zeta"]);
  });

  it("filtre sur les lignes qui ont un ticket en cours", () => {
    renderRows(TRIAGE_ROWS);
    fireEvent.change(screen.getByTitle(/Tickets signalés/), { target: { value: "open" } });
    expect(rowNames()).toEqual(["Sélectionner Xena"]);
  });

  it("ouvre le fil des tickets depuis le badge de la ligne", () => {
    const onNotes = jest.fn();
    renderRows(TRIAGE_ROWS, { ...noopHandlers, onNotes });
    fireEvent.click(screen.getByTitle("2 ticket(s) en cours — ouvrir le fil"));
    expect(onNotes).toHaveBeenCalledWith(TRIAGE_ROWS[2]);
  });

  it("signale un problème depuis la carte de l'étape, avec le sujet pré-rempli", () => {
    const onNotes = jest.fn();
    renderRows([item({ id: "s", name: "Sigma" })], { ...noopHandlers, onNotes });
    fireEvent.click(screen.getAllByTitle("Signaler un problème (ticket)")[0]);
    expect(onNotes).toHaveBeenCalledWith(expect.objectContaining({ id: "s" }), "enrichment");
  });
});

describe("PipelineMatrix — éditeur d'audit selon la coque", () => {
  const withAudit = item({
    id: "au",
    name: "Omega",
    enriched: true,
    project: { id: "p1", pret_pour_lm: true, enrichment_validated: true, statut: "framer", enrichment_error: null, enrichment_attempts: null },
    site: { id: "s1", name: "s", build_stage: "pret", is_published: false, url: null, is_claude_design: true },
    audit: { id: "a1", statut: "draft", pdf_url: null },
  });

  it("pointe sur la route admin par défaut", () => {
    renderRows([withAudit]);
    expect(screen.getByTitle("Éditer l'audit")).toHaveAttribute("href", "/audits/au");
  });

  it("pointe sur le portail agent en mode agent — la route admin l'en éjecterait", () => {
    render(
      <PipelineMatrix
        items={[withAudit]}
        agents={[]}
        templates={[{ id: "t1", name: "Template", is_claude_design: true }]}
        pipelines={[]}
        templateId="t1"
        onTemplateChange={jest.fn()}
        loading={false}
        working={null}
        onRefresh={jest.fn()}
        handlers={noopHandlers}
        bulk={{
          onEnrich: jest.fn(),
          onValidateEnrich: jest.fn(),
          onCreateSites: jest.fn(),
          onValidateSites: jest.fn(),
          onCreateAudits: jest.fn(),
          onValidateAudits: jest.fn(),
          onMove: jest.fn(),
        }}
        canAssign={false}
        agentMode
      />,
    );
    expect(screen.getByTitle("Éditer l'audit")).toHaveAttribute("href", "/espace-agent/audits/au");
  });
});

describe("PipelineMatrix — refaire le site avec un autre template", () => {
  const withSite = (templateId: string | null, templateName: string | null) =>
    item({
      id: "s",
      name: "Sigma",
      enriched: true,
      project: project(true),
      site: {
        id: "site-1",
        name: "Sigma",
        build_stage: "a_faire",
        is_published: false,
        url: null,
        is_claude_design: true,
        template_id: templateId,
        template_name: templateName,
      },
    });

  it("annonce le remplacement quand le site vient d'un autre template", () => {
    renderRows([withSite("t2", "Chantier")]);
    expect(
      screen.getByTitle('Refaire ce site avec « Template » (il vient de « Chantier »)'),
    ).toBeInTheDocument();
  });

  it("parle de rafraîchissement quand c'est déjà le bon template", () => {
    renderRows([withSite("t1", "Template")]);
    expect(
      screen.getByTitle('Refaire ce site depuis « Template » et reprendre les infos à jour de la fiche'),
    ).toBeInTheDocument();
  });

  it("affiche le template d'origine sur la carte du site", () => {
    renderRows([withSite("t2", "Chantier")]);
    expect(screen.getByText("Chantier")).toBeInTheDocument();
  });
});
