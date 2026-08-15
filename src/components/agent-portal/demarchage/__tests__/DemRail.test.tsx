import React from "react";
import { render, screen, within } from "@testing-library/react";
import { DemRail, type DemFilter } from "../DemRail";
import { DAILY_QUOTA, planTasks, signalOf } from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageTask } from "../types";

/**
 * La file annonce une CADENCE, pas un horaire — et une DATE, pas un panier.
 *
 * Ce qui est vérifié ici est exactement ce qui était faux avant : une heure
 * inventée par le moteur sur chaque ligne, un compteur par canal qui suivait le
 * filtre affiché au lieu de la journée réelle, l'emoji d'intention collé au nom
 * de l'entreprise, et sept onglets illisibles là où on n'attend que des jours.
 */

const NOW = new Date("2026-08-13T10:00:00Z");

function task(over: Partial<DemarchageTask> & { id: string }): DemarchageTask {
  return {
    kind: "whatsapp",
    status: "pending",
    title: null,
    due_at: "2026-08-10T09:00:00.000Z",
    contact_id: null,
    entreprise_id: 1,
    opportunite_id: null,
    automation_id: null,
    enrollment_id: "e1",
    step_id: null,
    payload: {},
    contact: null,
    entreprise: { id: 1, name: `Prospect ${over.id}`, ville: "Annecy", telephone: null },
    sequence: null,
    intent: null,
    ...over,
  };
}

const lot = (kind: DemarchageTask["kind"], n: number) =>
  Array.from({ length: n }, (_, i) => task({ id: `${kind}-${i}`, kind }));

/** Une étape de séquence, telle que `/api/agent/tasks` la renvoie. */
const etape = (stepIndex: number, totalSteps = 5): DemarchageTask["sequence"] => ({
  name: "Artisans — 5 touches",
  stepLabel: `Étape ${stepIndex}`,
  stepIndex,
  totalSteps,
  steps: [],
});

function renderRail(
  tasks: DemarchageTask[],
  {
    offset = 0,
    filt = "all" as DemFilter,
    step = null as number | null,
    doneToday = {} as Record<string, number>,
    doneConversation = 0,
  } = {},
) {
  const days = planTasks(tasks, { now: NOW, timeZone: "UTC", doneToday });
  const journee = days.find((d) => d.offset === offset) ?? days[0];
  const shown = journee.tasks.filter((t) => {
    if (step != null && t.sequence?.stepIndex !== step) return false;
    if (filt === "all") return true;
    return filt === "missed" || filt === "conversation" || filt === "hot"
      ? signalOf(t) === filt
      : t.kind === filt;
  });
  const { container } = render(
    <DemRail
      days={days}
      day={journee.date}
      setDay={jest.fn()}
      filt={filt}
      setFilt={jest.fn()}
      step={step}
      setStep={jest.fn()}
      tasks={shown}
      meta={{
        done_today: 0,
        done_today_by_kind: doneToday,
        done_today_conversation: doneConversation,
      }}
      agentName="Bilal"
      loading={false}
      sel={null}
      onPick={jest.fn()}
    />,
  );
  const el = (sel: string) => container.querySelector<HTMLElement>(sel)!;
  return {
    container,
    /** Le bloc des tuiles de cadence, en tête de rail. */
    cadence: el(".dm-sess .mini"),
    /** La liste des lignes — « ordre de passage ». */
    frise: el(".dm-fr"),
    /** Une tuile par son libellé (« Appels », « WhatsApp »…). */
    tuile: (lb: string) => within(el(".dm-sess .mini")).getByText(lb).closest<HTMLElement>("div")!,
    /** Les pastilles de filtre, dans l'ordre. */
    pastilles: () => Array.from(container.querySelectorAll(".dm-filt .dm-chip")),
  };
}

