"use client";

import { useMemo } from "react";
import { Icon } from "./DemIcon";
import { one } from "@/components/agent-portal/format";
import { demCh } from "./channels";
import { COHORTE_INFO, COHORTE_ORDER, countByCohorte } from "./cohortes";
import type { DemCohorte, DemarchageQueueMeta, DemarchageTask } from "./types";
import {
  cadenceEffective,
  SIGNAL_LABEL,
  SIGNAL_ORDER,
  countByKind,
  countBySignal,
  isLate,
  isSetAside,
  signalOf,
  type DemarchageDay,
  type DemarchageSignal,
} from "@/lib/agent-portal/demarchage-buckets";

/**
 * Le filtre courant de la file : « tout », un canal, ou un signal.
 *
 * Les trois signaux étaient des ONGLETS à côté des jours ; ils sont passés ici
 * parce que ce sont des manières de trier la journée, pas des journées. La
 * barre du haut ne dit plus que des dates.
 */
export type DemFilter = "all" | DemarchageSignal | string;

/** Ce qui rend un canal ou un signal cliquable dans la barre de filtres. */
type Chip = { id: DemFilter; lb: string; n: number; tone?: "conv" | "hot" | "missed" };

/**
 * Les canaux, dans l'ordre où on veut les proposer, avec leur libellé au
 * pluriel. Un canal absent de cette table reste filtrable : il prend le libellé
 * de `demCh`. C'est ce qui fait que le jour où une étape e-mail apparaît dans
 * une séquence, sa pastille arrive toute seule dans la barre.
 */
const KIND_ORDER: readonly string[] = ["call", "whatsapp", "email", "linkedin", "sms", "wait"] as const;
const KIND_LABEL: Record<string, string> = {
  call: "Appels",
  whatsapp: "WhatsApp",
  email: "E-mails",
  linkedin: "LinkedIn",
  sms: "SMS",
  wait: "Attentes",
};

const toneOf = (s: DemarchageSignal): Chip["tone"] =>
  s === "conversation" ? "conv" : s === "hot" ? "hot" : "missed";

/** Durée d'engagement, lisible d'un coup d'œil. */
const dureeCourte = (sec: number) =>
  sec >= 60 ? `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, "0")}` : `${Math.round(sec)}s`;

/** « aujourd'hui » / « hier » / « il y a 3 j » à partir d'une date ISO. */
function jourRelatif(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  const j = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d.getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return "hier";
  return `il y a ${j} j`;
}

const dateFr = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T12:00:00Z`));

/**
 * L'étiquette d'un onglet de jour : une DATE, et rien d'autre.
 *
 * « Auj. 15 » plutôt que « Aujourd'hui » : la barre tient jusqu'à quatre jours
 * dans les 286 px du rail sans tronquer, et au-delà elle défile. Le titre
 * complet reste en infobulle.
 */
function tabLabel(day: DemarchageDay<DemarchageTask>): string {
  const jour = dateFr(day.date, { day: "numeric" });
  if (day.offset === 0) return `Auj. ${jour}`;
  if (day.offset === 1) return `Dem. ${jour}`;
  // Au-delà de la semaine, le jour de semaine ne situe plus rien : « lun. 17 »
  // peut être dans six jours comme dans trois mois, et les mises de côté
  // ouvrent justement des onglets très lointains. Le mois tranche.
  if (day.offset <= 6) return dateFr(day.date, { weekday: "short", day: "numeric" });
  return dateFr(day.date, { day: "numeric", month: "short" });
}

/** Le sous-titre du bloc session : la date réelle du jour regardé, en toutes lettres. */
function dayTitle(day: DemarchageDay<DemarchageTask> | undefined): string {
  if (!day) return "—";
  const complet = dateFr(day.date, { weekday: "long", day: "numeric", month: "long" });
  if (day.offset === 0) return `aujourd'hui, ${complet}`;
  if (day.offset === 1) return `demain, ${complet}`;
  return complet;
}

