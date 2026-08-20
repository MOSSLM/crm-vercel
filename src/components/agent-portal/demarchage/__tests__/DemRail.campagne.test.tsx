import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemRail } from "../DemRail";
import { DAILY_QUOTA, repartirLaJournee } from "@/lib/agent-portal/demarchage-buckets";
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
    doneToday = {} as Record<string, number>,
    setCohorte = jest.fn(),
    onRechercher = jest.fn(),
  }: {
    cohorte?: DemCohorte | null;
    quotas?: DemarchageQueueMeta["quotas"];
    doneToday?: Record<string, number>;
    setCohorte?: (c: DemCohorte | null) => void;
    onRechercher?: () => void;
  } = {},
) {
  // La campagne ne produit que des premiers contacts : c'est cette file-là
  // qu'on regarde ici.
  const rep = repartirLaJournee(tasks, { now: NOW, timeZone: "UTC" });
  const premiers = rep.premiers;
  const { container } = render(
    <DemRail
      file="premiers"
      setFile={jest.fn()}
      rep={rep}
      aVenirOuvert={false}
      setAVenirOuvert={jest.fn()}
      canal={null}
      setCanal={jest.fn()}
      signal={null}
      setSignal={jest.fn()}
      step={null}
      setStep={jest.fn()}
      cohorte={cohorte}
      setCohorte={setCohorte}
      tasks={premiers}
      meta={{
        done_today: 0,
        done_today_by_kind: doneToday,
        done_today_conversation: 0,
        ...(quotas !== undefined ? { quotas } : {}),
      }}
      agentName="Bilal"
      loading={false}
      busy={false}
      sel={null}
      onPick={jest.fn()}
      onRechercher={onRechercher}
      onBasculerEnAppel={jest.fn()}
      poolDispo={null}
      onAttribuer={jest.fn()}
    />,
  );
  const el = (sel: string) => container.querySelector<HTMLElement>(sel)!;
  /** Déplie le panneau des filtres repliés : signal, cohorte, étape. */
  const ouvrirFiltres = () => {
    const bouton = container.querySelector<HTMLElement>(".dm-chip.more");
    if (bouton) fireEvent.click(bouton);
  };
  return {
    container,
    setCohorte,
    onRechercher,
    ouvrirFiltres,
    frise: el(".dm-fr"),
    /**
     * Le groupe « Cohorte » du panneau des filtres — `null` tant que la
     * campagne n'est pas dans la file. Déplie le panneau au passage : c'est le
     * geste réel de l'agent.
     */
    barreCohorte: () => {
      ouvrirFiltres();
      return (
        Array.from(container.querySelectorAll<HTMLElement>(".dm-fmenu .g")).find((g) =>
          g.querySelector(".lb")?.textContent?.includes("Cohorte"),
        ) ?? null
      );
    },
    /** Les pastilles de canal : elles restent en clair, hors du panneau. */
    pastillesCanal: () =>
      Array.from(container.querySelectorAll<HTMLElement>(".dm-fbar > .dm-chip")),
    /** La colonne d'objectif d'un canal, en tête de file. */
    objectif: (lb: string) =>
      Array.from(container.querySelectorAll<HTMLElement>(".dm-obj1 .c")).find((l) =>
        l.getAttribute("title")?.includes(lb),
      )!,
  };
}

describe("DemRail — la cohorte se lit sur la ligne", () => {
  it("écrit la cohorte de chaque ligne, en deux mots", () => {
    const { frise } = renderRail([froide("a", "A_site_faible"), froide("b", "B_sans_site")]);
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

  it("a son propre groupe dans le panneau des filtres", () => {
    const { barreCohorte } = renderRail(deuxCohortes);
    const barre = barreCohorte()!;
    expect(within(barre).getByText("Cohorte")).toBeInTheDocument();
    // Plus de pastille « toutes » : le panneau a un « tout relâcher » commun,
    // et une pastille cochée se décoche en la recliquant.
    expect(Array.from(barre.querySelectorAll(".dm-chip")).map((c) => c.textContent)).toEqual([
      "site faible2",
      "sans site1",
    ]);
  });

  it("ne mélange pas la cohorte aux canaux", () => {
    // Canal, signal et cohorte sont trois dimensions cumulables : chacune a sa
    // barre, aucune n'écrase les autres.
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

  it("laisse la bascule en appel à portée de clic sur chaque ligne", () => {
    const { frise } = renderRail([froide("a", "B_sans_site"), froide("b", "B_sans_site")]);
    // Un appel à froid EST déjà un appel : rien à basculer. Le bouton
    // n'apparaît que là où il change quelque chose.
    expect(within(frise).queryAllByTitle("Transformer en appel")).toHaveLength(0);
  });
});

describe("DemRail — l'objectif vient des réglages de l'agent", () => {
  it("affiche l'objectif de l'agent quand il en a un", () => {
    const { objectif } = renderRail([task({ id: "c1" })], { quotas: { call: 60 } });
    expect(within(objectif("Appels")).getByText("/60")).toBeInTheDocument();
  });

  it("retombe canal par canal sur l'objectif par défaut", () => {
    // Régler ses appels ne doit pas effacer l'affichage de son objectif WhatsApp.
    const { objectif } = renderRail([task({ id: "c1" }), task({ id: "w1", kind: "whatsapp" })], {
      quotas: { call: 60 },
    });
    expect(within(objectif("WhatsApp")).getByText(`/${DAILY_QUOTA.whatsapp}`)).toBeInTheDocument();
  });

  it("garde l'objectif par défaut quand l'agent n'a rien réglé", () => {
    const { objectif } = renderRail([task({ id: "c1" })], { quotas: null });
    expect(within(objectif("Appels")).getByText(`/${DAILY_QUOTA.call}`)).toBeInTheDocument();
  });

  it("ignore une valeur inexploitable plutôt que d'afficher « /null »", () => {
    // La valeur vient d'un `jsonb` : elle se relit, elle ne se croit pas.
    const { objectif } = renderRail([task({ id: "c1" })], {
      quotas: { call: "beaucoup" as unknown as number },
    });
    expect(within(objectif("Appels")).getByText(`/${DAILY_QUOTA.call}`)).toBeInTheDocument();
  });

  it("ne renvoie AUCUN appel au lendemain quand la journée dépasse l'objectif", () => {
    // Cent appels par jour ne rentrent pas dans un objectif de vingt, et ce qui
    // ne rentrait pas ne s'affichait pas : le plan poussait quatre-vingts
    // lignes au lendemain, tous les jours, sans que rien ne le signale.
    const cent = Array.from({ length: 100 }, (_, i) => task({ id: `c${i}` }));
    const { container, objectif } = renderRail(cent, { doneToday: { call: 24 } });
    expect(objectif("Appels").dataset.full).toBe("1");
    expect(container.querySelectorAll(".dm-tk")).toHaveLength(100);
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
