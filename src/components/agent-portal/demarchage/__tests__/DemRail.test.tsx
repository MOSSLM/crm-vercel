import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemRail } from "../DemRail";
import {
  fileDeLaJournee,
  hasSignal,
  repartirLaJournee,
  type DemarchageSignal,
  type FileDeTravail,
} from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageQueueMeta, DemarchageTask } from "../types";
import type { EtatSite } from "@/lib/agent-portal/etat-site";

/**
 * LE RAIL, APRÈS LA SECONDE REFONTE.
 *
 * Ce que ce fichier garde, cinq décisions :
 *
 * 1. TROIS FILES. À contacter (un stock), Relances (le jour), En attente (rien
 *    à envoyer, une réponse à déclarer). Les attentes vivaient dans les
 *    relances, réparties sur sept cases de calendrier : personne ne les voyait,
 *    et des séquences dormaient.
 * 2. PLUS DE FRISE DE JOURS. Ce qui est dû plus tard est COMPTÉ en pied de
 *    liste et dépliable, pas étalé sur sept cases dont une seule sert.
 * 3. UNE SEULE BARRE DE FILTRES. Le canal en clair (on en change dix fois par
 *    jour), le reste derrière un bouton qui dit combien il retient.
 * 4. LES FILTRES RESTENT INDÉPENDANTS. Un lead peut être chaud ET en discussion
 *    ET sur une tâche WhatsApp : choisir l'un ne relâche pas les autres.
 * 5. L'OBJECTIF N'EST PAS UN PLAFOND. Rien n'est renvoyé au lendemain : cent
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

/** Une attente de réponse : la séquence est garée, il n'y a rien à envoyer. */
const attente = (over: Partial<DemarchageTask> & { id: string }) =>
  relance({ kind: "wait", ...over });

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
    file = "premiers" as FileDeTravail,
    aVenirOuvert = false,
    canal = null as string | null,
    signal = null as DemarchageSignal | null,
    step = null as number | null,
    etatSite = null as EtatSite | null,
    sel = null as string | null,
    doneToday = {} as Record<string, number>,
    quotas,
    setFile = jest.fn(),
    setCanal = jest.fn(),
    setSignal = jest.fn(),
    setStep = jest.fn(),
    setEtatSite = jest.fn(),
    setAVenirOuvert = jest.fn(),
    onPick = jest.fn(),
    onBasculerEnAppel = jest.fn(),
    poolDispo = null as number | null,
  } = {},
) {
  const rep = repartirLaJournee(tasks, { now: NOW, timeZone: "UTC" });
  const shown = fileDeLaJournee(rep, file, aVenirOuvert).filter(
    (t) =>
      (canal == null || t.kind === canal) &&
      (signal == null || hasSignal(t, signal)) &&
      (step == null || t.sequence?.stepIndex === step) &&
      (etatSite == null || t.etat_site === etatSite),
  );

  const meta: DemarchageQueueMeta = {
    done_today: Object.values(doneToday).reduce((a, b) => a + b, 0),
    done_today_by_kind: doneToday,
    done_today_conversation: 0,
    ...(quotas !== undefined ? { quotas } : {}),
  };

  const { container } = render(
    <DemRail
      file={file}
      setFile={setFile}
      rep={rep}
      aVenirOuvert={aVenirOuvert}
      setAVenirOuvert={setAVenirOuvert}
      canal={canal}
      setCanal={setCanal}
      signal={signal}
      setSignal={setSignal}
      step={step}
      setStep={setStep}
      cohorte={null}
      setCohorte={jest.fn()}
      etatSite={etatSite}
      setEtatSite={setEtatSite}
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
  /** Ouvre le panneau des filtres repliés — signal, cohorte, étape. */
  const ouvrirFiltres = () => {
    fireEvent.click(container.querySelector<HTMLElement>(".dm-chip.more")!);
    return el(".dm-fmenu");
  };
  return {
    container,
    setFile,
    setCanal,
    setSignal,
    setStep,
    setEtatSite,
    setAVenirOuvert,
    onPick,
    onBasculerEnAppel,
    ouvrirFiltres,
    /** La liste — tout ce que le rail affiche. */
    frise: el(".dm-fr"),
    lignes: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-tk")),
    onglets: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-file")),
    objectifs: () => Array.from(container.querySelectorAll<HTMLElement>(".dm-obj1 .c")),
    /** Un groupe du panneau des filtres, par son intitulé. */
    groupe: (lb: string) =>
      Array.from(container.querySelectorAll<HTMLElement>(".dm-fmenu .g")).find((g) =>
        g.querySelector(".lb")?.textContent?.includes(lb),
      ),
  };
}

describe("DemRail — trois files, pas deux", () => {
  const melange = [
    task({ id: "neuf1" }),
    task({ id: "neuf2" }),
    relance({ id: "suivi1", due_at: iso("2026-08-13") }),
    attente({ id: "att1" }),
  ];

  it("annonce le contenu de chaque file, chiffres à l'appui", () => {
    const { onglets } = renderRail(melange);
    const [premiers, relances, attentes] = onglets();
    expect(within(premiers).getByText("À contacter")).toBeInTheDocument();
    expect(within(premiers).getByText("2")).toBeInTheDocument();
    expect(within(relances).getByText("Relances")).toBeInTheDocument();
    expect(within(attentes).getByText("En attente")).toBeInTheDocument();
    expect(within(attentes).getByText("1")).toBeInTheDocument();
  });

  it("ne montre que la file ouverte", () => {
    const { lignes } = renderRail(melange, { file: "premiers" });
    const noms = lignes().map((l) => l.textContent).join(" ");
    expect(noms).toContain("Prospect neuf1");
    expect(noms).not.toContain("Prospect suivi1");
    expect(noms).not.toContain("Prospect att1");
  });

  it("bascule de file au clic", () => {
    const { onglets, setFile } = renderRail(melange);
    fireEvent.click(onglets()[2]);
    expect(setFile).toHaveBeenCalledWith("attentes");
  });

  it("range une discussion ouverte dans les relances, jamais dans les premiers contacts", () => {
    const { onglets } = renderRail([enDiscussion({ id: "d1" })]);
    expect(within(onglets()[0]).getByText("0")).toBeInTheDocument();
    expect(within(onglets()[1]).getByText("1")).toBeInTheDocument();
  });

  /**
   * LE GRIEF, MOT POUR MOT : « on ne peut pas voir les en attente ». Une
   * attente n'est pas une relance — rien à envoyer, une réponse à déclarer —
   * et mêlée aux relances elle était introuvable.
   */
  it("donne aux attentes leur propre file, et dit ce qu'on y fait", () => {
    const { lignes } = renderRail([attente({ id: "att1" }), relance({ id: "r1" })], {
      file: "attentes",
    });
    expect(lignes()).toHaveLength(1);
    expect(screen.getByText(/dire « il a répondu » suffit/)).toBeInTheDocument();
  });
});

describe("DemRail — plus de frise de jours", () => {
  const dansLeTemps = [
    relance({ id: "auj", due_at: iso("2026-08-13") }),
    relance({ id: "dem", due_at: iso("2026-08-14") }),
    relance({ id: "loin", due_at: iso("2026-09-15") }),
  ];

  it("n'affiche aucune case de calendrier", () => {
    const { container } = renderRail(dansLeTemps, { file: "relances" });
    expect(container.querySelectorAll(".dm-cd")).toHaveLength(0);
  });

  it("ne garde dans la journée que ce qui est dû, et compte le reste en pied", () => {
    const { lignes } = renderRail(dansLeTemps, { file: "relances" });
    expect(lignes()).toHaveLength(1);
    expect(screen.getByText("2 relances prévues plus tard")).toBeInTheDocument();
  });

  it("déplie ce qui est prévu plus tard à la demande", () => {
    const { setAVenirOuvert } = renderRail(dansLeTemps, { file: "relances" });
    fireEvent.click(screen.getByText("2 relances prévues plus tard"));
    expect(setAVenirOuvert).toHaveBeenCalledWith(true);
  });

  it("date les lignes dépliées — sans quoi elles passeraient pour du travail du jour", () => {
    const { lignes } = renderRail(dansLeTemps, { file: "relances", aVenirOuvert: true });
    expect(lignes()).toHaveLength(3);
    const dates = Array.from(
      lignes()[1].querySelectorAll<HTMLElement>(".st.plus-tard"),
    ).map((s) => s.textContent);
    expect(dates).toHaveLength(1);
  });

  it("ne propose pas de pied quand rien n'est prévu plus tard", () => {
    renderRail([relance({ id: "auj" })], { file: "relances" });
    expect(screen.queryByText(/prévue?s? plus tard/)).toBeNull();
  });
});

describe("DemRail — l'objectif du jour, sur une ligne", () => {
  it("affiche fait / objectif", () => {
    const { objectifs } = renderRail(
      Array.from({ length: 30 }, (_, i) => task({ id: `w${i}` })),
      { doneToday: { whatsapp: 12 } },
    );
    expect(objectifs()[0].textContent).toContain("12");
    expect(objectifs()[0].textContent).toContain("/20");
  });

  it("laisse dépasser l'objectif au lieu de cacher le surplus", () => {
    // C'est LE point de la refonte d'origine. L'ancien plan gardait vingt
    // lignes et poussait le reste à demain : la file cachait le travail décidé.
    const { objectifs, lignes } = renderRail(
      Array.from({ length: 25 }, (_, i) => task({ id: `w${i}` })),
      { doneToday: { whatsapp: 26 } },
    );
    expect(objectifs()[0].dataset.full).toBe("1");
    expect(lignes()).toHaveLength(25);
  });

  it("ne montre l'objectif que des canaux réellement en file", () => {
    const { objectifs } = renderRail([task({ id: "w1" })]);
    expect(objectifs()).toHaveLength(1);
    expect(objectifs()[0].getAttribute("title")).toContain("WhatsApp");
  });

  it("respecte l'objectif réglé par l'agent", () => {
    const { objectifs } = renderRail([task({ id: "w1" })], { quotas: { whatsapp: 60 } });
    expect(objectifs()[0].textContent).toContain("/60");
  });

  it("n'affiche aucun objectif hors des premiers contacts", () => {
    const { objectifs } = renderRail([relance({ id: "r1" })], { file: "relances" });
    expect(objectifs()).toHaveLength(0);
  });

  it("le dit quand la file des premiers contacts est vide", () => {
    renderRail([relance({ id: "r1" })], { file: "premiers" });
    expect(screen.getByText(/Aucun premier contact en attente/)).toBeInTheDocument();
  });
});

describe("DemRail — une seule barre, des dimensions toujours séparées", () => {
  // Un chaud sur WhatsApp, un chaud en discussion, un tiède : de quoi vérifier
  // qu'aucune des deux dimensions n'écrase l'autre.
  const melange = [
    chaud({ id: "c1", kind: "whatsapp", premiere_touche_le: iso("2026-08-01") }),
    { ...enDiscussion({ id: "c2", kind: "whatsapp" }), intent: chaud({ id: "x" }).intent },
    relance({ id: "tiede", kind: "call" }),
  ];

  it("laisse le canal en clair et replie le reste derrière un bouton", () => {
    const { container } = renderRail(melange, { file: "relances" });
    // Deux canaux présents, donc deux pastilles plus « tous ».
    expect(container.querySelectorAll(".dm-fbar .dm-chip.ic")).toHaveLength(2);
    // Et rien d'autre n'est déplié tant qu'on ne le demande pas.
    expect(container.querySelector(".dm-fmenu")).toBeNull();
  });

  it("compte un prospect chaud ET en discussion dans LES DEUX pastilles", () => {
    // Le défaut d'origine : `signalOf` ne rendait qu'un signal, donc un chaud
    // qui répondait disparaissait de « Chauds » — au moment précis où il
    // devenait intéressant.
    const { ouvrirFiltres, groupe } = renderRail(melange, { file: "relances" });
    ouvrirFiltres();
    const signaux = groupe("Signal")!;
    // Deux chauds, dont un qui a répondu : il est compté dans les DEUX
    // pastilles, et la somme dépasse donc le nombre de lignes. C'est exact.
    expect(within(signaux).getByText("Chauds").querySelector(".n")?.textContent).toBe("2");
    expect(within(signaux).getByText("En discussion").querySelector(".n")?.textContent).toBe("1");
  });

  it("garde le canal quand on choisit un signal — les deux se cumulent", () => {
    const { ouvrirFiltres, groupe, setCanal, setSignal } = renderRail(melange, {
      file: "relances",
      canal: "whatsapp",
    });
    ouvrirFiltres();
    fireEvent.click(within(groupe("Signal")!).getByText("En discussion"));
    expect(setSignal).toHaveBeenCalledWith("conversation");
    // Le canal n'est pas touché : choisir un signal ne le relâche pas.
    expect(setCanal).not.toHaveBeenCalled();
  });

  it("relâche le filtre quand on reclique la pastille déjà cochée", () => {
    const { ouvrirFiltres, groupe, setSignal } = renderRail(melange, {
      file: "relances",
      signal: "conversation",
    });
    ouvrirFiltres();
    fireEvent.click(within(groupe("Signal")!).getByText("En discussion"));
    expect(setSignal).toHaveBeenCalledWith(null);
  });

  it("annonce sur le bouton combien de filtres repliés sont actifs", () => {
    const { container } = renderRail(melange, { file: "relances", signal: "hot" });
    const bouton = container.querySelector<HTMLElement>(".dm-chip.more")!;
    expect(bouton.textContent).toContain("1");
    expect(bouton.getAttribute("aria-pressed")).toBe("true");
  });

  it("relâche tout d'un geste", () => {
    const { ouvrirFiltres, container, setSignal } = renderRail(melange, {
      file: "relances",
      signal: "hot",
    });
    ouvrirFiltres();
    fireEvent.click(container.querySelector<HTMLElement>(".dm-fclear")!);
    expect(setSignal).toHaveBeenCalledWith(null);
  });

  it("écrit TOUS les signaux sur la ligne", () => {
    const { container } = renderRail(melange, { file: "relances" });
    const tags = Array.from(container.querySelectorAll<HTMLElement>(".dm-tk .st.sig")).map(
      (s) => s.dataset.sig,
    );
    expect(tags).toContain("hot");
    expect(tags).toContain("conversation");
  });

  it("ne propose aucun bouton de filtre quand rien n'est filtrable", () => {
    const { container } = renderRail([task({ id: "a" })]);
    expect(container.querySelector(".dm-chip.more")).toBeNull();
  });
});

/**
 * AVEC SITE / SANS SITE — la quatrième dimension de la file.
 *
 * Ce que ces trois tests tiennent, c'est la SÉPARATION des deux absences :
 * « vérifié » (on a cherché, il n'y a rien) et « à vérifier » (personne n'a
 * regardé) ne peuvent pas tomber dans la même pastille. Au 01/09/2026 la base
 * porte 74 absences confirmées pour 34 244 fiches jamais regardées : les
 * additionner ferait promettre au téléphone quatre cent cinquante fois ce
 * qu'on est capable de démontrer.
 */
describe("DemRail — avec site, sans site, pas encore regardé", () => {
  const parc = [
    relance({ id: "avec", etat_site: "present" }),
    relance({ id: "sans1", etat_site: "absent", site_constate_le: iso("2026-08-17") }),
    relance({ id: "sans2", etat_site: "absent" }),
    relance({ id: "jamais", etat_site: "inconnu" }),
  ];

  it("propose les trois états, chacun avec son compte", () => {
    const { ouvrirFiltres, groupe } = renderRail(parc, { file: "relances" });
    ouvrirFiltres();
    const g = groupe("Site")!;
    expect(within(g).getByText("avec site").textContent).toContain("1");
    expect(within(g).getByText("sans site · vérifié").textContent).toContain("2");
    expect(within(g).getByText("sans site · à vérifier").textContent).toContain("1");
  });

  it("filtre sur l'absence CONSTATÉE sans emporter celles qu'on n'a pas vérifiées", () => {
    const { ouvrirFiltres, groupe, setEtatSite } = renderRail(parc, { file: "relances" });
    ouvrirFiltres();
    fireEvent.click(within(groupe("Site")!).getByText("sans site · vérifié"));
    expect(setEtatSite).toHaveBeenCalledWith("absent");

    // Et la file, une fois le filtre posé, ne rend QUE les deux constatées.
    const { lignes } = renderRail(parc, { file: "relances", etatSite: "absent" });
    expect(lignes()).toHaveLength(2);
  });

  it("ne propose rien à trier quand toute la file a un site", () => {
    // La barre existe pour une AUTRE dimension (un prospect a répondu) : c'est
    // ce qui rend le test concluant — le groupe « Site » manque parce qu'il n'a
    // rien à trier, pas parce que le panneau est fermé.
    const { ouvrirFiltres, groupe } = renderRail(
      [
        relance({ id: "a", etat_site: "present" }),
        enDiscussion({ id: "b", etat_site: "present" }),
      ],
      { file: "relances" },
    );
    ouvrirFiltres();
    expect(groupe("Signal")).toBeDefined();
    // Une pastille unique qui rend la même liste est un bouton qui ment.
    expect(groupe("Site")).toBeUndefined();
  });

  it("marque les deux absences sur la ligne, et laisse la présence muette", () => {
    const { container } = renderRail(parc, { file: "relances" });
    const tags = Array.from(container.querySelectorAll<HTMLElement>(".dm-tk .st.site"));
    expect(tags.map((t) => t.dataset.site)).toEqual(["absent", "absent", "inconnu"]);
    // La date rend le « vérifié » vérifiable : sans elle, il ne prouve rien.
    expect(tags[0].getAttribute("title")).toContain("17/08/2026");
  });

  /**
   * 115 tâches de la file portaient les deux au 01/09/2026 : une cohorte
   * « B_sans_site » figée en août, et une URL trouvée depuis. Laisser la seule
   * version périmée à l'écran est le seul cas où se taire ment.
   */
  it("dément la cohorte quand elle annonce « sans site » sur une fiche qui en a un", () => {
    const { container } = renderRail(
      [
        relance({ id: "perime", etat_site: "present", cohorte: "B_sans_site" }),
        relance({ id: "coherent", etat_site: "present", cohorte: "A_site_faible" }),
      ],
      { file: "relances" },
    );
    const tags = Array.from(container.querySelectorAll<HTMLElement>(".dm-tk .st.site"));
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("a un site");
  });

  /** Deux étiquettes voisines écrivant les mêmes mots ne se lisent plus. */
  it("ne redit pas les mots de l'étiquette de cohorte", () => {
    const { container } = renderRail(
      [relance({ id: "x", etat_site: "absent", cohorte: "B_sans_site" })],
      { file: "relances" },
    );
    const ligne = container.querySelector<HTMLElement>(".dm-tk")!;
    const cohorte = ligne.querySelector<HTMLElement>(".st.coh")!.textContent;
    const site = ligne.querySelector<HTMLElement>(".st.site")!.textContent;
    expect(cohorte).toBe("sans site");
    expect(site).not.toBe(cohorte);
  });
});

describe("DemRail — la liste, et rien qu'elle", () => {
  const file = [task({ id: "premier" }), task({ id: "second" }), task({ id: "troisieme" })];

  it("affiche TOUTES les lignes — aucune n'est absorbée par un bloc de tête", () => {
    // Une carte de tête a existé ici, qui reprenait le prospect en cours en
    // grand. Elle redisait ce que le centre de l'écran affiche déjà, à trois
    // centimètres de distance, et mangeait la place de la liste.
    const { lignes, container } = renderRail(file);
    expect(container.querySelector(".dm-now")).toBeNull();
    expect(lignes().map((l) => l.querySelector(".nm .t")?.textContent)).toEqual([
      "Prospect premier",
      "Prospect second",
      "Prospect troisieme",
    ]);
  });

  it("surligne la ligne ouverte", () => {
    const { lignes } = renderRail(file, { sel: "second" });
    expect(lignes().map((l) => l.dataset.s)).toEqual(["next", "now", "next"]);
  });

  it("bascule une tâche en appel d'un seul clic, sans l'ouvrir", () => {
    // Le geste qui manquait : décider d'appeler ne doit pas coûter un faux
    // « Fait » ni laisser la tâche traîner.
    const { lignes, onBasculerEnAppel } = renderRail(file);
    fireEvent.click(within(lignes()[1]).getByTitle("Transformer en appel"));
    expect(onBasculerEnAppel).toHaveBeenCalledWith("second");
  });

  it("ne propose pas de basculer un appel en appel", () => {
    const { lignes } = renderRail([task({ id: "a", kind: "call" })]);
    expect(within(lignes()[0]).queryByTitle("Transformer en appel")).toBeNull();
  });

  it("ne propose pas de basculer une attente : il n'y a rien à envoyer", () => {
    const { lignes } = renderRail([attente({ id: "a" })], { file: "attentes" });
    expect(within(lignes()[0]).queryByTitle("Transformer en appel")).toBeNull();
  });

  it("ouvre la ligne au clic", () => {
    const { lignes, onPick } = renderRail(file);
    fireEvent.click(lignes()[1]);
    expect(onPick).toHaveBeenCalledWith("second");
  });
});

describe("DemRail — ce que la ligne dit", () => {
  it("numérote l'ordre de passage plutôt que d'inventer une heure", () => {
    const { lignes } = renderRail([task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]);
    expect(lignes().map((l) => l.querySelector(".tm")?.textContent)).toEqual(["1", "2", "3"]);
  });

  it("signale l'échéance dépassée", () => {
    const { frise } = renderRail([relance({ id: "vieux", due_at: iso("2026-08-05") })], {
      file: "relances",
    });
    expect(within(frise).getByText("échéance passée")).toBeInTheDocument();
  });

  it("marque une mise de côté au lieu de la faire passer pour un oubli", () => {
    const { container } = renderRail(
      [
        relance({ id: "auj" }),
        relance({
          id: "range",
          status: "snoozed",
          due_at: iso("2026-08-25"),
          payload: { mise_de_cote: { jusquau: iso("2026-08-25"), motif: "En congés", le: iso("2026-08-13") } },
        }),
      ],
      { file: "relances", aVenirOuvert: true },
    );
    // Elle est dépliée avec « plus tard », datée, et dit qu'elle a été rangée
    // exprès — sinon on la relit comme un oubli et on la rappelle.
    expect(container.querySelectorAll(".dm-tk")).toHaveLength(2);
    expect(container.querySelector(".dm-tk .st.cote")).not.toBeNull();
  });

  it("écrit l'étape de séquence et permet de trier dessus", () => {
    const seq = (i: number) => ({
      name: "Artisans",
      stepLabel: `WhatsApp J+${i}`,
      stepIndex: i,
      totalSteps: 5,
      steps: [],
    });
    const { ouvrirFiltres, groupe, setStep, frise } = renderRail(
      [relance({ id: "a", sequence: seq(1) }), relance({ id: "b", sequence: seq(3) })],
      { file: "relances" },
    );
    expect(within(frise).getByText("étape 3/5")).toBeInTheDocument();
    ouvrirFiltres();
    fireEvent.click(within(groupe("Étape")!).getByText("3"));
    expect(setStep).toHaveBeenCalledWith(3);
  });

  it("sort l'emoji d'intention du nom, dans sa propre case", () => {
    const { lignes } = renderRail([chaud({ id: "b" })]);
    const ligne = lignes()[0];
    expect(ligne.querySelector(".nm .t")?.textContent).toBe("Prospect b");
    expect(ligne.querySelector(".nm .fl")?.textContent).toBe("🔥");
  });
});