/**
 * Une tuile de la tête de rail.
 *
 * SUR « AUJOURD'HUI », C'EST UN COMPTEUR D'AVANCEMENT : `fait / cadence`. Il
 * démarre à 0 le matin et monte au fil de la journée. Il affichait auparavant
 * le nombre de tâches PLANIFIÉES, donc « 20/20 » dès la première seconde —
 * lecture exactement inverse de ce qu'on cherche en ouvrant l'écran.
 *
 * Sur les autres jours, il n'y a rien de « fait » à montrer : la tuile
 * annonce ce que le jour contient. Et jamais le quota à la place d'un vide :
 * aucun appel en séquence, la tuile affiche 0.
 */
function Tile({
  ic,
  lb,
  n,
  quota,
  sub,
}: {
  ic: string;
  lb: string;
  n: number;
  /** Cadence quotidienne du canal, `null` quand il n'a pas de plafond. */
  quota: number | null;
  sub?: string | null;
}) {
  return (
    <div data-empty={n === 0 ? "1" : undefined}>
      <span className="k">
        <Icon name={ic} className="ico-xs" />
        {lb}
      </span>
      <div className="n">
        {n}
        {quota != null && <span className="q">/{quota}</span>}
      </div>
      {sub && <div className="r">{sub}</div>}
    </div>
  );
}

