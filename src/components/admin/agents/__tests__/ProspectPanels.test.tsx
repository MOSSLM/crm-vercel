import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PoolPanel, type PipelineOption, type PoolProspect, type StageOption } from "../ProspectPanels";

const PIPELINES: PipelineOption[] = [
  { id: "p-web", nom: "Sans site web", ordre: 1 },
  { id: "p-reseaux", nom: "Réseaux sociaux", ordre: 2 },
];
const STAGES: StageOption[] = [
  { id: 1, nom: "Nouveau lead", pipeline_id: "p-web", ordre: 1 },
  { id: 2, nom: "Contacté", pipeline_id: "p-web", ordre: 2 },
];

const ent = (id: number, name: string, deals: PoolProspect["deals"]): PoolProspect => ({
  id,
  name,
  ville: "Annecy",
  telephone: null,
  deals,
});

const POOL: PoolProspect[] = [
  ent(1, "Alpha", [
    { pipeline_id: "p-web", pipeline_nom: "Sans site web", stage_id: 1, stage_nom: "Nouveau lead" },
  ]),
  ent(2, "Beta", [
    { pipeline_id: "p-web", pipeline_nom: "Sans site web", stage_id: 2, stage_nom: "Contacté" },
  ]),
  ent(3, "Gamma", [
    { pipeline_id: "p-reseaux", pipeline_nom: "Réseaux sociaux", stage_id: null, stage_nom: null },
  ]),
  ent(4, "Delta", []),
];

function renderPool(onAssign = jest.fn()) {
  render(
    <PoolPanel
      prospects={POOL}
      pipelines={PIPELINES}
      stages={STAGES}
      truncated={false}
      loading={false}
      agentName="Jean"
      canAssign
      busyId={null}
      bulkBusy={false}
      onAssign={onAssign}
    />,
  );
  return onAssign;
}

const pipelineFilter = () => screen.getByTitle("Pipeline");
const rowCheckboxes = () => screen.getAllByLabelText("Sélectionner cette entreprise");
const visibleNames = () =>
  screen.getAllByText(/^(Alpha|Beta|Gamma|Delta)$/).map((el) => el.textContent);

describe("PoolPanel", () => {
  it("ne garde que les entreprises du pipeline choisi", () => {
    renderPool();
    // Tri par nom par défaut.
    expect(visibleNames()).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);

    fireEvent.change(pipelineFilter(), { target: { value: "p-web" } });

    expect(visibleNames()).toEqual(["Alpha", "Beta"]);
  });

  it("affine ensuite par étape du pipeline", () => {
    renderPool();
    fireEvent.change(pipelineFilter(), { target: { value: "p-web" } });
    fireEvent.change(screen.getByTitle("Étape du pipeline"), { target: { value: "2" } });

    expect(visibleNames()).toEqual(["Beta"]);
  });

  it("isole les entreprises sans aucune affaire", () => {
    renderPool();
    fireEvent.change(pipelineFilter(), { target: { value: "__none__" } });

    expect(visibleNames()).toEqual(["Delta"]);
  });

  // Le cœur de la demande : cocher tout un pipeline puis l'envoyer d'un coup.
  it("attribue en un seul appel tout ce que le filtre a laissé", () => {
    const onAssign = renderPool();
    fireEvent.change(pipelineFilter(), { target: { value: "p-web" } });
    fireEvent.click(screen.getByText("Tout sélectionner (2)"));

    fireEvent.click(screen.getByText(/Attribuer 2 à Jean/));

    expect(onAssign).toHaveBeenCalledWith([1, 2]);
  });

  it("étend la sélection à la plage au Maj+clic", () => {
    const onAssign = renderPool();
    const boxes = rowCheckboxes();
    fireEvent.click(boxes[0]);
    // Maj+clic sur la 3e ligne : Alpha, Beta et Delta sont prises, pas Gamma.
    fireEvent.click(boxes[2], { shiftKey: true });

    fireEvent.click(screen.getByText(/Attribuer 3 à Jean/));

    expect(onAssign).toHaveBeenCalledWith([1, 2, 4]);
  });

  it("n'attribue que les lignes encore visibles après un changement de filtre", () => {
    const onAssign = renderPool();
    fireEvent.click(rowCheckboxes()[3]); // Delta, sans pipeline
    fireEvent.change(pipelineFilter(), { target: { value: "p-web" } });
    fireEvent.click(screen.getByText("Tout sélectionner (2)"));

    fireEvent.click(screen.getByText(/Attribuer 2 à Jean/));

    expect(onAssign).toHaveBeenCalledWith([1, 2]);
  });

  it("attribue une seule entreprise depuis sa ligne", () => {
    const onAssign = renderPool();
    fireEvent.click(screen.getAllByText("Attribuer")[0]);

    expect(onAssign).toHaveBeenCalledWith([1]);
  });
});
