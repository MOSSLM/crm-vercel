import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PipelineMatrix } from "../PipelineMatrix";
import type { BoardItem, BulkHandlers, MatrixHandlers, SequenceRef } from "../types";

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
  onArchive: jest.fn(),
  onUnarchive: jest.fn(),
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

function renderRows(
  rows: BoardItem[],
  handlers: MatrixHandlers = noopHandlers,
  sequences: SequenceRef[] = [],
  bulk: Partial<BulkHandlers> = {},
) {
  const bulkHandlers: BulkHandlers = {
    onEnrich: jest.fn(),
    onComplete: jest.fn(),
    onValidateEnrich: jest.fn(),
    onCreateSites: jest.fn(),
    onTirerImages: jest.fn(),
    onValidateSites: jest.fn(),
    onPublierSites: jest.fn(),
    onCreateAudits: jest.fn(),
    onValidateAudits: jest.fn(),
    onLisser: jest.fn(),
    onCompleterChiffres: jest.fn(),
    onAssign: jest.fn(),
    onMove: jest.fn(),
    onArchive: jest.fn(),
    ...bulk,
  };
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
      bulk={bulkHandlers}
      sequences={sequences}
    />,
  );
  return bulkHandlers;
}

function renderMatrix(bulk: Partial<BulkHandlers> = {}) {
  const bulkHandlers: BulkHandlers = {
    onEnrich: jest.fn(),
    onComplete: jest.fn(),
    onValidateEnrich: jest.fn(),
    onCreateSites: jest.fn(),
    onTirerImages: jest.fn(),
    onValidateSites: jest.fn(),
    onPublierSites: jest.fn(),
    onCreateAudits: jest.fn(),
    onValidateAudits: jest.fn(),
    onAssign: jest.fn(),
    onMove: jest.fn(),
    onArchive: jest.fn(),
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

  it("la case d’en-tête coche la page affichée", async () => {
    renderMatrix();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    expect(screen.getByText("4 sélectionnées")).toBeInTheDocument();
  });

  it("ne passe à chaque action que les lignes qui la concernent", async () => {
    const bulk = renderMatrix();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

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

/**
 * Trouver les lignes incomplètes ne servait à rien tant qu'il fallait ensuite
 * ouvrir chacune leur fiche. Le bouton part donc de là où on les a trouvées — la
 * toolbar, à côté du filtre — et n'emporte QUE les incomplètes : ouvrir la
 * grille sur des lignes qui n'ont rien à compléter n'afficherait aucune colonne.
 */
describe("PipelineMatrix — compléter les données manquantes", () => {
  it("ouvre la grille sur les lignes visibles incomplètes, depuis la toolbar", () => {
    const bulk = renderRows(TRIAGE_ROWS);
    fireEvent.click(screen.getByTitle(/Compléter les variables manquantes des lignes visibles/));
    expect(bulk.onComplete).toHaveBeenCalledTimes(1);
    expect((bulk.onComplete as jest.Mock).mock.calls[0][0].map((r: BoardItem) => r.name)).toEqual([
      "Yota",
      "Xena",
    ]);
  });

  it("ne propose rien quand plus aucune ligne visible n'est incomplète", () => {
    renderRows(TRIAGE_ROWS);
    fireEvent.change(screen.getByTitle(/Complétude des variables/), { target: { value: "complete" } });
    expect(screen.queryByTitle(/Compléter les variables manquantes des lignes visibles/)).toBeNull();
  });

  it("depuis la sélection, n'emporte que les lignes cochées encore incomplètes", () => {
    const bulk = renderRows(TRIAGE_ROWS);
    fireEvent.click(rowCheckbox("Zeta"));
    fireEvent.click(rowCheckbox("Xena"));
    fireEvent.click(bar().getByTitle(/Compléter les variables manquantes des lignes cochées/));
    expect((bulk.onComplete as jest.Mock).mock.calls[0][0].map((r: BoardItem) => r.name)).toEqual(["Xena"]);
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
          onArchive: jest.fn(),
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

describe("PipelineMatrix — tirage des images en masse", () => {
  const withSite = (id: string, name: string, isClaudeDesign: boolean) =>
    item({
      id,
      name,
      enriched: true,
      project: project(true),
      site: {
        id: `site-${id}`,
        name,
        build_stage: "pret",
        is_published: false,
        url: null,
        is_claude_design: isClaudeDesign,
      },
    });

  it("n'envoie au tirage que les designs Claude de la sélection", () => {
    const bulk = renderRows([
      withSite("k", "Kappa", true),
      // Un site d'un autre modèle : aucune zone photo, la route le refuserait.
      withSite("l", "Lambda", false),
      // Pas de site du tout : rien à remplir.
      item({ id: "n", name: "Nu" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    fireEvent.click(bar().getByRole("button", { name: /Tirer les images/ }));

    expect((bulk.onTirerImages as jest.Mock).mock.calls[0][0].map((r: BoardItem) => r.id)).toEqual(["k"]);
  });

  it("écarte une ligne sans entreprise : les services sont ce qui choisit les photos", () => {
    const sansEntreprise = { ...withSite("k", "Kappa", true), entreprise_id: null };
    const bulk = renderRows([sansEntreprise]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    expect(bar().getByRole("button", { name: /Tirer les images/ })).toBeDisabled();
    expect(bulk.onTirerImages).not.toHaveBeenCalled();
  });
});

describe("PipelineMatrix — publication en masse", () => {
  const withSite = (id: string, name: string, site: Partial<NonNullable<BoardItem["site"]>>) =>
    item({
      id,
      name,
      enriched: true,
      project: project(true),
      site: {
        id: `site-${id}`,
        name,
        build_stage: "a_faire",
        is_published: false,
        url: null,
        is_claude_design: true,
        ...site,
      },
    });

  it("emporte tous les sites cochés, publiés compris — republier est le seul moyen de mettre la page à jour", () => {
    const bulk = renderRows([
      withSite("p", "Pi", {}),
      withSite("r", "Rho", { is_published: true, published_subdomain: "rho" }),
      // Pas de site : rien à mettre en ligne.
      item({ id: "s", name: "Sigma" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    fireEvent.click(bar().getByRole("button", { name: /Publier les sites/ }));

    expect((bulk.onPublierSites as jest.Mock).mock.calls[0][0].map((r: BoardItem) => r.id)).toEqual(["p", "r"]);
  });

  it("annonce les republications et les sites pas encore validés avant le clic", () => {
    renderRows([
      withSite("p", "Pi", {}),
      withSite("r", "Rho", { is_published: true, published_subdomain: "rho" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    // « Pi » n'est ni publié ni validé ; « Rho » est déjà en ligne.
    expect(
      bar().getByRole("button", { name: /Publier les sites/ }),
    ).toHaveAttribute(
      "title",
      "Mettre 2 site(s) en ligne sur un sous-domaine tiré du nom de l'entreprise" +
        " — dont 1 déjà publié(s), republié(s) pour reprendre ce qui a changé depuis" +
        ". Attention : 1 pas encore validé(s).",
    );
  });
});

describe("PipelineMatrix — archivage", () => {
  const openRowMenu = (name: string) => {
    const row = screen.getByText(name).closest(".rh") ?? document.body;
    fireEvent.click(within(row as HTMLElement).getByTitle("Options"));
  };

  const handlers = (): MatrixHandlers => ({
    ...noopHandlers,
    onArchive: jest.fn(),
    onUnarchive: jest.fn(),
  });

  it("propose d'archiver l'opportunité ou l'entreprise", () => {
    const h = handlers();
    renderRows([item({ id: "a1", name: "Alpha" })], h);

    openRowMenu("Alpha");
    fireEvent.click(screen.getByText("Archiver l’entreprise…"));

    expect(h.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "entreprise");
  });

  it("distingue l'opportunité seule de la fiche entreprise", () => {
    const h = handlers();
    renderRows([item({ id: "a1", name: "Alpha" })], h);

    openRowMenu("Alpha");
    fireEvent.click(screen.getByText("Archiver l’opportunité…"));

    expect(h.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "opportunite");
  });

  // « Masquer » est un confort de session, « Archiver » une décision : les deux
  // doivent rester proposés côte à côte.
  it("garde « Masquer la ligne » à côté de l'archivage", () => {
    renderRows([item({ id: "a1", name: "Alpha" })]);
    openRowMenu("Alpha");
    expect(screen.getByText("Masquer la ligne")).toBeInTheDocument();
  });

  it("propose de désarchiver — et rien d'autre — quand la ligne est archivée", () => {
    const h = handlers();
    renderRows([item({ id: "a1", name: "Alpha", archived_at: "2026-08-01T10:00:00Z" })], h);

    openRowMenu("Alpha");
    expect(screen.queryByText("Archiver l’entreprise…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Désarchiver"));

    expect(h.onUnarchive).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
  });

  it("badge la ligne archivée avec son motif", () => {
    renderRows([
      item({
        id: "a1",
        name: "Alpha",
        archived_at: "2026-08-01T10:00:00Z",
        archive_reason: "refait_par_concurrent",
        archive_note: "studio-durand.fr",
      }),
    ]);

    expect(screen.getByText("Archivé")).toHaveAttribute(
      "title",
      "A refait son site avec un concurrent — studio-durand.fr",
    );
  });

  it("n'affiche la bascule « Archivés » que si le board la propose", () => {
    renderRows([item({ id: "a1", name: "Alpha" })]);
    expect(screen.queryByText("Archivés")).not.toBeInTheDocument();

    const onToggleArchived = jest.fn();
    render(
      <PipelineMatrix
        items={[item({ id: "a2", name: "Beta" })]}
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
          onComplete: jest.fn(),
          onValidateEnrich: jest.fn(),
          onCreateSites: jest.fn(),
          onRegenerateSites: jest.fn(),
          onValidateSites: jest.fn(),
          onCreateAudits: jest.fn(),
          onValidateAudits: jest.fn(),
          onMove: jest.fn(),
          onArchive: jest.fn(),
        }}
        onToggleArchived={onToggleArchived}
      />,
    );
    fireEvent.click(screen.getByText("Archivés"));
    expect(onToggleArchived).toHaveBeenCalled();
  });
});

describe("PipelineMatrix — archivage en masse", () => {
  // Le motif est demandé une seule fois pour tout le lot : archiver quarante
  // pistes mortes une par une, personne ne le ferait.
  it("passe toutes les lignes cochées au dialogue, en mode entreprise", () => {
    const bulk = renderMatrix();
    fireEvent.click(rowCheckbox("Alpha"));
    fireEvent.click(rowCheckbox("Beta"));

    fireEvent.click(bar().getByRole("button", { name: /Archiver/ }));

    const [items, kind] = (bulk.onArchive as jest.Mock).mock.calls[0];
    expect(items.map((i: BoardItem) => i.id)).toEqual(["a", "b"]);
    expect(kind).toBe("entreprise");
  });
});

describe("PipelineMatrix — trois états de séquence", () => {
  /**
   * LA RÉGRESSION QU'ON TIENT ICI.
   *
   * Passer un prospect en rendez-vous termine son inscription. Tant que le
   * tableau ne lisait que les inscriptions vivantes, cette ligne retombait dans
   * « pas encore en séquence » — le segment qu'on attribue à un agent — et
   * repartait en démarchage le lendemain de sa dernière relance. « Jamais
   * inscrite » et « a fini sa séquence » doivent se filtrer séparément.
   */
  const SEQS: SequenceRef[] = [{ id: "s1", name: "Artisans", status: "on", requireCanaux: [], excludeCanaux: [] }];

  const inscription = (status: string, exitReason: string | null = null) => ({
    enrollmentId: "e1",
    automationId: "s1",
    name: "Artisans",
    status,
    holdReason: null,
    exitReason,
  });

  const ROWS_SEQ: BoardItem[] = [
    item({ id: "n1", name: "Jamais", sequence: null }),
    item({ id: "n2", name: "EnCours", sequence: inscription("active") }),
    item({ id: "n3", name: "Finie", sequence: inscription("finished") }),
    // Le numéro n'a pas de compte WhatsApp : sortie sans qu'un message parte.
    item({ id: "n4", name: "HorsCanal", sequence: inscription("exited", "hors_canal") }),
    // Le prospect a dit non.
    item({ id: "n5", name: "Stoppee", sequence: inscription("exited", "stop") }),
  ];

  const seqFilter = () => screen.getByTitle(/Séquence dans laquelle/);

  it("« À démarcher » réunit le stock vierge et les sorties qui n'ont rien envoyé", () => {
    renderRows(ROWS_SEQ, noopHandlers, SEQS);
    fireEvent.change(seqFilter(), { target: { value: "none" } });
    expect(rowNames()).toEqual(["Sélectionner Jamais", "Sélectionner HorsCanal"]);
  });

  it("« En séquence » ne rend que ce qui travaille encore", () => {
    renderRows(ROWS_SEQ, noopHandlers, SEQS);
    fireEvent.change(seqFilter(), { target: { value: "any" } });
    expect(rowNames()).toEqual(["Sélectionner EnCours"]);
  });

  it("« Déjà démarchée » garde ceux à qui quelque chose est parvenu", () => {
    renderRows(ROWS_SEQ, noopHandlers, SEQS);
    fireEvent.change(seqFilter(), { target: { value: "done" } });
    expect(rowNames()).toEqual(["Sélectionner Finie", "Sélectionner Stoppee"]);
  });

  it("filtrer sur une séquence nommée retient tout ce qui y est passé", () => {
    renderRows(ROWS_SEQ, noopHandlers, SEQS);
    fireEvent.change(seqFilter(), { target: { value: "s1" } });
    expect(rowNames()).toEqual([
      "Sélectionner EnCours",
      "Sélectionner Finie",
      "Sélectionner HorsCanal",
      "Sélectionner Stoppee",
    ]);
  });

  it("la carte nomme la fin au lieu de rappeler à l'inscription", () => {
    renderRows([ROWS_SEQ[2]], noopHandlers, SEQS);
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.getByText("séquence terminée")).toBeInTheDocument();
    expect(screen.queryByText("À inscrire")).not.toBeInTheDocument();
    // Mais la reprise reste à portée de clic — sinon réinscrire un prospect
    // démarché il y a trois mois obligeait à sortir du board.
    expect(screen.getByLabelText("Réinscrire dans une séquence")).toBeInTheDocument();
  });

  it("une sortie pour canal mort revient à inscrire, mais dit pourquoi", () => {
    renderRows([ROWS_SEQ[3]], noopHandlers, SEQS);
    expect(screen.getByText("À inscrire")).toBeInTheDocument();
    expect(screen.getByText(/pas joignable sur ce canal/)).toBeInTheDocument();
  });

  it("et elle ne repropose pas d'un clic la séquence qui vient d'échouer", () => {
    const handlers = { ...noopHandlers, onEnroll: jest.fn() };
    renderRows([ROWS_SEQ[3]], handlers, SEQS);
    // Le bouton de suggestion porterait le nom de la séquence ; il ne doit pas
    // être là. Le déroulant, lui, reste — c'est un choix qu'on peut refaire.
    expect(screen.queryByRole("button", { name: /Séquence conseillée/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Inscrire dans une séquence")).toBeInTheDocument();
  });
});

/**
 * LA PAGINATION, ET CE QU'ELLE NE DOIT PAS CASSER.
 *
 * Le piège tient en une phrase : la page est une fenêtre d'AFFICHAGE, la
 * sélection est une liste d'IDENTIFIANTS. Confondre les deux donnerait un
 * tableau où changer de page décoche ce qu'on venait de cocher — c'est-à-dire
 * un tableau où « lisser 500 fiches » redevient impossible, ce que la
 * pagination était censée rendre possible.
 */
describe("PipelineMatrix — pagination", () => {
  /** Vingt-trois lignes : de quoi avoir une dernière page incomplète. */
  const BEAUCOUP = Array.from({ length: 23 }, (_, i) =>
    item({ id: `p${i}`, name: `Ligne${String(i).padStart(2, "0")}` }),
  );
  const parPage = () => screen.getByTitle(/Combien de lignes afficher/);

  it("ne pose que la première page, et dit combien de lignes il y a en tout", () => {
    renderRows(BEAUCOUP);
    fireEvent.change(parPage(), { target: { value: "10" } });

    expect(rowNames()).toHaveLength(10);
    expect(rowNames()[0]).toBe("Sélectionner Ligne00");
    expect(screen.getByText("1–10 sur 23")).toBeInTheDocument();
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
  });

  it("la dernière page ne montre que ce qui reste", () => {
    renderRows(BEAUCOUP);
    fireEvent.change(parPage(), { target: { value: "10" } });
    fireEvent.click(screen.getByTitle("Dernière page"));

    expect(rowNames()).toHaveLength(3);
    expect(screen.getByText("21–23 sur 23")).toBeInTheDocument();
  });

  it("la case d’en-tête ne coche QUE la page affichée", () => {
    renderRows(BEAUCOUP);
    fireEvent.change(parPage(), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    expect(screen.getByText("10 sélectionnées")).toBeInTheDocument();
  });

  // LE TEST QUI PORTE LA FONCTIONNALITÉ. Cocher page après page doit CUMULER :
  // c'est ainsi qu'on constitue un lot de plusieurs centaines à lisser.
  it("la sélection survit au changement de page et s’additionne", () => {
    renderRows(BEAUCOUP);
    fireEvent.change(parPage(), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    expect(screen.getByText("20 sélectionnées")).toBeInTheDocument();
    // Et le débordement se DIT : vingt cochées sur une page qui en montre dix
    // ressemblerait sinon à un compteur cassé.
    expect(screen.getByText("20 cochées, toutes pages confondues")).toBeInTheDocument();
  });

  it("changer un filtre ramène à la première page", () => {
    renderRows(BEAUCOUP);
    fireEvent.change(parPage(), { target: { value: "10" } });
    fireEvent.click(screen.getByTitle("Dernière page"));
    expect(screen.getByText("Page 3 / 3")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Rechercher une entreprise…"), {
      target: { value: "Ligne1" },
    });

    // Dix résultats (Ligne10 à Ligne19) tiennent sur une page : ce qui compte
    // est qu'on soit revenu à la PREMIÈRE, et non resté sur une page 3 vide.
    expect(screen.getByText("Page 1 / 1")).toBeInTheDocument();
    expect(rowNames()[0]).toBe("Sélectionner Ligne10");
  });
});

/**
 * LE BOUTON « LISSER ».
 *
 * Il n'enrichit pas, il va CHERCHER ce que la fiche n'a pas — SIRET, fiche
 * Google, site, RGE. D'où deux garanties : il ne prend que des lignes qui ont
 * une entreprise (le reste n'a rien à mettre en file), et il disparaît quand le
 * handler est absent, c'est-à-dire côté agent.
 */
describe("PipelineMatrix — mise en file de lissage", () => {
  const LIGNES = [
    item({ id: "l1", name: "AvecFiche", entreprise_id: 11 }),
    item({ id: "l2", name: "SansFiche", entreprise_id: null }),
    item({ id: "l3", name: "AutreFiche", entreprise_id: 13 }),
  ];

  it("n’envoie que les lignes qui portent une entreprise", () => {
    const bulk = renderRows(LIGNES);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    fireEvent.click(bar().getByRole("button", { name: /^Lisser/ }));

    expect(bulk.onLisser).toHaveBeenCalledTimes(1);
    const [items] = (bulk.onLisser as jest.Mock).mock.calls[0];
    expect(items.map((i: BoardItem) => i.entreprise_id)).toEqual([11, 13]);
  });

  it("n’existe pas quand le lissage n’est pas offert — c’est le cas de l’agent", () => {
    renderRows(LIGNES, noopHandlers, [], { onLisser: undefined });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));

    expect(bar().queryByRole("button", { name: /^Lisser/ })).not.toBeInTheDocument();
  });
});

/**
 * LE BOUTON « CHIFFRES CLÉS ».
 *
 * Il ne compte QUE les lignes à qui il manque vraiment un chiffre : un bouton
 * qui annonce cent et n'en change aucune ment sur ce qu'il va faire. Et il ne
 * prend que celles qui ont un dossier lead magnet — sans dossier, il n'y a
 * nulle part où écrire.
 */
describe("PipelineMatrix — chiffres clés déduits du registre", () => {
  const LIGNES = [
    item({
      id: "c1",
      name: "SansAnnees",
      project: project(true),
      missing_for_site: ["Années d'expérience"],
    }),
    item({ id: "c2", name: "Complete", project: project(true), missing_for_site: [] }),
    item({
      id: "c3",
      name: "SansDossier",
      project: null,
      missing_for_site: ["Années d'expérience"],
    }),
    item({
      id: "c4",
      name: "AutreManque",
      project: project(true),
      missing_for_site: ["Ville SEO"],
    }),
  ];

  // L'ÉLIGIBILITÉ NE SE LIMITE PAS AUX CASES VIDES : 146 dossiers portent des
  // installations inférieures au barème sans qu'il leur manque rien.
  // `missing_for_site` ne peut pas le voir, et le board ne connaît pas les dates
  // du registre — seule la route tranche, et elle rend le compte exact.
  it("prend toutes les lignes qui ont un dossier, y compris celles qui semblent complètes", () => {
    const bulk = renderRows(LIGNES);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cocher la page" }));
    fireEvent.click(bar().getByRole("button", { name: /^Chiffres clés/ }));

    const [items] = (bulk.onCompleterChiffres as jest.Mock).mock.calls[0];
    expect(items.map((i: BoardItem) => i.id)).toEqual(["c1", "c2", "c4"]);
  });
});

/**
 * LE PANNEAU DE FILTRES, VU DE L'ÉCRAN.
 *
 * La grammaire (« ou » dans un bloc, « et » entre les blocs) est testée dans
 * `filtres.test.ts`, sans React. Ce qui se joue ici est ce que le module pur ne
 * peut pas voir : que les cases atteignent bien le tableau, que le compteur
 * porte sur TOUT le tableau et non sur ce qui reste, et que « Réinitialiser »
 * vide aussi les menus — un bouton qui ne viderait que les cases laisserait un
 * tableau encore filtré et passerait pour cassé.
 */
describe("PipelineMatrix — filtres à cocher", () => {
  const presence = (statut: "present" | "absent" | "inconnu") => ({
    statut,
    origine: "constat",
    confiance: "haute",
  });
  const AVEC_SANS = [
    item({ id: "s1", name: "AvecSite", presence_site: presence("present") }),
    item({ id: "s2", name: "SansSite", presence_site: presence("absent") }),
    item({ id: "s3", name: "AussiSans", presence_site: presence("absent") }),
    item({ id: "s4", name: "JamaisVu", presence_site: null }),
  ];
  const ouvrirFiltres = () => fireEvent.click(screen.getByRole("button", { name: /^Filtres/ }));

  it("ne garde que les entreprises vérifiées sans site", () => {
    renderRows(AVEC_SANS);
    ouvrirFiltres();
    fireEvent.click(screen.getByRole("checkbox", { name: /Vérifié sans site/ }));

    expect(rowNames()).toEqual(["Sélectionner SansSite", "Sélectionner AussiSans"]);
  });

  // « Jamais regardé » n'est PAS « il n'en a pas » : c'est la distinction que
  // constats_presence existe pour tenir, et elle doit survivre jusqu'à l'écran.
  it("ne fait pas passer « jamais regardé » pour « sans site »", () => {
    renderRows(AVEC_SANS);
    ouvrirFiltres();
    fireEvent.click(screen.getByRole("checkbox", { name: /Vérifié sans site/ }));

    expect(rowNames()).not.toContain("Sélectionner JamaisVu");
  });

  it("deux cases du même bloc s’additionnent", () => {
    renderRows(AVEC_SANS);
    ouvrirFiltres();
    fireEvent.click(screen.getByRole("checkbox", { name: /Vérifié sans site/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Jamais regardé/ }));

    expect(rowNames()).toHaveLength(3);
  });

  // LE COMPTEUR PORTE SUR TOUT LE TABLEAU. S'il ne comptait que ce qui reste,
  // cocher une case ferait tomber à zéro le compteur de toutes les autres — et
  // on ne saurait plus ce qu'on s'apprête à ajouter.
  it("garde les effectifs de chaque case même quand une autre est cochée", () => {
    renderRows(AVEC_SANS);
    ouvrirFiltres();
    fireEvent.click(screen.getByRole("checkbox", { name: /Vérifié sans site/ }));

    const caseAvecSite = screen.getByRole("checkbox", { name: /A un site/ }).closest("label")!;
    expect(within(caseAvecSite).getByText("1")).toBeInTheDocument();
  });

  it("« Réinitialiser » vide les cases ET la recherche", () => {
    renderRows(AVEC_SANS);
    fireEvent.change(screen.getByPlaceholderText("Rechercher une entreprise…"), {
      target: { value: "Sans" },
    });
    ouvrirFiltres();
    fireEvent.click(screen.getByRole("checkbox", { name: /Vérifié sans site/ }));
    expect(rowNames()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Réinitialiser/ }));

    expect(rowNames()).toHaveLength(4);
    expect(screen.getByPlaceholderText("Rechercher une entreprise…")).toHaveValue("");
  });

  it("le bouton de réinitialisation est inerte quand rien n’est filtré", () => {
    renderRows(AVEC_SANS);
    expect(screen.getByRole("button", { name: /Réinitialiser/ })).toBeDisabled();
  });
});
