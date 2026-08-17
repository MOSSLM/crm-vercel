"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { DemRail, type DemFilter } from "@/components/agent-portal/demarchage/DemRail";
import { DemHead } from "@/components/agent-portal/demarchage/DemHead";
import { DemSeqStrip } from "@/components/agent-portal/demarchage/DemSeqStrip";
import { DemActionCard } from "@/components/agent-portal/demarchage/DemActionCard";
import { DemHisto } from "@/components/agent-portal/demarchage/DemHisto";
import { DemSide } from "@/components/agent-portal/demarchage/DemSide";
import { DemSearch } from "@/components/agent-portal/demarchage/DemSearch";
import { DemHorsFile } from "@/components/agent-portal/demarchage/DemHorsFile";
import { DemAttribution } from "@/components/agent-portal/demarchage/DemAttribution";
import {
  SIGNAL_ORDER,
  cadenceEffective,
  dayOfTask,
  firstPlannedTask,
  planTasks,
  signalOf,
} from "@/lib/agent-portal/demarchage-buckets";
import type { CompanySearchResult } from "@/lib/entreprises/colonnes";
import type {
  CompanyBundle,
  DemCohorte,
  DemarchagePatchBody,
  DemarchageQueueMeta,
  DemarchageTask,
  DemAudit,
} from "@/components/agent-portal/demarchage/types";
import "@/components/agent-portal/demarchage/dem-skin.css";

const EMPTY_META: DemarchageQueueMeta = {
  done_today: 0,
  done_today_by_kind: {},
  done_today_conversation: 0,
};

/**
 * Démarchage — l'écran de la maquette SAMA, branché sur les vraies données.
 *
 * Trois zones : la file du jour à gauche (jour par jour, relances comprises),
 * l'entreprise en cours au centre (son dossier en en-tête, sa frise de
 * séquence, la carte d'action de l'étape, puis tout son historique), et à
 * droite ce dont on se sert pendant l'échange (démo, audit, RDV, registre).
 *
 * L'écran est piloté par une TÂCHE — sauf sur un point, et c'est volontaire :
 * une entreprise qui rappelle n'a par définition rien de prévu aujourd'hui.
 * `horsFile` ouvre alors sa fiche seule, sans tâche et sans rien créer.
 */
