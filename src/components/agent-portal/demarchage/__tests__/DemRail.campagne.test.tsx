import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemRail } from "../DemRail";
import { DAILY_QUOTA, planTasks } from "@/lib/agent-portal/demarchage-buckets";
import type { DemCohorte, DemarchageQueueMeta, DemarchageTask } from "../types";

/**
 * La campagne du 17 au 26 août dans la file : deux cohortes comparées au même
 * âge, et cent appels à FROID par jour.
 *
 * Ce qui est vérifié ici est ce que l'écran ne savait pas dire : de quelle
 * cohorte vient une ligne (elles n'ont ni le même argument ni le même
 * document), qu'une ligne n'a aucune séquence derrière elle, et la cadence
 * RÉELLE de l'agent — celle de ses réglages, plus une constante du code.
 */

const NOW = new Date("2026-08-18T10:00:00Z");

function task(over: Partial<DemarchageTask> & { id: string }): DemarchageTask {
  return {
    kind: "call",
    status: "pending",
    title: null,
    due_at: "2026-08-18T09:00:00.000Z",
    contact_id: null,
    entreprise_id: 1,
    opportunite_id: null,
    automation_id: null,
    enrollment_id: null,
    step_id: null,
    payload: {},
    contact: null,
    entreprise: { id: 1, name: `Prospect ${over.id}`, ville: "Annecy", telephone: null },
    sequence: null,
    intent: null,
    ...over,
  };
}

/** Une ligne d'appel à froid, telle que la campagne en produit cent par jour. */
const froide = (id: string, cohorte: DemCohorte | null) =>
  task({ id, cohorte, hors_sequence: true, title: "Premier appel" });

function renderRail(
  tasks: DemarchageTask[],
  {
    cohorte = null as DemCohorte | null,
    quotas,
    setCohorte = jest.fn(),
    onRechercher = jest.fn(),
  }: {
    cohorte?: DemCohorte | null;
    quotas?: DemarchageQueueMeta["quotas"];
    setCohorte?: (c: DemCohorte | null) => void;
    onRechercher?: () => void;
  } = {},
) {
  const days = planTasks(tasks, { now: NOW, timeZone: "UTC" });
  const journee = days[0];
  const { container } = render(
    <DemRail
      days={days}
      day={journee.date}
      setDay={jest.fn()}
      filt="all"
      setFilt={jest.fn()}
      step={null}
      setStep={jest.fn()}
      cohorte={cohorte}
      setCohorte={setCohorte}
      tasks={journee.tasks}
      meta={{
        done_today: 0,
        done_today_by_kind: {},
        done_today_conversation: 0,
        ...(quotas !== undefined ? { quotas } : {}),
      }}
      agentName="Bilal"
      loading={false}
      sel={null}
      onPick={jest.fn()}
      onRechercher={onRechercher}
    />,
  );
  const el = (sel: string) => container.querySelector<HTMLElement>(sel)!;
  return {
    container,
    setCohorte,
    onRechercher,
    frise: el(".dm-fr"),
    /** La barre de cohortes — `null` tant que la campagne n'est pas dans la file. */
    barreCohorte: () => container.querySelector<HTMLElement>(".dm-filt.coh"),
    /** Les pastilles de canaux et de signaux : l'AUTRE barre. */
    pastillesCanal: () =>
      Array.from(container.querySelectorAll<HTMLElement>(".dm-filt:not(.coh):not(.steps) .dm-chip")),
    tuile: (lb: string) => within(el(".dm-sess .mini")).getByText(lb).closest<HTMLElement>("div")!,
  };
}

describe("DemRail — la cohorte se lit sur la ligne", () => {
  it("écrit la cohorte de chaque ligne, en deux mots", () => {
    const { frise } = renderRail([
      froide("a", "A_site_faible"),
      froide("b", "B_sans_site"),
    ]);
    expect(within(frise).getByText("site faible")).toBeInTheDocument();
    expect(within(frise).getByText("sans site")).toBeInTheDocument();
  });

  it("ne met rien sur une ligne hors campagne", () => {
    const { frise } = renderRail([froide("a", null)]);
    expect(frise.querySelector(".st.coh")).toBeNull();
  });

  it("teinte les deux cohortes différemment — l'œil décide avant de lire", () => {
    const { frise } = renderRail([froide("a", "A_site_faible"), froide("b", "B_sans_site")]);
    expect(frise.querySelector('.st.coh[data-coh="A_site_faible"]')).not.toBeNull();
    expect(frise.querySelector('.st.coh[data-coh="B_sans_site"]')).not.toBeNull();
  });
});

