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
  {
    day = "today" as DemarchageBucketKey,
    doneToday = {} as Record<string, number>,
    doneConversation = 0,
  } = {},
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
    const { tuile } = renderRail(lot("whatsapp", 25), { day: "tomorrow" });
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

  it("compte le panier entier, pas la liste filtrée", () => {
    const { tuile } = renderRail([...lot("call", 4), ...lot("whatsapp", 6)], { day: "tomorrow" });
    // Rien demain : les deux canaux tiennent aujourd'hui.
    expect(within(tuile("Appels")).getByText("0")).toBeInTheDocument();
    const auj = renderRail([...lot("call", 4), ...lot("whatsapp", 6)]);
    expect(within(auj.tuile("Appels")).getByText("4 à faire")).toBeInTheDocument();
    expect(within(auj.tuile("WhatsApp 1er contact")).getByText("6 à faire")).toBeInTheDocument();
  });

  it("laisse le reste à faire tomber à zéro quand la journée est bouclée", () => {
    const { tuile } = renderRail(lot("whatsapp", DAILY_QUOTA.whatsapp), {
      doneToday: { whatsapp: DAILY_QUOTA.whatsapp },
    });
    const wa = tuile("WhatsApp 1er contact");
    expect(within(wa).getByText(String(DAILY_QUOTA.whatsapp))).toBeInTheDocument();
    expect(within(wa).queryByText(/à faire/)).toBeNull();
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

  it("sort les discussions du plan", () => {
    const { frise } = renderRail(
      [...lot("whatsapp", 25), enDiscussion("d1"), enDiscussion("d2")],
      { day: "conversation" },
    );
    expect(frise.querySelectorAll(".dm-tk")).toHaveLength(2);
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