export default function AgentDemarchagePage() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<DemarchageTask[]>([]);
  const [meta, setMeta] = useState<DemarchageQueueMeta>(EMPTY_META);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  // Le jour affiché, par sa date civile (YYYY-MM-DD). Vide au premier rendu :
  // l'onglet se cale sur la journée de la tâche choisie dès que la file arrive,
  // et à défaut sur la première du plan (aujourd'hui).
  const [day, setDay] = useState<string>("");
  const [filt, setFilt] = useState<DemFilter>("all");
  /** Étape de séquence filtrée — `null` = toutes. */
  const [step, setStep] = useState<number | null>(null);
  /**
   * Cohorte filtrée — `null` = les deux.
   *
   * Contrairement au canal et au signal, elle ne filtre PAS en mémoire : elle
   * part au serveur (`?cohorte=…`). La campagne compare deux cohortes au même
   * âge, et une cohorte tronquée par la pagination de la file donnerait des
   * comptes faux — c'est la file entière qui doit être celle de la cohorte.
   */
  const [cohorte, setCohorte] = useState<DemCohorte | null>(null);

  const [company, setCompany] = useState<CompanyBundle | null>(null);
  const [audit, setAudit] = useState<DemAudit>(null);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  /** La recherche « quelqu'un rappelle » est-elle ouverte ? */
  const [recherche, setRecherche] = useState(false);
  /** L'entreprise regardée hors file, quand elle n'a aucune tâche à traiter. */
  const [horsFile, setHorsFile] = useState<number | null>(null);

  /**
   * S'attribuer des entreprises : le panneau, et ce que le pool contient.
   *
   * `poolDispo` vaut `null` tant qu'on ne sait pas — l'agent n'a peut-être pas
   * ce droit (cf. `agent_settings.can_self_assign`), et proposer un bouton qui
   * répondra « interdit » vaut moins que ne rien proposer. La réponse est un
   * aperçu : un compte, pas quarante fiches que personne n'a demandé à voir.
   */
  const [attribution, setAttribution] = useState(false);
  const [poolDispo, setPoolDispo] = useState<number | null>(null);

  const relirePool = useCallback(async () => {
    try {
      const res = await authedFetch("/api/agent/demarchage/pool?apercu=1");
      if (!res.ok) return;
      const body = (await res.json()) as { autorise?: boolean; total?: number };
      setPoolDispo(body.autorise ? (body.total ?? 0) : null);
    } catch {
      // sans réponse, le bouton ne s'affiche pas : c'est le bon défaut
    }
  }, []);

  useEffect(() => {
    void relirePool();
  }, [relirePool]);

  /**
   * Recharge la file et décide sur quoi on atterrit.
   *
   * `pick` non fourni  → on reste sur la tâche courante ;
   * `pick === null`    → recalcul complet (la tâche traitée a quitté la file) ;
   * `pick` = fonction  → on choisit à partir de la file FRAÎCHE, ce qui est le
   *   seul moyen de retrouver une ligne que le serveur vient de créer (typiquement
   *   l'attente de réponse posée par le moteur juste après un « Fait »).
   */
  const loadQueue = useCallback(
    async (pick?: string | null | ((rows: DemarchageTask[]) => string | null)) => {
      setLoadingQueue(true);
      try {
        // La cohorte est le seul filtre qui voyage jusqu'à la route : les deux
        // autres trient ce qui est déjà chargé.
        const res = await authedFetch(
          cohorte ? `/api/agent/tasks?cohorte=${encodeURIComponent(cohorte)}` : "/api/agent/tasks",
        );
        if (!res.ok) return;
        const body = (await res.json()) as { tasks: DemarchageTask[]; meta: DemarchageQueueMeta };
        const next = body.tasks ?? [];
        const nextMeta = body.meta ?? EMPTY_META;
        setTasks(next);
        setMeta(nextMeta);
        setSel((current) => {
          const wanted = typeof pick === "function" ? pick(next) : pick === undefined ? current : pick;
          if (wanted && next.some((t) => t.id === wanted)) return wanted;
          return (
            firstPlannedTask(
              planTasks(next, {
                doneToday: nextMeta.done_today_by_kind,
                quotas: cadenceEffective(nextMeta.quotas),
              }),
            )?.id ?? null
          );
        });
      } catch {
        toast.error("Impossible de charger la file de démarchage.");
      } finally {
        setLoadingQueue(false);
      }
    },
    [cohorte],
  );

  // Changer de cohorte relance la requête : `loadQueue` en dépend, donc son
  // identité change, donc cet effet rejoue. C'est le seul rechargement voulu.
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // Le plan : les journées à venir, chacune remplie à la cadence quotidienne de
  // chaque canal. `done_today_by_kind` est indispensable — sans lui, la journée
  // se rechargerait à chaque tâche bouclée.
  //
  // `meta.quotas` L'EST TOUT AUTANT, et pour une raison qui ne se voit pas :
  // sans lui, `planTasks` retombe sur `DAILY_QUOTA` (60 par jour) pendant que le
  // rail affiche « /100 » lu du serveur. Les deux chiffres seraient vrais
  // séparément, et faux ensemble — quarante entreprises de la journée
  // basculeraient au lendemain, tous les jours, sans que rien ne le signale.
  const days = useMemo(
    () => planTasks(tasks, { doneToday: meta.done_today_by_kind, quotas: cadenceEffective(meta.quotas) }),
    [tasks, meta.done_today_by_kind, meta.quotas],
  );

  // Le jour affiché suit la tâche sélectionnée : cliquer une relance de demain
  // dans la file ne doit pas laisser l'onglet sur « aujourd'hui ».
  const task = useMemo(() => tasks.find((t) => t.id === sel) ?? null, [tasks, sel]);
  useEffect(() => {
    const k = task ? dayOfTask(days, task.id) : null;
    // À défaut de sélection (ou si la tâche a quitté la file), on retombe sur
    // la première journée du plan plutôt que de garder une date qui n'existe
    // plus — un onglet sans journée n'afficherait rien du tout.
    setDay((current) => k ?? (days.some((d) => d.date === current) ? current : days[0]?.date ?? ""));
  }, [task, days]);

  const duJour = useMemo(() => days.find((d) => d.date === day)?.tasks ?? [], [days, day]);

  /** Une tâche répond-elle à ce filtre ? Un filtre est SOIT un signal
   *  (« en discussion », « chauds »…) SOIT un canal — les deux vocabulaires ne
   *  se mélangent pas dans une même barre. La cohorte, elle, est une TROISIÈME
   *  dimension : elle se combine avec celle-ci au lieu de la remplacer. */
  const correspond = useCallback(
    (t: DemarchageTask, f: DemFilter) =>
      f === "all" || (SIGNAL_ORDER.includes(f as never) ? signalOf(t) === f : t.kind === f),
    [],
  );

  // Les pastilles ne montrent que ce que la journée contient : un filtre resté
  // coché sur un canal absent afficherait une file vide SANS afficher le filtre
  // responsable — impossible à défaire autrement qu'en rechargeant. On le
  // relâche donc dès qu'il n'a plus de pastille.
  useEffect(() => {
    setFilt((f) => (duJour.some((t) => correspond(t, f)) ? f : "all"));
    setStep((s) => (s == null || duJour.some((t) => t.sequence?.stepIndex === s) ? s : null));
  }, [duJour, correspond]);

  // Le même filet, pour la cohorte. Il regarde la file ENTIÈRE et non la
  // journée : le filtre étant servi par la route, une cohorte sans aucune ligne
  // ne rend pas une journée vide mais une file vide — et rien à l'écran ne
  // dirait pourquoi. On le relâche, ce qui recharge les deux cohortes.
  useEffect(() => {
    if (cohorte && !loadingQueue && tasks.length === 0) setCohorte(null);
  }, [cohorte, loadingQueue, tasks.length]);

  const shown = useMemo(
    () =>
      duJour.filter(
        (t) => (step == null || t.sequence?.stepIndex === step) && correspond(t, filt),
      ),
    [duJour, filt, step, correspond],
  );

  // Fiche entreprise + audit à chaque changement de prospect. La fiche ouverte
  // hors file prime sur la tâche sélectionnée : c'est elle qu'on regarde, la
  // file continue d'exister derrière sans se recharger.
  const entrepriseId = horsFile ?? task?.entreprise_id ?? null;
  useEffect(() => {
    if (!entrepriseId) {
      setCompany(null);
      setAudit(null);
      return;
    }
    let active = true;
    (async () => {
      const [cRes, aRes] = await Promise.all([
        authedFetch(`/api/agent/demarchage/company?entreprise_id=${entrepriseId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        authedFetch(`/api/audit-site/${entrepriseId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!active) return;
      setCompany((cRes as CompanyBundle) ?? null);
      setAudit(aRes?.disponible === false ? null : ((aRes?.audit as DemAudit) ?? null));
    })();
    return () => {
      active = false;
    };
  }, [entrepriseId]);

  /**
   * Le dossier de la fiche hors file — et seulement s'il est bien le SIEN.
   *
   * Le bundle précédent reste affiché pendant le chargement du suivant, ce qui
   * est un confort quand on enchaîne les tâches. Ici, non : le nom encore à
   * l'écran est celui qu'on s'apprête à prononcer au téléphone. On attend donc
   * que le dossier chargé corresponde à l'entreprise demandée.
   */
  const ficheHorsFile =
    horsFile != null && company?.entreprise.id === horsFile ? company : null;
  const enTete = horsFile != null ? ficheHorsFile : company;

  /**
   * « / » ouvre la recherche : une seule touche, atteignable sans regarder le
   * clavier pendant que ça sonne. ⌘K et ⌘J sont déjà pris par le menu de
   * commandes et le cockpit RDV de l'espace agent.
   *
   * Rien n'est intercepté pendant une saisie — sans quoi taper « et/ou » dans
   * une note ouvrirait la recherche. Le champ de recherche gère lui-même
   * Entrée, les flèches et Échap.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const enSaisie =
        !!cible &&
        (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName));
      if (enSaisie) return;
      if (e.key === "/") {
        e.preventDefault();
        setRecherche(true);
        return;
      }
      // Échap quitte la fiche hors file et rend la file — le chemin de retour
      // d'un aller sans clic.
      if (e.key === "Escape" && !recherche && horsFile != null) {
        e.preventDefault();
        setHorsFile(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recherche, horsFile]);

  const estEnFile = useCallback(
    (id: number) => tasks.some((t) => t.entreprise_id === id),
    [tasks],
  );

  /**
   * Ce qui se passe quand on choisit une entreprise dans la recherche.
   *
   * Si elle a une tâche en file, on atterrit dessus — et on relâche les filtres
   * au passage : atterrir sur une tâche que la liste de gauche n'affiche pas
   * ferait dire deux choses différentes au même écran. Sinon, sa fiche seule.
   */
  const ouvrirEntreprise = useCallback(
    (e: CompanySearchResult) => {
      setRecherche(false);
      const enFile = tasks.find((t) => t.entreprise_id === e.id);
      if (enFile) {
        setHorsFile(null);
        setFilt("all");
        setStep(null);
        setSel(enFile.id);
        return;
      }
      setHorsFile(e.id);
    },
    [tasks],
  );

  const goNext = useCallback(() => {
    const next = shown.find((t) => t.id !== sel);
    if (next) setSel(next.id);
  }, [shown, sel]);

  const handlePatch = useCallback(
    async (body: Omit<DemarchagePatchBody, "id">) => {
      if (!task) return;
      // Retenus AVANT l'appel : une fois la tâche bouclée, elle disparaît de la
      // file et ces deux repères avec elle.
      const enrollmentId = task.enrollment_id;
      const suivante = shown.find((t) => t.id !== task.id)?.id ?? null;

      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, ...body }),
        });
        if (!res.ok) throw new Error();
        toast.success(body.step_outcome ? "Issue enregistrée." : "C'est fait.");
        setHistoryKey((k) => k + 1);
        await loadQueue((rows) => {
          // On suit le prospect, pas la file : boucler un premier contact gare
          // sa séquence sur l'attente de réponse, et c'est cette ligne-là qu'on
          // veut sous les yeux — pas un prospect au hasard. À défaut (séquence
          // terminée, arrêtée, ou appel à froid qui n'en a jamais eu), on
          // enchaîne sur la tâche suivante.
          const suite = enrollmentId ? rows.find((t) => t.enrollment_id === enrollmentId) : undefined;
          return suite?.id ?? suivante;
        });
      } catch {
        toast.error("Action impossible.");
      } finally {
        setBusy(false);
      }
    },
    [task, shown, loadQueue],
  );

  const onLogged = useCallback(() => setHistoryKey((k) => k + 1), []);

  /**
   * La tâche a quitté la file sans passer par le `PATCH` habituel — une sortie
   * de canal (« pas sur WhatsApp »), qui annule la tâche et ferme sa séquence
   * d'un seul geste côté serveur. On enchaîne comme après n'importe quel geste
   * bouclé : la tâche suivante de la liste affichée.
   */
  const onRetire = useCallback(() => {
    const suivante = shown.find((t) => t.id !== sel)?.id ?? null;
    setHistoryKey((k) => k + 1);
    void loadQueue(suivante);
  }, [shown, sel, loadQueue]);

  /**
   * Le prospect a répondu : l'attente est levée et le moteur a déjà posé
   * l'étape suivante. On atterrit dessus — c'est tout l'intérêt d'avoir déclaré
   * la réponse, et cette étape-là est justement celle qu'il faut faire dans la
   * foulée (typiquement : envoyer le site démo).
   */
  const onReplied = useCallback(() => {
    const enrollmentId = task?.enrollment_id ?? null;
    const courant = task?.id ?? null;
    setHistoryKey((k) => k + 1);
    void loadQueue((rows) => {
      const suite = enrollmentId
        ? rows.find((t) => t.enrollment_id === enrollmentId && t.id !== courant)
        : undefined;
      return suite?.id ?? null;
    });
  }, [task, loadQueue]);

  const companyName = enTete?.entreprise.name ?? "";

  return (
    <div className="dm-skin" style={{ flex: 1, minHeight: 0 }}>
      <div className="dm">
        <DemRail
          days={days}
          day={day}
          setDay={setDay}
          filt={filt}
          setFilt={setFilt}
          step={step}
          setStep={setStep}
          cohorte={cohorte}
          setCohorte={setCohorte}
          tasks={shown}
          meta={meta}
          agentName={user?.name ?? null}
          loading={loadingQueue}
          // Rien de surligné dans la file quand on regarde une fiche hors
          // file : ce n'est pas elle qui est à l'écran.
          sel={horsFile != null ? null : (task?.id ?? null)}
          onPick={(id) => {
            setHorsFile(null);
            setSel(id);
          }}
          onRechercher={() => setRecherche(true)}
          poolDispo={poolDispo}
          onAttribuer={() => setAttribution(true)}
        />

        {enTete && (task || horsFile != null) ? (
          <DemHead
            company={enTete}
            sequence={horsFile != null ? null : (task?.sequence ?? null)}
            audit={audit}
            cohorte={horsFile != null ? null : (task?.cohorte ?? null)}
            horsSequence={horsFile == null && task?.hors_sequence === true}
          />
        ) : (
          <header className="dm-head">
            <div className="dm-hd">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">Démarchage</div>
                <div className="sb">
                  <span className="it">
                    {horsFile != null
                      ? "Ouverture de la fiche…"
                      : loadingQueue
                        ? "Chargement de la file…"
                        : "Aucune entreprise à démarcher pour l'instant."}
                  </span>
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="dm-main">
          {horsFile != null ? (
            ficheHorsFile && (
              <>
                <DemHorsFile company={ficheHorsFile} onRetour={() => setHorsFile(null)} />
                <DemHisto
                  entrepriseId={horsFile}
                  companyName={companyName}
                  refreshKey={historyKey}
                />
              </>
            )
          ) : task ? (
            <>
              <DemSeqStrip
                sequence={task.sequence}
                horsSequence={task.hors_sequence === true}
                cohorte={task.cohorte ?? null}
              />
              <DemActionCard
                key={task.id}
                task={task}
                company={company}
                audit={audit}
                busy={busy}
                onPatch={handlePatch}
                onLogged={onLogged}
                onNext={goNext}
                onReplied={onReplied}
                onRetire={onRetire}
              />
              {task.entreprise_id != null && (
                <DemHisto
                  entrepriseId={task.entreprise_id}
                  companyName={companyName}
                  refreshKey={historyKey}
                />
              )}
            </>
          ) : (
            !loadingQueue && (
              // Le message d'avant parlait de séquences : depuis les appels à
              // froid, une file vide veut dire « plus personne à appeler », pas
              // « aucune séquence en cours ».
              <div className="dm-hint">
                File vide — aucune entreprise n&apos;attend d&apos;action aujourd&apos;hui. Si
                quelqu&apos;un rappelle, sa fiche se retrouve avec « / ».
              </div>
            )
          )}
        </main>

        {enTete && (task || horsFile != null) ? (
          <DemSide
            company={enTete}
            audit={audit}
            opportuniteId={
              horsFile != null ? (enTete.opportunite?.id ?? null) : (task?.opportunite_id ?? null)
            }
          />
        ) : (
          <aside className="dm-side" />
        )}

        <DemSearch
          ouvert={recherche}
          onFermer={() => setRecherche(false)}
          onChoisir={ouvrirEntreprise}
          estEnFile={estEnFile}
        />

        <DemAttribution
          ouvert={attribution}
          onFermer={() => setAttribution(false)}
          onAttribue={() => {
            // L'attribution sème une tâche « Appel à froid » par entreprise :
            // c'est elle qui les fait apparaître ici. Sans ce rechargement, le
            // lot resterait invisible jusqu'au prochain passage sur la page.
            void loadQueue();
            void relirePool();
          }}
        />
      </div>
    </div>
  );
}