describe("DemRail — la cadence du jour", () => {
  it("n'affiche plus d'heure sur les lignes", () => {
    const { frise } = renderRail(lot("whatsapp", 3));
    expect(within(frise).queryByText(/^\d{2}:\d{2}$/)).toBeNull();
  });

  it("numérote l'ordre de passage à la place", () => {
    const { frise } = renderRail(lot("whatsapp", 3));
    const rangs = Array.from(frise.querySelectorAll(".dm-tk .tm")).map((n) => n.textContent);
    expect(rangs).toEqual(["1", "2", "3"]);
  });

  it("démarre la journée à 0/20 et non à 20/20", () => {
    // Le compteur du jour mesure l'AVANCEMENT, pas la charge : au matin rien
    // n'est fait, il affiche 0 — et les 20 à faire sont dits juste en dessous.
    const { tuile } = renderRail(lot("whatsapp", 25));
    const wa = tuile("WhatsApp 1er contact");
    expect(within(wa).getByText("0")).toBeInTheDocument();
    expect(within(wa).getByText(`/${DAILY_QUOTA.whatsapp}`)).toBeInTheDocument();
    expect(within(wa).getByText(`${DAILY_QUOTA.whatsapp} à faire`)).toBeInTheDocument();
  });

  it("s'incrémente au fil des envois", () => {
    const { tuile } = renderRail(lot("whatsapp", 25), { doneToday: { whatsapp: 3 } });
    const wa = tuile("WhatsApp 1er contact");
    expect(within(wa).getByText("3")).toBeInTheDocument();
    expect(within(wa).getByText("17 à faire")).toBeInTheDocument();
  });

  it("annonce sur demain ce qui a débordé du jour", () => {
    const { tuile } = renderRail(lot("whatsapp", 25), { offset: 1 });
    const wa = tuile("WhatsApp 1er contact");
    expect(within(wa).getByText(String(25 - DAILY_QUOTA.whatsapp))).toBeInTheDocument();
  });

  it("laisse un canal sans tâche à 0, sans inventer son quota", () => {
    // Aucune séquence à l'étape appel : la tuile Appels reste à 0, en grisé.
    const { tuile } = renderRail(lot("whatsapp", 25));
    const appels = tuile("Appels");
    expect(appels).toHaveAttribute("data-empty", "1");
    expect(within(appels).getByText("0")).toBeInTheDocument();
    expect(within(appels).queryByText(/à faire/)).toBeNull();
  });

  it("compte la journée entière, pas la liste filtrée", () => {
    const { tuile } = renderRail([...lot("call", 4), ...lot("whatsapp", 6)], { filt: "call" });
    expect(within(tuile("Appels")).getByText("4 à faire")).toBeInTheDocument();
    expect(within(tuile("WhatsApp 1er contact")).getByText("6 à faire")).toBeInTheDocument();
  });

  it("laisse le reste à faire tomber à zéro quand la journée est bouclée", () => {
    const { tuile } = renderRail(lot("whatsapp", DAILY_QUOTA.whatsapp), {
      doneToday: { whatsapp: DAILY_QUOTA.whatsapp },
    });
    const wa = tuile("WhatsApp 1er contact");
    expect(within(wa).getByText(String(DAILY_QUOTA.whatsapp))).toBeInTheDocument();
    expect(within(wa).queryByText(/à faire/)).toBeNull();
  });

  it("signale l'échéance dépassée sur la ligne, faute d'onglet « Retard »", () => {
    const { frise } = renderRail([task({ id: "vieux", due_at: "2026-08-01T09:00:00.000Z" })]);
    expect(within(frise).getByText("échéance passée")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Retard/ })).toBeNull();
  });
});

