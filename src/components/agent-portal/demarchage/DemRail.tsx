"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  type DemarchageSignal,
  type FileDeTravail,
  type RepartitionJournee,
} from "@/lib/agent-portal/demarchage-buckets";

/**
 * LE RAIL — trois files, une barre de filtres, une liste.
 *
 * CE QUE CETTE VERSION RETIRE, ET POURQUOI
 *
 * 1. LA FRISE DES JOURS. Sept cases de calendrier occupaient le haut du rail
 *    pour un seul usage réel : celle d'aujourd'hui. Personne ne travaille jeudi
 *    prochain un mardi matin — et l'échu était de toute façon replié sur
 *    aujourd'hui, donc six cases sur sept ne servaient qu'à regarder. Ce
 *    qu'elles disaient d'utile (« il y a des relances plus tard ») tient dans un
 *    pied de liste dépliable.
 *
 * 2. QUATRE BARRES DE FILTRES. Canal, signal, cohorte et étape avaient chacune
 *    sa ligne, son intitulé et sa pastille « tous » : quatre lignes de chrome
 *    au-dessus de la liste. Le canal reste en clair — c'est le seul qu'on change
 *    dix fois par jour — les trois autres passent derrière un bouton qui dit
 *    combien il en retient.
 *
 * CE QU'ELLE AJOUTE : la file « EN ATTENTE ». Une attente de réponse n'est pas
 * une relance, il n'y a rien à envoyer ; mêlée aux relances et répartie sur sept
 * jours, elle était invisible — et une séquence qui attend quelqu'un ayant déjà
 * répondu ne repart jamais toute seule. C'est le grief « on ne peut pas voir les
 * en attente », et il se corrige en donnant à ces lignes leur propre file.
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

/** Les trois files, leur intitulé et ce qu'elles disent quand elles sont vides. */
const FILES: ReadonlyArray<{ id: FileDeTravail; lb: string; vide: string }> = [
  { id: "premiers", lb: "À contacter", vide: "Aucun premier contact en attente." },
  { id: "relances", lb: "Relances", vide: "Rien à relancer aujourd'hui." },
  {
    id: "attentes",
    lb: "En attente",
    vide: "Personne n'attend de réponse.",
  },
] as const;

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

/** Le jour d'une échéance, en clair et court — « lun. 24 ». */
const jourCourt = (iso: string | null): string => {
  if (!iso) return "sans date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sans date";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(d);
};