describe("DemRail — la cohorte est une dimension à part", () => {
  const deuxCohortes = [
    froide("a1", "A_site_faible"),
    froide("a2", "A_site_faible"),
    froide("b1", "B_sans_site"),
  ];

  it("a sa propre barre, avec son propre « toutes »", () => {
    const { barreCohorte } = renderRail(deuxCohortes);
    const barre = barreCohorte()!;
    expect(within(barre).getByText("Cohorte")).toBeInTheDocument();
    expect(Array.from(barre.querySelectorAll(".dm-chip")).map((c) => c.textContent)).toEqual([
      "toutes",
      "site faible2",
      "sans site1",
    ]);
  });

  it("ne mélange pas la cohorte aux canaux et aux signaux", () => {
    // Le filtre de canal et celui de signal partagent une barre parce qu'ils
    // s'excluent. La cohorte se combine avec eux : elle ne peut pas y entrer.
    const { pastillesCanal } = renderRail(deuxCohortes);
    const libelles = pastillesCanal().map((c) => c.textContent);
    expect(libelles.some((l) => l?.includes("site faible"))).toBe(false);
    expect(libelles.some((l) => l?.includes("sans site"))).toBe(false);
  });

  it("ne propose pas de cohorte hors campagne", () => {
    const { barreCohorte } = renderRail([froide("x", null), froide("y", null)]);
    expect(barreCohorte()).toBeNull();
  });

  it("remonte la cohorte choisie — c'est elle qui part dans l'URL", () => {
    const { barreCohorte, setCohorte } = renderRail(deuxCohortes);
    fireEvent.click(within(barreCohorte()!).getByText(/site faible/));
    expect(setCohorte).toHaveBeenCalledWith("A_site_faible");
  });

  it("relâche le filtre quand on reclique la cohorte déjà cochée", () => {
    const { barreCohorte, setCohorte } = renderRail(deuxCohortes, { cohorte: "A_site_faible" });
    fireEvent.click(within(barreCohorte()!).getByText(/site faible/));
    expect(setCohorte).toHaveBeenCalledWith(null);
  });

  it("garde les deux pastilles quand un filtre est actif, sans inventer le compte de l'autre", () => {
    // Filtrée sur A, la file ne contient plus une seule ligne B : annoncer
    // « sans site 0 » serait un chiffre faux. La pastille reste — sinon on ne
    // pourrait plus passer de A à B — mais elle ne compte rien.
    const { barreCohorte } = renderRail([froide("a1", "A_site_faible")], {
      cohorte: "A_site_faible",
    });
    const barre = barreCohorte()!;
    const b = within(barre).getByText(/sans site/);
    expect(b).toBeInTheDocument();
    expect(b.querySelector(".n")).toBeNull();
    expect(within(barre).getByText(/site faible/).querySelector(".n")?.textContent).toBe("1");
  });
});

describe("DemRail — les appels à froid", () => {
  it("marque la ligne « à froid » là où une séquence mettrait son étape", () => {
    const { frise } = renderRail([froide("a", "B_sans_site")]);
    expect(within(frise).getByText("à froid")).toBeInTheDocument();
    expect(within(frise).queryByText(/^étape /)).toBeNull();
  });

  it("dit « jamais contactée » plutôt que rien quand la ligne n'a pas de titre", () => {
    const { frise } = renderRail([task({ id: "f", hors_sequence: true, title: null })]);
    expect(within(frise).getByText("Jamais contactée")).toBeInTheDocument();
  });

  it("ne parle plus de séquence en pied de file", () => {
    renderRail([froide("a", null)]);
    expect(screen.getByText(/Un appel à froid n'en a qu'une/)).toBeInTheDocument();
  });
});

describe("DemRail — la cadence vient des réglages de l'agent", () => {
  it("affiche le quota de l'agent quand il en a un", () => {
    const { tuile } = renderRail([task({ id: "c1" })], { quotas: { call: 60 } });
    expect(within(tuile("Appels")).getByText("/60")).toBeInTheDocument();
    expect(screen.getByText(/cadence : 60 appels/)).toBeInTheDocument();
  });

  it("retombe canal par canal sur la cadence par défaut", () => {
    // Régler ses appels ne doit pas effacer l'affichage de sa cadence WhatsApp.
    const { tuile } = renderRail([task({ id: "c1" }), task({ id: "w1", kind: "whatsapp" })], {
      quotas: { call: 60 },
    });
    expect(within(tuile("WhatsApp 1er contact")).getByText(`/${DAILY_QUOTA.whatsapp}`)).toBeInTheDocument();
  });

  it("garde la cadence par défaut quand l'agent n'a rien réglé", () => {
    const { tuile } = renderRail([task({ id: "c1" })], { quotas: null });
    expect(within(tuile("Appels")).getByText(`/${DAILY_QUOTA.call}`)).toBeInTheDocument();
  });

  it("ignore une valeur inexploitable plutôt que d'afficher « /null »", () => {
    // La valeur vient d'un `jsonb` : elle se relit, elle ne se croit pas.
    const { tuile } = renderRail([task({ id: "c1" })], {
      quotas: { call: "beaucoup" as unknown as number },
    });
    expect(within(tuile("Appels")).getByText(`/${DAILY_QUOTA.call}`)).toBeInTheDocument();
  });
});

describe("DemRail — retrouver celle qui rappelle", () => {
  it("ouvre la recherche depuis le rail, raccourci affiché", () => {
    const { onRechercher } = renderRail([task({ id: "c1" })]);
    const bouton = screen.getByRole("button", { name: /Une entreprise rappelle/ });
    expect(within(bouton).getByText("/")).toBeInTheDocument();
    fireEvent.click(bouton);
    expect(onRechercher).toHaveBeenCalled();
  });
});