export function DemRail({
  days,
  day,
  setDay,
  filt,
  setFilt,
  step,
  setStep,
  cohorte,
  setCohorte,
  tasks,
  meta,
  agentName,
  loading,
  sel,
  onPick,
  onRechercher,
  poolDispo,
  onAttribuer,
}: {
  days: Array<DemarchageDay<DemarchageTask>>;
  /** Date civile (YYYY-MM-DD) du jour affiché. */
  day: string;
  setDay: (d: string) => void;
  filt: DemFilter;
  setFilt: (f: DemFilter) => void;
  /** Étape de séquence filtrée, `null` = toutes. */
  step: number | null;
  setStep: (s: number | null) => void;
  /** Cohorte filtrée, `null` = les deux. Se propage à la route en `?cohorte=…`. */
  cohorte: DemCohorte | null;
  setCohorte: (c: DemCohorte | null) => void;
  /** La liste RÉELLEMENT affichée : le jour choisi, passé aux filtres. */
  tasks: DemarchageTask[];
  meta: DemarchageQueueMeta;
  agentName: string | null;
  loading: boolean;
  sel: string | null;
  onPick: (id: string) => void;
  /** Ouvre la recherche d'entreprise — le geste de « quelqu'un rappelle ». */
  onRechercher: () => void;
  /**
   * Combien d'entreprises attendent dans le pool, `null` quand l'agent n'a pas
   * le droit de s'en servir (ou qu'on ne le sait pas encore). Sans droit, pas
   * de bouton : proposer un geste qui répondra « interdit » vaut moins que ne
   * rien proposer.
   */
  poolDispo: number | null;
  /** Ouvre le panneau « m'attribuer des entreprises ». */
  onAttribuer: () => void;
}) {
  const courant = days.find((d) => d.date === day) ?? days[0];
  const duJour = useMemo(() => courant?.tasks ?? [], [courant]);

  /**
   * Les cadences à afficher — exactement celles avec lesquelles `planTasks` a
   * réparti les journées.
   *
   * Le rail avait sa propre fusion sur `DAILY_QUOTA`, et elle divergeait déjà
   * de celle du plan : elle acceptait un quota à 0, que `normaliseQuotas`
   * refuse. Un « /0 » s'affichait donc en tête de rail pendant que le plan
   * répartissait à 20 — le genre d'écart qu'on ne voit jamais, parce que les
   * deux chiffres sont plausibles. Une seule fonction, une seule cadence.
   */
  const quotas = useMemo(() => cadenceEffective(meta.quotas), [meta.quotas]);

  // Les compteurs regardent la journée ENTIÈRE, pas la liste filtrée : cliquer
  // « Appels » ne doit pas faire tomber le compteur Messages à zéro.
  //
  // Les TUILES, elles, ne comptent que les premiers contacts : c'est ce que la
  // cadence plafonne, et la tuile « Discussion en cours » compte le reste. Sans
  // cette séparation, répondre à trois prospects gonflait le compteur de
  // démarchage de trois et faisait afficher « 23/20 ».
  const { parCanal, parSignal, cadenceParCanal } = useMemo(
    () => ({
      parCanal: countByKind(duJour),
      parSignal: countBySignal(duJour),
      cadenceParCanal: countByKind(duJour.filter((t) => signalOf(t) !== "conversation")),
    }),
    [duJour],
  );
  /** Le jour en cours : c'est le seul où « fait » veut dire quelque chose. */
  const cejour = courant?.offset === 0;

  // Ce qui, du même canal, a été renvoyé aux jours suivants faute de place —
  // la moitié de l'explication du chiffre affiché.
  const apres = days.filter((d) => d.offset > (courant?.offset ?? 0));
  const reporte = countByKind(apres.flatMap((d) => d.tasks));

  /**
   * Les pastilles de filtre, déduites des tâches RÉELLEMENT présentes ce
   * jour-là. Une file sans LinkedIn n'affiche pas de pastille LinkedIn : un
   * filtre qui ne peut rien retirer est du bruit, et c'est exactement ce que
   * demandait la barre figée « Tout · Appels · Messages · Attentes ».
   */
  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [{ id: "all", lb: "Tout", n: duJour.length }];
    const kinds = Object.keys(parCanal).filter((k) => k && parCanal[k] > 0);
    kinds.sort((a, b) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia < 0 ? KIND_ORDER.length : ia) - (ib < 0 ? KIND_ORDER.length : ib);
    });
    for (const k of kinds) out.push({ id: k, lb: KIND_LABEL[k] ?? demCh(k).lb, n: parCanal[k] });
    for (const s of SIGNAL_ORDER) {
      if (parSignal[s] > 0) out.push({ id: s, lb: SIGNAL_LABEL[s], n: parSignal[s], tone: toneOf(s) });
    }
    return out;
  }, [duJour, parCanal, parSignal]);

  /**
   * Les étapes de séquence présentes ce jour-là.
   *
   * Sans elles, une file de quinze WhatsApp se lit comme quinze fois la même
   * chose : rien ne distingue un premier contact d'une quatrième relance, alors
   * que ce n'est ni le même message ni le même prospect. On ne propose le tri
   * qu'à partir de deux étapes distinctes — sinon il ne trie rien.
   */
  const etapes = useMemo(() => {
    const set = new Set<number>();
    for (const t of duJour) {
      const i = t.sequence?.stepIndex;
      if (typeof i === "number" && Number.isFinite(i)) set.add(i);
    }
    return [...set].sort((a, b) => a - b);
  }, [duJour]);

  /**
   * Les pastilles de cohorte, et leur compte quand on le connaît.
   *
   * Le filtre de cohorte part au SERVEUR : filtrée sur A, la file ne contient
   * plus une seule ligne B, et compter B dans ce qui est chargé donnerait
   * « 0 » — un chiffre faux, pas une file vide. On affiche donc les deux
   * pastilles dès qu'un filtre est actif (sans quoi on ne pourrait plus passer
   * de A à B sans repasser par « toutes »), mais SANS compte pour celle qu'on
   * n'a pas chargée. Un compte affiché est un compte vrai.
   */
  const cohortes = useMemo(() => {
    const par = countByCohorte(duJour);
    return COHORTE_ORDER.filter((c) => par[c] > 0 || cohorte != null).map((c) => ({
      id: c,
      n: par[c] > 0 || c === cohorte ? par[c] : null,
    }));
  }, [duJour, cohorte]);

  const nb = meta.done_today;
  // La journée, c'est ce qui a été fait plus ce qui reste à faire aujourd'hui.
  const aujourdhui = days.find((d) => d.offset === 0)?.tasks.length ?? 0;
  const tot = nb + aujourdhui;

  // Les discussions vivent toutes dans la journée du jour — c'est là qu'on les
  // compte, et non dans la journée regardée : « trois prospects attendent une
  // réponse » ne doit pas disparaître parce qu'on jette un œil à demain.
  const nbDiscussion = countBySignal(days.find((d) => d.offset === 0)?.tasks ?? []).conversation;

  /**
   * La tuile d'un canal plafonné.
   *
   * Sur aujourd'hui : `fait / cadence`, avec le reste à faire en dessous.
   * Ailleurs : ce que le jour contient, et ce qui a débordé au-delà.
   */
  const tuileCadence = (ic: string, lb: string, kind: string) => {
    const prevu = cadenceParCanal[kind] ?? 0;
    const fait = meta.done_today_by_kind[kind] ?? 0;
    const quota = quotas[kind] ?? null;
    const debord = reporte[kind] ?? 0;
    return cejour ? (
      <Tile ic={ic} lb={lb} n={fait} quota={quota} sub={prevu > 0 ? `${prevu} à faire` : null} />
    ) : (
      <Tile ic={ic} lb={lb} n={prevu} quota={quota} sub={debord > 0 ? `+${debord} reportés` : null} />
    );
  };

  return (
    <aside className="dm-rail">
      {/* PREMIER élément du rail, avant même le compteur du jour : quand le
          téléphone sonne, retrouver la fiche passe avant tout le reste, et on
          n'a pas le temps de la chercher. Le raccourci est écrit dessus — un
          raccourci qu'on ne voit pas est un raccourci que personne n'utilise. */}
      <button type="button" className="dm-rech-b" onClick={onRechercher}>
        <Icon name="phone" className="ico-sm" />
        <span className="l">Une entreprise rappelle…</span>
        <kbd>/</kbd>
      </button>

      {/* Se constituer sa file à l'avance. Le bouton n'existe que pour les
          agents à qui l'admin a ouvert le pool — et il dit ce qui reste dedans,
          parce que « m'attribuer des entreprises » sans savoir s'il en reste
          trois ou trois cents ne décide de rien. */}
      {poolDispo != null && (
        <button type="button" className="dm-rech-b attr" onClick={onAttribuer}>
          <Icon name="building" className="ico-sm" />
          <span className="l">M&apos;attribuer des entreprises</span>
          <span className="n">{poolDispo}</span>
        </button>
      )}

      <div className="dm-sess">
        <div className="lb">Ma file · {dayTitle(courant)}</div>
        <div className="vl">
          {nb}
          <span>/{tot}</span>
        </div>
        <div className="sub">
          actions traitées{agentName ? ` — attribuées à ${agentName}` : ""}
        </div>
        <div className="dm-prog">
          <i style={{ width: `${tot ? Math.min(100, (nb / tot) * 100) : 0}%` }} />
        </div>
        <div className="mini">
          {tuileCadence("phone", "Appels", "call")}
          {/* « 1er contact » n'est pas cosmétique : c'est ce que la cadence
              plafonne, et la tuile d'à côté dit le reste. */}
          {tuileCadence("whatsapp", "WhatsApp 1er contact", "whatsapp")}
          {/* La discussion ne dépend d'aucun jour : elle est là ou elle n'est
              pas, et elle n'a pas de plafond. Toujours visible, pour qu'on ne
              confonde jamais les deux compteurs. */}
          <Tile
            ic="message"
            lb="Discussion en cours"
            n={nbDiscussion}
            quota={null}
            sub={meta.done_today_conversation > 0 ? `${meta.done_today_conversation} traitées` : null}
          />
          {/* LinkedIn et les attentes n'apparaissent que s'il y en a : une
              tuile vide sur un canal qu'on n'utilise pas est du bruit. */}
          {(cadenceParCanal.linkedin ?? 0) > 0 && tuileCadence("linkedin", "LinkedIn", "linkedin")}
          {(cadenceParCanal.wait ?? 0) > 0 && (
            <Tile ic="clock" lb="Attentes" n={cadenceParCanal.wait ?? 0} quota={null} />
          )}
        </div>
        <div className="cad">
          <Icon name="info" className="ico-xs" />
          cadence : {quotas.call} appels et {quotas.whatsapp} premiers contacts WhatsApp par jour — le
          surplus part au lendemain. Les discussions en cours ne comptent pas.
        </div>
        {nbDiscussion > 0 && (
          <div className="cad">
            <Icon name="message" className="ico-xs" />
            {nbDiscussion} ont répondu : on répond à ce qui vient, sans plafond ni report.
          </div>
        )}
      </div>

      {/* Des DATES, rien que des dates. Les signaux qui squattaient cette barre
          sont passés en pastilles juste en dessous : à sept onglets dans 286 px
          on ne lisait plus que la première lettre de chacun. */}
      <div className="dm-days" role="tablist" aria-label="Jour de la file">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            className="dm-day"
            aria-selected={day === d.date}
            title={dayTitle(d)}
            onClick={() => setDay(d.date)}
          >
            <span className="l">{tabLabel(d)}</span>
            {/* Rien à faire ce jour-là : on l'écrit « — », pas « 0 act. ». */}
            <span className="n">{d.tasks.length > 0 ? `${d.tasks.length} act.` : "—"}</span>
          </button>
        ))}
      </div>

      <div className="dm-filt">
        {chips.map((c) => (
          <button
            key={c.id}
            className="dm-chip"
            data-tone={c.tone}
            aria-pressed={filt === c.id}
            onClick={() => setFilt(c.id)}
          >
            {c.lb}
            <span className="n">{c.n}</span>
          </button>
        ))}
      </div>

      {/* La cohorte a sa PROPRE barre : c'est une troisième dimension, pas un
          signal de plus. Filtrer « site faible » et « appels » en même temps
          est une demande légitime — deux vocabulaires dans la même barre ne le
          permettraient pas. La barre disparaît hors campagne, quand aucune
          ligne ne porte de cohorte : un filtre qui ne trie rien est du bruit. */}
      {cohortes.length > 0 && (
        <div className="dm-filt coh">
          <span className="lb">Cohorte</span>
          <button className="dm-chip" aria-pressed={cohorte === null} onClick={() => setCohorte(null)}>
            toutes
          </button>
          {cohortes.map((c) => (
            <button
              key={c.id}
              className="dm-chip"
              data-coh={c.id}
              aria-pressed={cohorte === c.id}
              title={`${COHORTE_INFO[c.id].long} — ${COHORTE_INFO[c.id].argument}`}
              onClick={() => setCohorte(cohorte === c.id ? null : c.id)}
            >
              {COHORTE_INFO[c.id].court}
              {c.n != null && <span className="n">{c.n}</span>}
            </button>
          ))}
        </div>
      )}

      {etapes.length > 1 && (
        <div className="dm-filt steps">
          <span className="lb">Étape</span>
          <button className="dm-chip" aria-pressed={step === null} onClick={() => setStep(null)}>
            toutes
          </button>
          {etapes.map((e) => (
            <button
              key={e}
              className="dm-chip"
              aria-pressed={step === e}
              onClick={() => setStep(step === e ? null : e)}
              title={`Étape ${e} de séquence`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="dm-fr">
        <div className="dm-fr-h">
          <Icon name="layers" className="ico-xs" />
          ordre de passage
          <span className="ln" />
        </div>

        {loading && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>Chargement…</div>
        )}
        {!loading && tasks.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>
            Rien dans ce filtre.
          </div>
        )}

        {tasks.map((t, i) => {
          const ent = one(t.entreprise);
          const contact = one(t.contact);
          const ch = demCh(t.kind);
          const name =
            ent?.name ||
            `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
            "Prospect";
          const state = t.id === sel ? "now" : "next";
          const signal = signalOf(t);
          const heat = signal === "missed" ? "missed" : signal === "hot" ? "hot" : undefined;
          const late = isLate(t);
          // Rangée volontairement : la ligne doit le dire, sinon on la relit
          // comme un oubli et on la rappelle — ce qui défait le geste.
          const deCote = isSetAside(t);
          return (
            <div
              key={t.id}
              className="dm-tk"
              data-s={state}
              data-heat={heat}
              data-conv={signal === "conversation" ? "1" : undefined}
              aria-selected={t.id === sel}
              onClick={() => onPick(t.id)}
            >
              {/* Le rang dans la journée, pas une heure : une tâche manuelle se
                  fait « en troisième », jamais « à 9 h 04 ». */}
              <span className="tm">{i + 1}</span>
              <div className="bd">
                <div className="nm">
                  <span className="t">{name}</span>
                  {/* Le signal a sa propre case, à l'écart du nom : collé au
                      texte, il se lisait comme une partie de la raison sociale
                      et ne sautait plus aux yeux. */}
                  {t.intent?.flame ? (
                    <span className="fl" data-heat={heat} title={t.intent.reasons.join(" · ")}>
                      {t.intent.flame}
                    </span>
                  ) : null}
                </div>
                <div className="wy">
                  {t.sequence?.stepLabel || t.title || (t.hors_sequence ? "Jamais contactée" : ch.lb)}
                </div>
                <div className="mt">
                  <span className="kc" style={{ background: ch.c + "1a", color: ch.c }}>
                    <Icon name={ch.ic} className="ico-xs" />
                    {ch.lb}
                  </span>
                  {/* L'ÉTAPE, en évidence. « WhatsApp » tout seul ne dit pas si
                      c'est un premier contact ou une quatrième relance — deux
                      lignes identiques à l'œil pour deux situations opposées. */}
                  {t.sequence?.stepIndex != null && (
                    <span className="st stp">
                      étape {t.sequence.stepIndex}
                      {t.sequence.totalSteps > 0 ? `/${t.sequence.totalSteps}` : ""}
                    </span>
                  )}
                  {/* À froid : ni étape, ni script, ni historique. Le dire sur
                      la ligne évite de chercher une frise qui n'existe pas. */}
                  {t.hors_sequence && <span className="st froid">à froid</span>}
                  {/* La cohorte décide de l'accroche ET du document : elle se
                      lit AVANT de composer le numéro, donc sur la ligne. */}
                  {t.cohorte && (
                    <span className="st coh" data-coh={t.cohorte} title={COHORTE_INFO[t.cohorte].long}>
                      {COHORTE_INFO[t.cohorte].court}
                    </span>
                  )}
                  {signal === "conversation" && <span className="st conv">a répondu</span>}
                  {deCote && (
                    <span
                      className="st cote"
                      title={
                        t.payload?.mise_de_cote?.motif ??
                        "Mis de côté — il revient de lui-même à cette date."
                      }
                    >
                      de côté
                    </span>
                  )}
                  {late && <span className="st late">échéance passée</span>}
                </div>
                {/* Ce que le prospect a fait de sa démo : l'information qui
                    décide s'il faut décrocher maintenant ou laisser la
                    séquence suivre son cours. Lisible sans ouvrir la fiche. */}
                {t.intent && t.intent.sessions > 0 && (
                  <div className="vu" data-heat={heat}>
                    <Icon name="eye" className="ico-xs" />
                    {signal === "missed" && t.intent.daysSinceVisit != null
                      ? `Chaud depuis ${t.intent.daysSinceVisit} j, jamais rappelé`
                      : `Démo vue ${t.intent.sessions}×${
                          t.intent.engagementSec > 0 ? ` · ${dureeCourte(t.intent.engagementSec)}` : ""
                        }${t.intent.lastDay ? ` · ${jourRelatif(t.intent.lastDay)}` : ""}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="dm-rail-ft">
        <Icon name="info" className="ico-xs" />
        Chaque relance de séquence crée sa propre ligne — appels compris. Un appel à froid n&apos;en a
        qu&apos;une : la première.
      </div>
    </aside>
  );
}
