/**
 * LE RAIL RENDU EN HTML, pour REGARDER ce qu'une ligne de file donne vraiment.
 *
 * « Je comprends pas » est un grief d'ŒIL, et jsdom ne met rien en page : une
 * étiquette de plus, un liseré qui change de teinte, une bulle de légende de
 * 320 px — rien de tout ça ne se vérifie par `toBeInTheDocument()`. Ce fichier
 * sort le DOM réel avec sa vraie feuille de style, à ouvrir au navigateur (ou
 * à capturer) pour juger la charte sur pièces.
 *
 * Comme `pipeline-dump.manual.tsx` : exclu de la suite
 * (`testPathIgnorePatterns`), lancé à la main.
 *
 *     DEM_DUMP=/tmp/dem.html npx jest \
 *       --testMatch='**\/dem-rail-dump.manual.tsx' --testPathIgnorePatterns='/node_modules/'
 *
 * `--testPathIgnorePatterns` est NÉCESSAIRE : sans lui, le `\.manual\.` de
 * `jest.config.ts` écarte le fichier qu'on vient de désigner, et jest répond
 * « No tests found » sur un chemin pourtant exact.
 *
 * Deux variantes, parce que ce sont deux choses à juger :
 *   DEM_DUMP_MENU=1  sort le menu de filtres ouvert au lieu de la légende ;
 *   DEM_DUMP_DARK=1  sort le thème sombre — la moitié des jetons y changent.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemRail } from "../DemRail";
import { repartirLaJournee } from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageTask } from "../types";

const NOW = new Date("2026-09-03T10:00:00Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

let n = 0;
function tache(over: Partial<DemarchageTask> & { id: string }): DemarchageTask {
  n += 1;
  return {
    kind: "whatsapp",
    status: "pending",
    title: null,
    due_at: iso("2026-09-03"),
    contact_id: null,
    entreprise_id: n,
    opportunite_id: null,
    automation_id: null,
    enrollment_id: null,
    step_id: null,
    payload: {},
    contact: null,
    entreprise: { id: n, name: over.id, ville: "Annecy", telephone: "0650000000" },
    sequence: { name: "S1", stepLabel: "Accroche WhatsApp", stepIndex: 1, totalSteps: 8, steps: [] },
    intent: null,
    premiere_touche_le: iso("2026-08-20"),
    ...over,
  } as DemarchageTask;
}

/** Une file qui porte les trois états de démo, plus le reste du vocabulaire. */
const file: DemarchageTask[] = [
  tache({
    id: "ABADOM Chauffage",
    demo_etat: "prete",
    a_mobile: true,
    etat_site: "absent",
    cohorte: "B_sans_site",
    site_constate_le: iso("2026-08-17"),
  }),
  tache({
    id: "ENEOLE Climatisation",
    demo_etat: "prete",
    a_mobile: true,
    in_conversation: true,
    cohorte: "A_site_faible",
    intent: {
      score: 88,
      tier: "chaud",
      flame: "🔥",
      callWhen: "maintenant",
      reasons: ["a rouvert la démo hier"],
      sessions: 3,
      pageViews: 9,
      engagementSec: 128,
      lastDay: "2026-09-02",
      missed: false,
      daysSinceVisit: 1,
    },
  }),
  tache({
    id: "Azur Climat Froid",
    demo_etat: "chantier",
    a_mobile: true,
    etat_site: "inconnu",
    cohorte: "A_site_faible",
  }),
  tache({
    id: "JM2C Plomberie",
    demo_etat: "chantier",
    kind: "call",
    etat_site: "present",
    cohorte: "B_sans_site",
  }),
  tache({
    id: "Menuiserie Perret",
    demo_etat: "aucune",
    a_mobile: true,
    etat_site: "inconnu",
    due_at: iso("2026-09-01"),
  }),
  tache({ id: "Terrassement Vallier", demo_etat: "aucune", kind: "call", hors_sequence: true, sequence: null }),
  tache({ id: "Toiture Delorme", demo_etat: "aucune", etat_site: "present", cohorte: "B_sans_site" }),
];

it("écrit le rail en HTML, légende ouverte", () => {
  const rep = repartirLaJournee(file, { now: NOW, timeZone: "UTC" });
  const { container } = render(
    <DemRail
      file="relances"
      setFile={() => {}}
      rep={rep}
      aVenirOuvert={false}
      setAVenirOuvert={() => {}}
      canal={null}
      setCanal={() => {}}
      signal={null}
      setSignal={() => {}}
      step={null}
      setStep={() => {}}
      cohorte={null}
      setCohorte={() => {}}
      etatSite={null}
      setEtatSite={() => {}}
      etatDemo={null}
      setEtatDemo={() => {}}
      tri="passage"
      setTri={() => {}}
      tasks={rep.relances}
      meta={{ done_today: 7, done_today_by_kind: { whatsapp: 5, call: 2 }, done_today_conversation: 1 }}
      agentName="Bilal"
      loading={false}
      busy={false}
      sel={rep.relances[1]?.id ?? null}
      onPick={() => {}}
      onRechercher={() => {}}
      onBasculerEnAppel={() => {}}
      poolDispo={null}
      onAttribuer={() => {}}
    />,
  );

  // La bulle est le sujet du jour : on la sort ouverte, sinon il n'y a rien à
  // regarder. Le menu de filtres s'ouvre aussi, pour juger l'intertitre.
  if (process.env.DEM_DUMP_MENU) {
    fireEvent.click(container.querySelector<HTMLElement>(".dm-chip.more")!);
  } else {
    fireEvent.click(screen.getByRole("button", { name: /Légende/ }));
  }

  const css = fs.readFileSync(path.join(__dirname, "..", "dem-skin.css"), "utf8");
  const sortie = process.env.DEM_DUMP || "/tmp/dem.html";
  fs.writeFileSync(
    sortie,
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif}
      body{background:${process.env.DEM_DUMP_DARK ? "#15171B" : "#F8F8F9"}}
      /* Le rail vit dans une grille : ici on lui donne juste sa largeur. */
      .cadre{display:grid;grid-template-columns:286px;height:100vh}
      ${css}
    </style>${process.env.DEM_DUMP_DARK ? '<div class="dark">' : ""}<div class="dm-skin"><div class="cadre">${container.innerHTML}</div></div>${process.env.DEM_DUMP_DARK ? "</div>" : ""}`,
  );
  expect(fs.existsSync(sortie)).toBe(true);
});
