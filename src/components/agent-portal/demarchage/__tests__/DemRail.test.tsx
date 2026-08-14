import React from "react";
import { render, screen, within } from "@testing-library/react";
import { DemRail } from "../DemRail";
import { DAILY_QUOTA, bucketTasks } from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageBucketKey } from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageTask } from "../types";

/**
 * La file annonce une CADENCE, pas un horaire.
 *
 * Ce qui est vérifié ici est exactement ce qui était faux avant : une heure
 * inventée par le moteur sur chaque ligne, un compteur par canal qui suivait le
 * filtre affiché au lieu de la journée réelle, et l'emoji d'intention collé au
 * nom de l'entreprise.
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

function renderRail(
  tasks: DemarchageTask[],
  { day = "today" as DemarchageBucketKey, doneToday = {} as Record<string, number> } = {},
) {
  const buckets = bucketTasks(tasks, { now: NOW, timeZone: "UTC", doneToday });
  const { container } = render(
    <DemRail
      buckets={buckets}
      day={day}
      setDay={jest.fn()}
      filt="all"
      setFilt={jest.fn()}
      tasks={buckets[day]}
      meta={{ done_today: 0, done_today_by_kind: doneToday }}
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

  it("plafonne le jour au quota et annonce ce qui part au lendemain", () => {
    const { tuile } = renderRail(lot("whatsapp", 25));
    const wa = tuile("WhatsApp");
    expect(within(wa).getByText(String(DAILY_QUOTA.whatsapp))).toBeInTheDocument();
    expect(within(wa).getByText(`/${DAILY_QUOTA.whatsapp}`)).toBeInTheDocument();
    expect(within(wa).getByText(`+${25 - DAILY_QUOTA.whatsapp} reportés`)).toBeInTheDocument();
  });

  it("laisse un canal sans tâche à 0 plutôt que d'inventer son quota", () => {
    // Aucune séquence à l'étape appel : la tuile Appels reste à 0, en grisé.
    const { tuile } = renderRail(lot("whatsapp", 25));
    const appels = tuile("Appels");
    expect(appels).toHaveAttribute("data-empty", "1");
    expect(within(appels).getByText("0")).toBeInTheDocument();
    expect(within(appels).queryByText(`/${DAILY_QUOTA.call}`)).toBeNull();
  });

  it("compte le panier entier, pas la liste filtrée", () => {
    const { tuile } = renderRail([...lot("call", 4), ...lot("whatsapp", 6)]);
    expect(within(tuile("Appels")).getByText("4")).toBeInTheDocument();
    expect(within(tuile("WhatsApp")).getByText("6")).toBeInTheDocument();
  });

  it("décompte ce qui a déjà été fait aujourd'hui", () => {
    const { tuile } = renderRail(lot("whatsapp", 25), { doneToday: { whatsapp: 18 } });
    expect(within(tuile("WhatsApp")).getByText("2")).toBeInTheDocument();
  });

  it("écrit « — » pour un jour vide plutôt que « 0 act. »", () => {
    renderRail(lot("whatsapp", 3));
    // « Demain » est vide : 3 WhatsApp tiennent tous aujourd'hui.
    expect(within(screen.getByRole("tab", { name: /Demain/ })).getByText("—")).toBeInTheDocument();
  });

  it("signale l'échéance dépassée sur la ligne, faute d'onglet « Retard »", () => {
    const { frise } = renderRail([task({ id: "vieux", due_at: "2026-08-01T09:00:00.000Z" })]);
    expect(within(frise).getByText("échéance passée")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Retard/ })).toBeNull();
  });
});

describe("DemRail — le panier « En discussion »", () => {
  const enDiscussion = (id: string) => ({ ...task({ id }), in_conversation: true });

  it("sort les discussions du plan et n'y affiche aucun quota", () => {
    const { tuile, frise } = renderRail(
      [...lot("whatsapp", 25), enDiscussion("d1"), enDiscussion("d2")],
      { day: "conversation" },
    );
    expect(frise.querySelectorAll(".dm-tk")).toHaveLength(2);
    // Pas de cadence sur ce panier : on répond à ce qui vient.
    expect(within(tuile("WhatsApp")).queryByText(`/${DAILY_QUOTA.whatsapp}`)).toBeNull();
    expect(screen.getByText(/sans plafond ni report/)).toBeInTheDocument();
  });

  it("ne fait pas déborder la cadence du jour", () => {
    // 20 premiers contacts tiennent toujours aujourd'hui : la discussion ne
    // leur a pris aucune place.
    const { tuile } = renderRail([...lot("whatsapp", DAILY_QUOTA.whatsapp), enDiscussion("d1")]);
    expect(within(tuile("WhatsApp")).getByText(String(DAILY_QUOTA.whatsapp))).toBeInTheDocument();
    expect(within(tuile("WhatsApp")).queryByText(/reportés/)).toBeNull();
  });

  it("dit que le quota ne porte que sur les premiers contacts", () => {
    renderRail(lot("whatsapp", 3));
    expect(screen.getByText(/premiers contacts WhatsApp par/)).toBeInTheDocument();
  });
});

describe("DemRail — le signal d'intention", () => {
  const chaud = task({
    id: "chaud",
    intent: {
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
    },
  });

  it("sort l'emoji de la ligne du nom et le met dans sa propre case", () => {
    renderRail([chaud], { day: "hot" });
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
    const { container } = renderRail([chaud], { day: "hot" });
    expect(container.querySelector('.dm-tk[data-heat="hot"]')).not.toBeNull();
  });
});