describe("DemRail — la barre du haut ne dit que des dates", () => {
  it("nomme les onglets par leur date, pas par un panier", () => {
    renderRail(lot("whatsapp", 25));
    const onglets = screen.getAllByRole("tab").map((b) => b.querySelector(".l")?.textContent);
    expect(onglets).toEqual(["Auj. 13", "Dem. 14"]);
  });

  it("date les journées au-delà de demain par leur jour de semaine", () => {
    renderRail(lot("whatsapp", DAILY_QUOTA.whatsapp * 3));
    const onglets = screen.getAllByRole("tab").map((b) => b.querySelector(".l")?.textContent);
    expect(onglets).toEqual(["Auj. 13", "Dem. 14", "sam. 15"]);
  });

  it("ne montre plus les signaux comme des jours", () => {
    renderRail([
      task({ id: "d", in_conversation: true }),
      task({ id: "c", kind: "call", intent: { ...INTENT, callWhen: "maintenant" } }),
    ]);
    expect(screen.queryByRole("tab", { name: /discussion/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Chauds/ })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("n'ouvre pas d'onglet pour un jour vide", () => {
    // 3 WhatsApp tiennent tous aujourd'hui : demain n'existe pas.
    renderRail(lot("whatsapp", 3));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });
});

describe("DemRail — les pastilles suivent les tâches du jour", () => {
  const libelles = (chips: Element[]) =>
    chips.map((c) => c.textContent?.replace(/\d+$/, "").trim());

  it("ne propose que les canaux réellement présents", () => {
    const { pastilles } = renderRail([...lot("call", 2), ...lot("whatsapp", 3)]);
    expect(libelles(pastilles())).toEqual(["Tout", "Appels", "WhatsApp"]);
  });

  it("fait apparaître un canal dès qu'une tâche l'utilise", () => {
    const { pastilles } = renderRail([
      ...lot("whatsapp", 2),
      task({ id: "li", kind: "linkedin" }),
      task({ id: "w", kind: "wait" }),
    ]);
    expect(libelles(pastilles())).toEqual(["Tout", "WhatsApp", "LinkedIn", "Attentes"]);
  });

  it("ajoute « En discussion » aux pastilles, là où c'était un onglet", () => {
    const { pastilles } = renderRail([...lot("whatsapp", 2), task({ id: "d", in_conversation: true })]);
    expect(libelles(pastilles())).toContain("En discussion");
  });

  it("compte ce que chaque pastille retiendra", () => {
    const { pastilles } = renderRail([...lot("call", 2), ...lot("whatsapp", 3)]);
    expect(pastilles().map((c) => c.querySelector(".n")?.textContent)).toEqual(["5", "2", "3"]);
  });
});

describe("DemRail — l'étape de séquence est lisible et filtrable", () => {
  const troisEtapes = [
    task({ id: "a", sequence: etape(1) }),
    task({ id: "b", sequence: etape(3) }),
    task({ id: "c", kind: "wait", sequence: etape(4) }),
  ];

  it("écrit l'étape sur la ligne, avec son rang dans la séquence", () => {
    const { frise } = renderRail(troisEtapes);
    expect(within(frise).getByText("étape 1/5")).toBeInTheDocument();
    expect(within(frise).getByText("étape 3/5")).toBeInTheDocument();
  });

  it("propose de trier par étape dès qu'il y en a plusieurs", () => {
    const { container } = renderRail(troisEtapes);
    const steps = container.querySelector<HTMLElement>(".dm-filt.steps")!;
    expect(within(steps).getByText("toutes")).toBeInTheDocument();
    expect(Array.from(steps.querySelectorAll(".dm-chip")).map((c) => c.textContent)).toEqual([
      "toutes",
      "1",
      "3",
      "4",
    ]);
  });

  it("ne propose pas de trier quand tout est à la même étape", () => {
    const { container } = renderRail([task({ id: "a", sequence: etape(1) }), task({ id: "b", sequence: etape(1) })]);
    expect(container.querySelector(".dm-filt.steps")).toBeNull();
  });

  it("ne garde que l'étape choisie", () => {
    const { frise } = renderRail(troisEtapes, { step: 3 });
    expect(frise.querySelectorAll(".dm-tk")).toHaveLength(1);
    expect(within(frise).getByText("Prospect b")).toBeInTheDocument();
  });
});

describe("DemRail — le panier « En discussion » est devenu une ligne", () => {
  const enDiscussion = (id: string) => ({ ...task({ id }), in_conversation: true });

  it("a sa propre tuile, séparée du compteur de premiers contacts", () => {
    const { tuile } = renderRail([...lot("whatsapp", 25), enDiscussion("d1"), enDiscussion("d2")]);
    const disc = tuile("Discussion en cours");
    expect(within(disc).getByText("2")).toBeInTheDocument();
    // Aucun plafond affiché : on répond à ce qui vient.
    expect(within(disc).queryByText(/^\/\d+$/)).toBeNull();
  });

  it("dit combien de discussions ont déjà été traitées aujourd'hui", () => {
    const { tuile } = renderRail([enDiscussion("d1")], { doneConversation: 4 });
    expect(within(tuile("Discussion en cours")).getByText("4 traitées")).toBeInTheDocument();
  });

  it("marque la ligne au lieu de l'exiler dans un onglet", () => {
    const { container, frise } = renderRail([...lot("whatsapp", 3), enDiscussion("d1")]);
    expect(container.querySelector('.dm-tk[data-conv="1"]')).not.toBeNull();
    expect(within(frise).getByText("a répondu")).toBeInTheDocument();
    expect(screen.getByText(/sans plafond ni report/)).toBeInTheDocument();
  });

  it("ne consomme aucune place du démarchage du jour", () => {
    // 20 premiers contacts tiennent toujours aujourd'hui : la discussion ne
    // leur a pris aucune place.
    const { tuile } = renderRail([...lot("whatsapp", DAILY_QUOTA.whatsapp), enDiscussion("d1")]);
    expect(within(tuile("WhatsApp 1er contact")).getByText(`${DAILY_QUOTA.whatsapp} à faire`)).toBeInTheDocument();
    expect(within(tuile("WhatsApp 1er contact")).queryByText(/reportés/)).toBeNull();
  });

  it("dit que le quota ne porte que sur les premiers contacts", () => {
    renderRail(lot("whatsapp", 3));
    expect(screen.getByText(/premiers contacts WhatsApp par/)).toBeInTheDocument();
  });
});

const INTENT: NonNullable<DemarchageTask["intent"]> = {
  score: 90,
  tier: "tres_chaud",
  flame: "🔥🔥",
  callWhen: "maintenant",
  reasons: ["A envoyé le formulaire depuis la démo"],
  sessions: 3,
  pageViews: 7,
  engagementSec: 120,
  lastDay: "2026-08-13",
  missed: false,
  daysSinceVisit: 0,
};

describe("DemRail — le signal d'intention", () => {
  const chaud = task({ id: "chaud", intent: INTENT });

  it("sort l'emoji de la ligne du nom et le met dans sa propre case", () => {
    renderRail([chaud]);
    const flamme = screen.getByTitle("A envoyé le formulaire depuis la démo");
    // Sa propre case, teintée selon la chaleur — plus un bout du nom.
    expect(flamme).toHaveClass("fl");
    expect(flamme).toHaveAttribute("data-heat", "hot");
    expect(flamme.textContent).toBe("🔥🔥");
    // Le nom, lui, ne porte que le nom.
    const nom = screen.getByText("Prospect chaud");
    expect(nom).toHaveClass("t");
    expect(nom.textContent).toBe("Prospect chaud");
  });

  it("teinte la carte entière, pas seulement le texte", () => {
    const { container } = renderRail([chaud]);
    expect(container.querySelector('.dm-tk[data-heat="hot"]')).not.toBeNull();
  });
});
