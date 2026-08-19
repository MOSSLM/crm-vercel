"use client";

import { useMemo } from "react";
import { Icon } from "./DemIcon";
import { one } from "@/components/agent-portal/format";
import { demCh } from "./channels";
import { COHORTE_INFO, COHORTE_ORDER, countByCohorte } from "./cohortes";
import type { DemCohorte, DemarchageQueueMeta, DemarchageTask } from "./types";
import {
  cadenceEffective,
  countByKind,
  countBySignal,
  isLate,
  isSetAside,
  quotaOf,
  signalOf,
  signalsOf,
  SIGNAL_LABEL,
  SIGNAL_ORDER,
  SIGNAL_TAG,
  type DemarchageDay,
  type DemarchageSignal,
} from "@/lib/agent-portal/demarchage-buckets";

/** Laquelle des deux files on travaille. */
export type DemOnglet = "premiers" | "relances";

/**
 * LE RAIL — les deux files, et rien d'autre.
 *
 * CE QUI A CHANGÉ, ET POURQUOI
 *
 * 1. DEUX ONGLETS au lieu d'une file unique. Les premiers contacts sont un
 *    stock (rien ne les date, on s'y met et on avance) ; les relances et les
 *    discussions sont un calendrier (chaque ligne est due un jour précis). Les
 *    mélanger obligeait à trier à l'œil, sur la seule liste qu'on ait, ce qui
 *    est le contraire de « je sais quoi faire maintenant ».
 *
 * 2. LES FILTRES SONT INDÉPENDANTS. Canal et signal partageaient une variable,
 *    donc un choix à la fois : cocher « Chauds » faisait perdre le canal, et
 *    inversement. Or un prospect peut être chaud ET en attente de réponse ET
 *    sur une tâche WhatsApp. Deux barres, deux dimensions, cumulables — et les
 *    signaux se cumulent aussi SUR LA LIGNE (cf. `signalsOf`), là où l'ancienne
 *    lecture n'en gardait qu'un et faisait disparaître un chaud dès qu'il
 *    répondait.
 *
 * 3. LE BLOC DE TÊTE A MAIGRI. Cinq tuiles et deux paragraphes de cadence
 *    prenaient la moitié de la hauteur du rail ; la liste — la seule chose qui
 *    serve à travailler — commençait sous la ligne de flottaison. L'objectif du
 *    jour tient maintenant en une ligne par canal, et il n'est plus qu'un
 *    objectif : rien n'est caché quand on le dépasse.
 *
 *    Une carte de tête a existé ici, qui reprenait en grand le prospect en
 *    cours. Elle a été retirée : le centre de l'écran affiche DÉJÀ ce
 *    prospect-là, en plus complet, à trois centimètres de distance. Elle ne
 *    disait donc rien de neuf et mangeait la place de la liste — la seule chose
 *    que le rail sache faire mieux que le reste de l'écran. Ce qu'elle
 *    apportait de vraiment utile, la bascule en appel, vit sur chaque ligne.
 */

/** Les canaux, dans l'ordre où on veut les proposer, avec leur libellé au pluriel. */
const KIND_ORDER: readonly string[] = ["call", "whatsapp", "email", "linkedin", "sms", "wait"] as const;
const KIND_LABEL: Record<string, string> = {
  call: "Appels",
  whatsapp: "WhatsApp",
  email: "E-mails",
  linkedin: "LinkedIn",
  sms: "SMS",
  wait: "Attentes",
};

const toneOf = (s: DemarchageSignal) =>
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
 * Une case du calendrier : le jour de semaine au-dessus, le numéro en dessous —
 * la forme d'un calendrier, pas d'un onglet. Au-delà de la semaine le mois
 * remplace le jour de semaine : « lun. 17 » peut être dans six jours comme dans
 * trois mois, et les mises de côté ouvrent justement des cases très lointaines.
 */
function caseCalendrier(day: DemarchageDay<DemarchageTask>): { haut: string; bas: string; titre: string } {
  const complet = dateFr(day.date, { weekday: "long", day: "numeric", month: "long" });
  const num = dateFr(day.date, { day: "numeric" });
  if (day.offset === 0) return { haut: "auj.", bas: num, titre: `aujourd'hui, ${complet}` };
  if (day.offset === 1) return { haut: "dem.", bas: num, titre: `demain, ${complet}` };
  if (day.offset <= 6) {
    return { haut: dateFr(day.date, { weekday: "short" }).replace(".", ""), bas: num, titre: complet };
  }
  return { haut: dateFr(day.date, { month: "short" }).replace(".", ""), bas: num, titre: complet };
}

