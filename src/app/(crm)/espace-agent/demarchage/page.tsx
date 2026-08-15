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
import {
  SIGNAL_ORDER,
  dayOfTask,
  firstPlannedTask,
  planTasks,
  signalOf,
} from "@/lib/agent-portal/demarchage-buckets";
import type {
  CompanyBundle,
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

  const [company, setCompany] = useState<CompanyBundle | null>(null);
  const [audit, setAudit] = useState<DemAudit>(null);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  /**
   * Recharge la file et décide sur quoi on atterrit.
   *
   * `pick` non fourni  → on reste sur la tâche courante ;
   * `pick === null`    → recalcul complet (la tâche traitée a quitté la file) ;
   * `pick` = fonction  → on choisit à partir de la file FRAÎCHE, ce qui est le
   *   seul moyen de retrouver une ligne que le serveur vient de créer (typiquement
   *   l'attente de réponse posée par le moteur juste après un « Fait »).
   */
  const loadQueue = useCallback(async (pick?: string | null | ((rows: DemarchageTask[]) => string | null)) => {
    setLoadingQueue(true);
    try {
      const res = await authedFetch("/api/agent/tasks");
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
          firstPlannedTask(planTasks(next, { doneToday: nextMeta.done_today_by_kind }))?.id ?? null
        );
      });
    } catch {
      toast.error("Impossible de charger la file de démarchage.");
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // Le plan : les journées à venir, chacune remplie à la cadence quotidienne de
  // chaque canal. `done_today_by_kind` est indispensable — sans lui, la journée
  // se rechargerait à chaque tâche bouclée.
  const days = useMemo(
    () => planTasks(tasks, { doneToday: meta.done_today_by_kind }),
    [tasks, meta.done_today_by_kind],
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
   *  se mélangent pas dans une même barre. */
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

  const shown = useMemo(
    () =>
      duJour.filter(
        (t) => (step == null || t.sequence?.stepIndex === step) && correspond(t, filt),
      ),
    [duJour, filt, step, correspond],
  );

  // Fiche entreprise + audit à chaque changement de prospect.
  const entrepriseId = task?.entreprise_id ?? null;
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
          // terminée, arrêtée), on enchaîne sur la tâche suivante.
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

  const companyName = company?.entreprise.name ?? "";

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
          tasks={shown}
          meta={meta}
          agentName={user?.name ?? null}
          loading={loadingQueue}
          sel={task?.id ?? null}
          onPick={setSel}
        />

        {company && task ? (
          <DemHead company={company} sequence={task.sequence} audit={audit} />
        ) : (
          <header className="dm-head">
            <div className="dm-hd">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">Démarchage</div>
                <div className="sb">
                  <span className="it">
                    {loadingQueue ? "Chargement de la file…" : "Aucune entreprise en séquence à traiter."}
                  </span>
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="dm-main">
          {task ? (
            <>
              <DemSeqStrip sequence={task.sequence} />
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
              <div className="dm-hint">
                File vide — aucune entreprise en séquence n&apos;attend d&apos;action aujourd&apos;hui.
              </div>
            )
          )}
        </main>

        {company && task ? (
          <DemSide company={company} audit={audit} opportuniteId={task.opportunite_id} />
        ) : (
          <aside className="dm-side" />
        )}
      </div>
    </div>
  );
}
