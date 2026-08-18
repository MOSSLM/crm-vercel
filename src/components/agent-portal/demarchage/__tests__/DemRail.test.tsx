import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemRail, type DemOnglet } from "../DemRail";
import {
  hasSignal,
  joursReels,
  separerFile,
  type DemarchageSignal,
} from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageQueueMeta, DemarchageTask } from "../types";

/**
 * LE RAIL, APRÈS LA REFONTE.
 *
 * Ce que ce fichier garde, quatre décisions :
 *
 * 1. DEUX FILES. Les premiers contacts sont un stock (rien ne les date), les
 *    relances un calendrier. Ils vivaient dans une seule liste, ce qui obligeait
 *    à trier à l'œil.
 * 2. DES FILTRES INDÉPENDANTS. Canal et signal partageaient une variable, donc
 *    un choix à la fois : cocher « Chauds » faisait perdre le canal. Or un lead
 *    peut être chaud ET en attente ET sur une tâche WhatsApp.
 * 3. LA TÊTE DE FILE EN GROS, avec de quoi agir dessus sans traverser l'écran —
 *    dont « appeler plutôt », parce que la décision de décrocher se prend en
 *    lisant la ligne.
 * 4. L'OBJECTIF N'EST PLUS UN PLAFOND. Rien n'est renvoyé au lendemain : cent
 *    premiers contacts restent cent.
 */