const nomDe = (t: DemarchageTask): string => {
  const ent = one(t.entreprise);
  const contact = one(t.contact);
  return (
    ent?.name || `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() || "Prospect"
  );
};

/**
 * L'objectif d'un canal sur la journée : ce qui est fait, ce qui reste, et le
 * repère à tenir. Dépasser est possible et se voit — la barre se remplit et le
 * chiffre passe devant le repère, rien ne disparaît.
 */
function LigneObjectif({
  ic,
  lb,
  fait,
  reste,
  objectif,
}: {
  ic: string;
  lb: string;
  fait: number;
  reste: number;
  objectif: number | null;
}) {
  const pct = objectif && objectif > 0 ? Math.min(100, (fait / objectif) * 100) : 0;
  const depasse = objectif != null && fait > objectif;
  return (
    <div className="dm-obj-l" data-full={depasse ? "1" : undefined}>
      <span className="k">
        <Icon name={ic} className="ico-xs" />
        {lb}
      </span>
      <span className="v">
        <b>{fait}</b>
        {objectif != null && <span className="q">/{objectif}</span>}
      </span>
      <span className="bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="r">{reste > 0 ? `${reste} en file` : "file vide"}</span>
    </div>
  );
}

export function DemRail({
  onglet,
  setOnglet,
  premiers,
  jours,
  day,
  setDay,
  canal,
  setCanal,
  signal,
  setSignal,
  step,
  setStep,
  cohorte,
  setCohorte,
  tasks,
  meta,
  agentName,
  loading,
  busy,
  sel,
  onPick,
  onRechercher,
  onBasculerEnAppel,
  poolDispo,
  onAttribuer,
}: {
  onglet: DemOnglet;
  setOnglet: (o: DemOnglet) => void;
  /** La file des premiers contacts, entière et dans l'ordre de passage. */
  premiers: DemarchageTask[];
  /** Le calendrier des relances et discussions. */
  jours: Array<DemarchageDay<DemarchageTask>>;
  /** Date civile (YYYY-MM-DD) de la case de calendrier ouverte. */
  day: string;
  setDay: (d: string) => void;
  /** Canal filtré, `null` = tous. Cumulable avec le signal. */
  canal: string | null;
  setCanal: (k: string | null) => void;
  /** Signal filtré, `null` = tous. Cumulable avec le canal. */
  signal: DemarchageSignal | null;
  setSignal: (s: DemarchageSignal | null) => void;
  /** Étape de séquence filtrée, `null` = toutes. */
  step: number | null;
  setStep: (s: number | null) => void;
  /** Cohorte filtrée, `null` = les deux. Se propage à la route en `?cohorte=…`. */
  cohorte: DemCohorte | null;
  setCohorte: (c: DemCohorte | null) => void;
  /** La liste RÉELLEMENT affichée : l'onglet courant, passé aux filtres. */
  tasks: DemarchageTask[];
  meta: DemarchageQueueMeta;
  agentName: string | null;
  loading: boolean;
  /** Une action est en cours : la bascule en appel des lignes se verrouille. */
  busy: boolean;
  sel: string | null;
  onPick: (id: string) => void;
  /** Ouvre la recherche d'entreprise — le geste de « quelqu'un rappelle ». */
  onRechercher: () => void;
  /** « Je préfère l'appeler » : la tâche courante devient un appel. */
  onBasculerEnAppel: (id: string) => void;
  /**
   * Combien d'entreprises attendent dans le pool, `null` quand l'agent n'a pas
   * le droit de s'en servir (ou qu'on ne le sait pas encore).
   */
  poolDispo: number | null;
  /** Ouvre le panneau « m'attribuer des entreprises ». */
  onAttribuer: () => void;
}) {
  /** Tout ce que porte l'onglet courant, filtres non appliqués. */
  const duJour = useMemo(
    () => (onglet === "premiers" ? premiers : (jours.find((d) => d.date === day)?.tasks ?? [])),
    [onglet, premiers, jours, day],
  );

  const nbRelances = useMemo(() => jours.reduce((n, d) => n + d.tasks.length, 0), [jours]);

  const quotas = useMemo(() => cadenceEffective(meta.quotas), [meta.quotas]);

  // Les compteurs regardent l'onglet ENTIER, pas la liste filtrée : cliquer
  // « Appels » ne doit pas faire tomber le compteur des chauds à zéro.
  const parCanal = useMemo(() => countByKind(duJour), [duJour]);
  const parSignal = useMemo(() => countBySignal(duJour), [duJour]);

  /** Les canaux réellement présents, dans l'ordre de présentation. */
  const canaux = useMemo(() => {
    const kinds = Object.keys(parCanal).filter((k) => k && parCanal[k] > 0);
    kinds.sort((a, b) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia < 0 ? KIND_ORDER.length : ia) - (ib < 0 ? KIND_ORDER.length : ib);
    });
    return kinds;
  }, [parCanal]);

  /**
   * Les étapes de séquence présentes. Sans elles, une file de quinze WhatsApp
   * se lit comme quinze fois la même chose : rien ne distingue un premier
   * contact d'une quatrième relance. On ne propose le tri qu'à partir de deux
   * étapes distinctes — sinon il ne trie rien.
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
   * pastilles dès qu'un filtre est actif, mais SANS compte pour celle qu'on n'a
   * pas chargée. Un compte affiché est un compte vrai.
   */
  const cohortes = useMemo(() => {
    const par = countByCohorte(duJour);
    return COHORTE_ORDER.filter((c) => par[c] > 0 || cohorte != null).map((c) => ({
      id: c,
      n: par[c] > 0 || c === cohorte ? par[c] : null,
    }));
  }, [duJour, cohorte]);

  return (
    <aside className="dm-rail">
      {/* PREMIER élément du rail : quand le téléphone sonne, retrouver la fiche
          passe avant tout le reste. Le raccourci est écrit dessus — un
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

      <div className="dm-rail-top">
        <div className="dm-rail-hd">
          <span className="who">{agentName ? `Ma file · ${agentName}` : "Ma file"}</span>
          <span className="fait">{meta.done_today} traitées aujourd&apos;hui</span>
        </div>

        {/* LES DEUX FILES. Un premier contact et une relance ne se travaillent pas
            pareil : l'un est du volume qu'on abat, l'autre un rendez-vous avec
            quelqu'un qui a déjà réagi. */}
        <div className="dm-files" role="tablist" aria-label="File de travail">
          <button
            type="button"
            role="tab"
            className="dm-file"
            aria-selected={onglet === "premiers"}
            onClick={() => setOnglet("premiers")}
          >
            <span className="l">Premiers contacts</span>
            <span className="n">{premiers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className="dm-file"
            aria-selected={onglet === "relances"}
            onClick={() => setOnglet("relances")}
          >
            <span className="l">Relances &amp; discussions</span>
            <span className="n">{nbRelances}</span>
          </button>
        </div>

        {onglet === "premiers" ? (
          <div className="dm-obj">
            {/* Un objectif, pas un plafond : le dépassement se voit et rien ne
                part au lendemain. C'est le sens du « on peut dépasser les 20
                WhatsApp » — une bonne journée doit pouvoir se lire comme telle. */}
            {canaux
              .filter((k) => k !== "wait")
              .map((k) => (
                <LigneObjectif
                  key={k}
                  ic={demCh(k).ic}
                  lb={KIND_LABEL[k] ?? demCh(k).lb}
                  fait={meta.done_today_by_kind[k] ?? 0}
                  reste={parCanal[k] ?? 0}
                  objectif={quotaOf(k, quotas)}
                />
              ))}
            {premiers.length === 0 && (
              <div className="vide">
                Aucun premier contact en attente.
                {poolDispo != null && poolDispo > 0
                  ? " Le pool en contient encore — sers-toi juste au-dessus."
                  : ""}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* UN CALENDRIER, pas un plan : chaque ligne à la date où elle est
                réellement due, et l'échu replié sur aujourd'hui. Rien n'est
                déplacé pour tenir dans un quota. */}
            <div className="dm-cal" role="tablist" aria-label="Jour des relances">
              {jours.map((d) => {
                const c = caseCalendrier(d);
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="tab"
                    className="dm-cd"
                    aria-selected={day === d.date}
                    title={c.titre}
                    onClick={() => setDay(d.date)}
                  >
                    <span className="j">{c.haut}</span>
                    <span className="d">{c.bas}</span>
                    <span className="n">{d.tasks.length > 0 ? d.tasks.length : "—"}</span>
                  </button>
                );
              })}
            </div>
            <div className="dm-cal-ft">
              <Icon name="info" className="ico-xs" />
              Sans plafond : répondre à quelqu&apos;un qui a réagi ne se rationne pas.
            </div>
          </>
        )}
      </div>

      {/* ── Les filtres, en dimensions SÉPARÉES ── */}
      {canaux.length > 1 && (
        <div className="dm-filt">
          <span className="lb">Canal</span>
          <button className="dm-chip" aria-pressed={canal === null} onClick={() => setCanal(null)}>
            tous
          </button>
          {canaux.map((k) => (
            <button
              key={k}
              className="dm-chip"
              aria-pressed={canal === k}
              onClick={() => setCanal(canal === k ? null : k)}
            >
              {KIND_LABEL[k] ?? demCh(k).lb}
              <span className="n">{parCanal[k]}</span>
            </button>
          ))}
        </div>
      )}

      {SIGNAL_ORDER.some((s) => parSignal[s] > 0) && (
        <div className="dm-filt">
          <span className="lb">Signal</span>
          <button className="dm-chip" aria-pressed={signal === null} onClick={() => setSignal(null)}>
            tous
          </button>
          {SIGNAL_ORDER.filter((s) => parSignal[s] > 0).map((s) => (
            <button
              key={s}
              className="dm-chip"
              data-tone={toneOf(s)}
              aria-pressed={signal === s}
              onClick={() => setSignal(signal === s ? null : s)}
            >
              {SIGNAL_LABEL[s]}
              <span className="n">{parSignal[s]}</span>
            </button>
          ))}
        </div>
      )}

      {/* La cohorte a sa PROPRE barre : c'est une dimension de plus, pas un
          signal. La barre disparaît hors campagne, quand aucune ligne n'en
          porte : un filtre qui ne trie rien est du bruit. */}
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
          {tasks.length > 0 && <span className="n">{tasks.length}</span>}
          <span className="ln" />
        </div>

        {loading && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>Chargement…</div>
        )}
        {!loading && tasks.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--text-3)" }}>
            {duJour.length === 0
              ? onglet === "premiers"
                ? "Rien à démarcher pour l'instant."
                : "Rien à relancer ce jour-là."
              : "Rien dans ces filtres."}
          </div>
        )}

        {tasks.map((t, i) => {
          const ch = demCh(t.kind);
          const dominant = signalOf(t);
          const heat = dominant === "missed" ? "missed" : dominant === "hot" ? "hot" : undefined;
          const late = isLate(t);
          // Rangée volontairement : la ligne doit le dire, sinon on la relit
          // comme un oubli et on la rappelle — ce qui défait le geste.
          const deCote = isSetAside(t);
          return (
            <div
              key={t.id}
              className="dm-tk"
              data-s={t.id === sel ? "now" : "next"}
              data-heat={heat}
              data-conv={dominant === "conversation" ? "1" : undefined}
              aria-selected={t.id === sel}
              onClick={() => onPick(t.id)}
            >
              {/* Le rang dans la file, pas une heure : une tâche manuelle se
                  fait « en troisième », jamais « à 9 h 04 ». */}
              <span className="tm">{i + 1}</span>
              <div className="bd">
                <div className="nm">
                  <span className="t">{nomDe(t)}</span>
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
                  {t.sequence?.stepIndex != null && (
                    <span className="st stp">
                      étape {t.sequence.stepIndex}
                      {t.sequence.totalSteps > 0 ? `/${t.sequence.totalSteps}` : ""}
                    </span>
                  )}
                  {t.hors_sequence && <span className="st froid">à froid</span>}
                  {t.cohorte && (
                    <span className="st coh" data-coh={t.cohorte} title={COHORTE_INFO[t.cohorte].long}>
                      {COHORTE_INFO[t.cohorte].court}
                    </span>
                  )}
                  {/* TOUS les signaux, pas seulement le dominant : un prospect
                      chaud qui a répondu est les deux, et l'ancienne ligne n'en
                      montrait qu'un — celui qui gagnait la priorité. */}
                  {signalsOf(t).map((s) => (
                    <span key={s} className="st sig" data-sig={s}>
                      {SIGNAL_TAG[s]}
                    </span>
                  ))}
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
                    séquence suivre son cours. */}
                {t.intent && t.intent.sessions > 0 && (
                  <div className="vu" data-heat={heat}>
                    <Icon name="eye" className="ico-xs" />
                    {dominant === "missed" && t.intent.daysSinceVisit != null
                      ? `Chaud depuis ${t.intent.daysSinceVisit} j, jamais rappelé`
                      : `Démo vue ${t.intent.sessions}×${
                          t.intent.engagementSec > 0 ? ` · ${dureeCourte(t.intent.engagementSec)}` : ""
                        }${t.intent.lastDay ? ` · ${jourRelatif(t.intent.lastDay)}` : ""}`}
                  </div>
                )}
              </div>
              {/* Basculer en appel sans ouvrir la fiche : la décision se prend
                  en lisant la ligne. */}
              {t.kind !== "call" && t.kind !== "wait" && (
                <button
                  type="button"
                  className="dm-tk-tel"
                  disabled={busy}
                  title="Transformer en appel"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBasculerEnAppel(t.id);
                  }}
                >
                  <Icon name="phone" className="ico-xs" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