const nomDe = (t: DemarchageTask): string => {
  const ent = one(t.entreprise);
  const contact = one(t.contact);
  return (
    ent?.name || `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() || "Prospect"
  );
};

/** Ferme un panneau dès qu'on clique ailleurs — sinon il reste sur la liste. */
function useFermetureAuClicDehors(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ouvert, fermer]);
  return ref;
}

/**
 * L'OBJECTIF DU JOUR, sur une seule ligne.
 *
 * Trois blocs de quarante pixels sont devenus trois colonnes de trente : le
 * fait, le repère, une barre de deux pixels. Ce qu'on lit vingt fois par jour
 * (« où j'en suis ») n'a pas besoin de plus, et la place gagnée va à la liste.
 * Dépasser reste visible — la barre et le chiffre passent au vert.
 */
function ObjectifDuJour({
  canaux,
  meta,
  quotas,
}: {
  canaux: readonly string[];
  meta: DemarchageQueueMeta;
  quotas: Record<string, number>;
}) {
  const lignes = canaux
    .filter((k) => k !== "wait")
    .map((k) => ({ k, fait: meta.done_today_by_kind[k] ?? 0, objectif: quotaOf(k, quotas) }))
    .filter((l) => l.objectif != null);
  if (lignes.length === 0) return null;
  return (
    <div className="dm-obj1">
      {lignes.map(({ k, fait, objectif }) => {
        const cible = objectif ?? 0;
        const pct = cible > 0 ? Math.min(100, (fait / cible) * 100) : 0;
        return (
          <div key={k} className="c" data-full={cible > 0 && fait > cible ? "1" : undefined}
            title={`${KIND_LABEL[k] ?? demCh(k).lb} — ${fait} sur un repère de ${cible} aujourd'hui`}>
            <span className="v">
              <Icon name={demCh(k).ic} className="ico-xs" />
              <b>{fait}</b>/{cible}
            </span>
            <span className="bar">
              <i style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DemRail({
  file,
  setFile,
  rep,
  aVenirOuvert,
  setAVenirOuvert,
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
  /** Laquelle des trois files on travaille. */
  file: FileDeTravail;
  setFile: (f: FileDeTravail) => void;
  /** La journée rangée — premiers contacts, relances, à venir, attentes. */
  rep: RepartitionJournee<DemarchageTask>;
  /** Les relances plus lointaines sont-elles dépliées dans la liste ? */
  aVenirOuvert: boolean;
  setAVenirOuvert: (v: boolean) => void;
  /** Canal filtré, `null` = tous. Cumulable avec le reste. */
  canal: string | null;
  setCanal: (k: string | null) => void;
  /** Signal filtré, `null` = tous. */
  signal: DemarchageSignal | null;
  setSignal: (s: DemarchageSignal | null) => void;
  /** Étape de séquence filtrée, `null` = toutes. */
  step: number | null;
  setStep: (s: number | null) => void;
  /** Cohorte filtrée, `null` = les deux. Se propage à la route en `?cohorte=…`. */
  cohorte: DemCohorte | null;
  setCohorte: (c: DemCohorte | null) => void;
  /** La liste RÉELLEMENT affichée : la file courante, passée aux filtres. */
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
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const refFiltres = useFermetureAuClicDehors(filtresOuverts, () => setFiltresOuverts(false));

  /** Tout ce que porte la file courante, filtres non appliqués. */
  const duJour = useMemo(() => {
    if (file === "premiers") return rep.premiers;
    if (file === "attentes") return rep.attentes;
    return aVenirOuvert ? [...rep.relances, ...rep.aVenir] : rep.relances;
  }, [file, rep, aVenirOuvert]);

  const quotas = useMemo(() => cadenceEffective(meta.quotas), [meta.quotas]);

  // Les compteurs regardent la file ENTIÈRE, pas la liste filtrée : cliquer
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

  /** Combien de filtres « repliés » sont actifs — c'est ce que le bouton annonce. */
  const filtresCaches = (signal ? 1 : 0) + (cohorte ? 1 : 0) + (step != null ? 1 : 0);
  const filtrables = SIGNAL_ORDER.some((s) => parSignal[s] > 0) || cohortes.length > 0 || etapes.length > 1;

  const compteFile: Record<FileDeTravail, number> = {
    premiers: rep.premiers.length,
    relances: rep.relances.length + rep.aVenir.length,
    attentes: rep.attentes.length,
  };
  const videDeLaFile = FILES.find((f) => f.id === file)?.vide ?? "";

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

        {/* LES TROIS FILES. Un premier contact, une relance et une attente de
            réponse ne se travaillent pas pareil : du volume qu'on abat, un
            rendez-vous avec quelqu'un qui a réagi, et un simple constat à
            enregistrer pour que la séquence reparte. */}
        <div className="dm-files" role="tablist" aria-label="File de travail">
          {FILES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              className="dm-file"
              aria-selected={file === f.id}
              onClick={() => setFile(f.id)}
            >
              <span className="l">{f.lb}</span>
              <span className="n">{compteFile[f.id]}</span>
            </button>
          ))}
        </div>

        {file === "premiers" && <ObjectifDuJour canaux={canaux} meta={meta} quotas={quotas} />}
        {file === "attentes" && rep.attentes.length > 0 && (
          <div className="dm-note-l">
            <Icon name="info" className="ico-xs" />
            Rien à envoyer ici : dire « il a répondu » suffit à faire repartir la séquence.
          </div>
        )}
      </div>

      {/* ── LA BARRE DE FILTRES : le canal en clair, le reste replié ── */}
      {(canaux.length > 1 || filtrables) && (
        <div className="dm-fbar">
          {canaux.length > 1 && (
            <>
              <button className="dm-chip" aria-pressed={canal === null} onClick={() => setCanal(null)}>
                tous
                <span className="n">{duJour.length}</span>
              </button>
              {canaux.map((k) => (
                <button
                  key={k}
                  className="dm-chip ic"
                  aria-pressed={canal === k}
                  title={KIND_LABEL[k] ?? demCh(k).lb}
                  onClick={() => setCanal(canal === k ? null : k)}
                >
                  <Icon name={demCh(k).ic} className="ico-xs" />
                  <span className="n">{parCanal[k]}</span>
                </button>
              ))}
            </>
          )}

          {filtrables && (
            <div className="dm-fpop" ref={refFiltres}>
              <button
                type="button"
                className="dm-chip more"
                aria-pressed={filtresCaches > 0}
                aria-expanded={filtresOuverts}
                onClick={() => setFiltresOuverts(!filtresOuverts)}
              >
                <Icon name="layers" className="ico-xs" />
                {filtresCaches > 0 ? filtresCaches : "Filtrer"}
              </button>

              {filtresOuverts && (
                <div className="dm-fmenu" role="dialog" aria-label="Filtres">
                  {SIGNAL_ORDER.some((s) => parSignal[s] > 0) && (
                    <div className="g">
                      <span className="lb">Signal</span>
                      <div className="ch">
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
                    </div>
                  )}

                  {cohortes.length > 0 && (
                    <div className="g">
                      <span className="lb">Cohorte</span>
                      <div className="ch">
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
                    </div>
                  )}

                  {etapes.length > 1 && (
                    <div className="g">
                      <span className="lb">Étape</span>
                      <div className="ch">
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
                    </div>
                  )}

                  {filtresCaches > 0 && (
                    <button
                      type="button"
                      className="dm-fclear"
                      onClick={() => {
                        setSignal(null);
                        setCohorte(null);
                        setStep(null);
                      }}
                    >
                      <Icon name="x" className="ico-xs" />
                      Tout relâcher
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
          <div className="dm-fr-vide">Chargement…</div>
        )}
        {!loading && tasks.length === 0 && (
          <div className="dm-fr-vide">
            {duJour.length === 0 ? videDeLaFile : "Rien dans ces filtres."}
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
          // Une relance dépliée depuis « à venir » n'est pas du travail du jour :
          // sa date est le seul moyen de ne pas la confondre avec le reste.
          const plusTard = file === "relances" && rep.aVenir.includes(t);
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
                  {plusTard && <span className="st plus-tard">{jourCourt(t.due_at)}</span>}
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

        {/* CE QUI REMPLACE LA FRISE : un pied de liste. On ne montre pas sept
            journées à venir, on dit combien il y en a — et on les déplie quand
            la journée est finie et qu'on veut prendre de l'avance. */}
        {file === "relances" && rep.aVenir.length > 0 && (
          <button
            type="button"
            className="dm-fr-plus"
            aria-expanded={aVenirOuvert}
            onClick={() => setAVenirOuvert(!aVenirOuvert)}
          >
            <Icon name={aVenirOuvert ? "chevronUp" : "chevronDown"} className="ico-xs" />
            {aVenirOuvert
              ? "Masquer ce qui est prévu plus tard"
              : `${rep.aVenir.length} relance${rep.aVenir.length > 1 ? "s" : ""} prévue${
                  rep.aVenir.length > 1 ? "s" : ""
                } plus tard`}
          </button>
        )}
      </div>
    </aside>
  );
}