const NOW = new Date("2026-08-13T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

function task(over: Partial<DemarchageTask> & { id: string }): DemarchageTask {
  return {
    kind: "whatsapp",
    status: "pending",
    title: null,
    due_at: iso("2026-08-13"),
    contact_id: null,
    entreprise_id: 1,
    opportunite_id: null,
    automation_id: null,
    enrollment_id: null,
    step_id: null,
    payload: {},
    contact: null,
    entreprise: { id: 1, name: `Prospect ${over.id}`, ville: "Annecy", telephone: "0450000000" },
    sequence: null,
    intent: null,
    ...over,
  };
}

/** Une relance : l'entreprise a déjà été touchée. */
const relance = (over: Partial<DemarchageTask> & { id: string }) =>
  task({ premiere_touche_le: iso("2026-08-01"), ...over });

/** Une discussion ouverte : le prospect a répondu. */
const enDiscussion = (over: Partial<DemarchageTask> & { id: string }) =>
  relance({ in_conversation: true, ...over });

const chaud = (over: Partial<DemarchageTask> & { id: string }) =>
  task({
    intent: {
      score: 90,
      tier: "chaud",
      flame: "🔥",
      callWhen: "maintenant",
      reasons: ["a rouvert la démo"],
      sessions: 3,
      pageViews: 7,
      engagementSec: 95,
      lastDay: "2026-08-13",
      missed: false,
      daysSinceVisit: 0,
    },
    ...over,
  });

function renderRail(
  tasks: DemarchageTask[],
  {
    onglet = "premiers" as DemOnglet,
    canal = null as string | null,
    signal = null as DemarchageSignal | null,
    step = null as number | null,
    sel = null as string | null,
    doneToday = {} as Record<string, number>,
    quotas,
    setOnglet = jest.fn(),
    setCanal = jest.fn(),
    setSignal = jest.fn(),
    setStep = jest.fn(),
    setDay = jest.fn(),
    onPick = jest.fn(),
    onBasculerEnAppel = jest.fn(),
    poolDispo = null as number | null,
  } = {},
) {
  const { premiers, relances } = separerFile(tasks);
  const jours = joursReels(relances, { now: NOW, timeZone: "UTC" });
  const journee = jours[0];
  const duJour = onglet === "premiers" ? premiers : journee.tasks;
  const shown = duJour.filter(
    (t) =>
      (canal == null || t.kind === canal) &&
      (signal == null || hasSignal(t, signal)) &&
      (step == null || t.sequence?.stepIndex === step),
  );

  const meta: DemarchageQueueMeta = {
    done_today: Object.values(doneToday).reduce((a, b) => a + b, 0),
    done_today_by_kind: doneToday,
    done_today_conversation: 0,
    ...(quotas !== undefined ? { quotas } : {}),
  };

  const { container } = render(
    <DemRail
      onglet={onglet}
      setOnglet={setOnglet}
      premiers={premiers}
      jours={jours}
      day={journee.date}
      setDay={setDay}
      canal={canal}
      setCanal={setCanal}
      signal={signal}
      setSignal={setSignal}
      step={step}
      setStep={setStep}
      cohorte={null}
      setCohorte={jest.fn()}
      tasks={shown}
      meta={meta}
      agentName="Bilal"
      loading={false}
      busy={false}
      sel={sel}
      onPick={onPick}
      onRechercher={jest.fn()}
      onBasculerEnAppel={onBasculerEnAppel}
      poolDispo={poolDispo}
      onAttribuer={jest.fn()}
    />,
  );

  const el = (s: string) => container.querySelector<HTMLElement>(s)!;
  return {
    container,
    setOnglet,
    setCanal,
    setSignal,
    setStep,
    setDay,
    onPick,
    onBasculerEnAppel,
    /** Le grand bloc de tête. */
    now: () => container.querySelector<HTMLElement>(".dm-now"),
    /** La liste « à suivre ». */
    frise: el(".dm-fr"),
    lignes: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-tk")),
    onglets: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-file")),
    objectifs: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-obj-l")),
    calendrier: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-cd")),
    barre: (lb: string) =>
      Array.from(container.querySelectorAll<HTMLElement>(".dm-filt")).find((b) =>
        b.querySelector(".lb")?.textContent?.includes(lb),
      ),
  };
}

describe("DemRail — deux files, pas une", () => {
  const melange = [
    task({ id: "neuf1" }),
    task({ id: "neuf2" }),
    relance({ id: "suivi1", due_at: iso("2026-08-13") }),
  ];

  it("annonce le contenu de chaque file, chiffres à l'appui", () => {
    const { onglets } = renderRail(melange);
    const [premiers, relances] = onglets();
    expect(within(premiers).getByText("Premiers contacts")).toBeInTheDocument();
    expect(within(premiers).getByText("2")).toBeInTheDocument();
    expect(within(relances).getByText("Relances & discussions")).toBeInTheDocument();
    expect(within(relances).getByText("1")).toBeInTheDocument();
  });

  it("ne montre que la file ouverte", () => {
    const { lignes, now } = renderRail(melange, { onglet: "premiers" });
    const noms = [...lignes().map((l) => l.textContent), now()?.textContent].join(" ");
    expect(noms).toContain("Prospect neuf1");
    expect(noms).not.toContain("Prospect suivi1");
  });

  it("bascule de file au clic", () => {
    const { onglets, setOnglet } = renderRail(melange);
    fireEvent.click(onglets()[1]);
    expect(setOnglet).toHaveBeenCalledWith("relances");
  });

  it("range une discussion ouverte dans les relances, jamais dans les premiers contacts", () => {
    const { onglets } = renderRail([enDiscussion({ id: "d1" })]);
    expect(within(onglets()[0]).getByText("0")).toBeInTheDocument();
    expect(within(onglets()[1]).getByText("1")).toBeInTheDocument();
  });
});

describe("DemRail — l'objectif du jour, plus un plafond", () => {
  it("affiche fait / objectif, et ce qui reste en file", () => {
    const { objectifs } = renderRail(
      Array.from({ length: 30 }, (_, i) => task({ id: `w${i}` })),
      { doneToday: { whatsapp: 12 } },
    );
    const ligne = objectifs()[0];
    expect(within(ligne).getByText("12")).toBeInTheDocument();
    expect(within(ligne).getByText("/20")).toBeInTheDocument();
    // Trente en file, et les trente sont là : rien n'est parti au lendemain.
    expect(within(ligne).getByText("30 en file")).toBeInTheDocument();
  });

  it("laisse dépasser l'objectif au lieu de cacher le surplus", () => {
    // C'est LE point de la refonte. L'ancien plan gardait vingt lignes et
    // poussait le reste à demain : la file cachait le travail décidé.
    const { objectifs, lignes, now } = renderRail(
      Array.from({ length: 25 }, (_, i) => task({ id: `w${i}` })),
      { doneToday: { whatsapp: 26 } },
    );
    expect(objectifs()[0].dataset.full).toBe("1");
    expect(within(objectifs()[0]).getByText("26")).toBeInTheDocument();
    expect(lignes().length + (now() ? 1 : 0)).toBe(25);
  });

  it("ne montre l'objectif que des canaux réellement en file", () => {
    const { objectifs } = renderRail([task({ id: "w1" })]);
    expect(objectifs()).toHaveLength(1);
    expect(within(objectifs()[0]).getByText("WhatsApp")).toBeInTheDocument();
  });

  it("respecte l'objectif réglé par l'agent", () => {
    const { objectifs } = renderRail([task({ id: "w1" })], { quotas: { whatsapp: 60 } });
    expect(within(objectifs()[0]).getByText("/60")).toBeInTheDocument();
  });

  it("le dit quand la file des premiers contacts est vide", () => {
    renderRail([relance({ id: "r1" })], { onglet: "premiers" });
    expect(screen.getByText(/Aucun premier contact en attente/)).toBeInTheDocument();
  });
});

describe("DemRail — le calendrier des relances", () => {
  const dansLeTemps = [
    relance({ id: "auj", due_at: iso("2026-08-13") }),
    relance({ id: "dem", due_at: iso("2026-08-14") }),
    relance({ id: "sem", due_at: iso("2026-08-18") }),
    relance({ id: "loin", due_at: iso("2026-09-15") }),
  ];

  it("ouvre une case par jour porteur, jamais pour un jour vide", () => {
    const { calendrier } = renderRail(dansLeTemps, { onglet: "relances" });
    expect(calendrier()).toHaveLength(4);
    // Dans la semaine, le jour de semaine suffit. Au-delà, c'est le mois qui
    // situe : « mar 15 » peut être dans six jours comme dans trois mois, et une
    // mise de côté ouvre justement des cases très lointaines.
    expect(calendrier().map((c) => c.querySelector(".j")?.textContent)).toEqual([
      "auj.",
      "dem.",
      "mar",
      "sept",
    ]);
  });

  it("porte le nombre de relances de chaque jour", () => {
    const { calendrier } = renderRail(dansLeTemps, { onglet: "relances" });
    expect(calendrier().map((c) => c.querySelector(".n")?.textContent)).toEqual(["1", "1", "1", "1"]);
  });

  it("change de jour au clic", () => {
    const { calendrier, setDay } = renderRail(dansLeTemps, { onglet: "relances" });
    fireEvent.click(calendrier()[1]);
    expect(setDay).toHaveBeenCalledWith("2026-08-14");
  });

  it("dit que les relances n'ont pas de plafond", () => {
    renderRail(dansLeTemps, { onglet: "relances" });
    expect(screen.getByText(/ne se rationne pas/)).toBeInTheDocument();
  });

  it("n'affiche aucun calendrier dans les premiers contacts — rien ne les date", () => {
    const { calendrier } = renderRail(dansLeTemps, { onglet: "premiers" });
    expect(calendrier()).toHaveLength(0);
  });
});

describe("DemRail — canal et signal sont deux dimensions", () => {
  // Un chaud sur WhatsApp, un chaud en discussion, un tiède : de quoi vérifier
  // qu'aucune des deux barres n'écrase l'autre.
  const melange = [
    chaud({ id: "c1", kind: "whatsapp" }),
    { ...enDiscussion({ id: "c2", kind: "whatsapp" }), intent: chaud({ id: "x" }).intent },
    relance({ id: "tiede", kind: "call" }),
  ];

  it("a une barre pour les canaux et une autre pour les signaux", () => {
    const { barre } = renderRail(melange, { onglet: "relances" });
    expect(barre("Canal")).toBeDefined();
    expect(barre("Signal")).toBeDefined();
  });

  it("compte un prospect chaud ET en discussion dans LES DEUX pastilles", () => {
    // Le défaut d'origine : `signalOf` ne rendait qu'un signal, donc un chaud
    // qui répondait disparaissait de « Chauds » — au moment précis où il
    // devenait intéressant.
    const { barre } = renderRail(melange, { onglet: "relances" });
    const signaux = barre("Signal")!;
    expect(within(signaux).getByText("Chauds").querySelector(".n")?.textContent).toBe("1");
    expect(within(signaux).getByText("En discussion").querySelector(".n")?.textContent).toBe("1");
  });

  it("garde le canal quand on choisit un signal — les deux se cumulent", () => {
    const { barre, setCanal, setSignal } = renderRail(melange, {
      onglet: "relances",
      canal: "whatsapp",
    });
    fireEvent.click(within(barre("Signal")!).getByText("En discussion"));
    expect(setSignal).toHaveBeenCalledWith("conversation");
    // Le canal n'est pas touché : choisir un signal ne le relâche pas.
    expect(setCanal).not.toHaveBeenCalled();
  });

  it("relâche le filtre quand on reclique la pastille déjà cochée", () => {
    const { barre, setSignal } = renderRail(melange, { onglet: "relances", signal: "conversation" });
    fireEvent.click(within(barre("Signal")!).getByText("En discussion"));
    expect(setSignal).toHaveBeenCalledWith(null);
  });

  it("écrit TOUS les signaux sur la ligne", () => {
    const { container } = renderRail(melange, { onglet: "relances", sel: "tiede" });
    const tags = Array.from(container.querySelectorAll<HTMLElement>(".dm-tk .st.sig")).map(
      (s) => s.dataset.sig,
    );
    expect(tags).toContain("hot");
    expect(tags).toContain("conversation");
  });

  it("ne propose pas de barre de signal quand aucune ligne n'en porte", () => {
    const { barre } = renderRail([task({ id: "a" })]);
    expect(barre("Signal")).toBeUndefined();
  });
});

describe("DemRail — la tête de file, en gros", () => {
  const file = [task({ id: "premier" }), task({ id: "second" }), task({ id: "troisieme" })];

  it("met la première tâche en avant, avec son canal", () => {
    const { now } = renderRail(file);
    const bloc = now()!;
    expect(within(bloc).getByText("Prospect premier")).toBeInTheDocument();
    expect(bloc.dataset.k).toBe("whatsapp");
    expect(within(bloc).getByText("premier contact")).toBeInTheDocument();
  });

  it("promeut la ligne choisie — le grand bloc dit ce que l'écran affiche", () => {
    const { now } = renderRail(file, { sel: "second" });
    expect(within(now()!).getByText("Prospect second")).toBeInTheDocument();
  });

  it("ne répète pas la tête de file dans la liste du dessous", () => {
    const { lignes } = renderRail(file);
    const noms = lignes().map((l) => l.querySelector(".nm .t")?.textContent);
    expect(noms).toEqual(["Prospect second", "Prospect troisieme"]);
  });

  it("bascule la tâche courante en appel d'un seul clic", () => {
    // Le geste qui manquait : décider d'appeler ne doit pas coûter un faux
    // « Fait » ni laisser la tâche traîner.
    const { now, onBasculerEnAppel } = renderRail(file);
    fireEvent.click(within(now()!).getByRole("button", { name: /Appeler plutôt/ }));
    expect(onBasculerEnAppel).toHaveBeenCalledWith("premier");
  });

  it("ne propose pas de basculer un appel en appel", () => {
    const { now } = renderRail([task({ id: "a", kind: "call" })]);
    expect(within(now()!).queryByRole("button", { name: /Appeler plutôt/ })).toBeNull();
  });

  it("bascule aussi depuis une ligne de la liste, sans l'ouvrir", () => {
    const { lignes, onBasculerEnAppel } = renderRail(file);
    fireEvent.click(within(lignes()[0]).getByTitle("Transformer en appel"));
    expect(onBasculerEnAppel).toHaveBeenCalledWith("second");
  });

  it("enchaîne sur la suivante", () => {
    const { now, onPick } = renderRail(file);
    fireEvent.click(within(now()!).getByRole("button", { name: /Suivante/ }));
    expect(onPick).toHaveBeenCalledWith("second");
  });
});

describe("DemRail — ce que la ligne dit", () => {
  it("numérote l'ordre de passage plutôt que d'inventer une heure", () => {
    const { lignes } = renderRail([task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]);
    expect(lignes().map((l) => l.querySelector(".tm")?.textContent)).toEqual(["1", "2"]);
  });

  it("signale l'échéance dépassée", () => {
    const { frise } = renderRail([
      relance({ id: "a" }),
      relance({ id: "vieux", due_at: iso("2026-08-05") }),
    ], { onglet: "relances", sel: "a" });
    expect(within(frise).getByText("échéance passée")).toBeInTheDocument();
  });

  it("marque une mise de côté au lieu de la faire passer pour un oubli", () => {
    const { calendrier, container } = renderRail(
      [
        relance({ id: "auj" }),
        relance({
          id: "range",
          status: "snoozed",
          due_at: iso("2026-08-25"),
          payload: { mise_de_cote: { jusquau: iso("2026-08-25"), motif: "En congés", le: iso("2026-08-13") } },
        }),
      ],
      { onglet: "relances" },
    );
    // Elle vit dans SA case de calendrier, pas dans celle du jour.
    expect(calendrier()).toHaveLength(2);
    expect(container.querySelector(".dm-tk .st.cote")).toBeNull();
  });

  it("écrit l'étape de séquence et permet de trier dessus", () => {
    const seq = (i: number) => ({
      name: "Artisans",
      stepLabel: `WhatsApp J+${i}`,
      stepIndex: i,
      totalSteps: 5,
      steps: [],
    });
    const { barre, setStep, frise } = renderRail(
      [relance({ id: "a", sequence: seq(1) }), relance({ id: "b", sequence: seq(3) })],
      { onglet: "relances", sel: "a" },
    );
    expect(within(frise).getByText("étape 3/5")).toBeInTheDocument();
    fireEvent.click(within(barre("Étape")!).getByText("3"));
    expect(setStep).toHaveBeenCalledWith(3);
  });

  it("sort l'emoji d'intention du nom, dans sa propre case", () => {
    const { lignes } = renderRail([task({ id: "a" }), chaud({ id: "b" })], { sel: "a" });
    const ligne = lignes()[0];
    expect(ligne.querySelector(".nm .t")?.textContent).toBe("Prospect b");
    expect(ligne.querySelector(".nm .fl")?.textContent).toBe("🔥");
  });
});
