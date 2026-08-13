"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { DemRail } from "@/components/agent-portal/demarchage/DemRail";
import { DemHead } from "@/components/agent-portal/demarchage/DemHead";
import { DemSeqStrip } from "@/components/agent-portal/demarchage/DemSeqStrip";
import { DemActionCard } from "@/components/agent-portal/demarchage/DemActionCard";
import { DemHisto } from "@/components/agent-portal/demarchage/DemHisto";
import { DemSide } from "@/components/agent-portal/demarchage/DemSide";
import { bucketTasks, firstNonEmptyBucket, type DemarchageBucketKey } from "@/lib/agent-portal/demarchage-buckets";
import type {
  CompanyBundle,
  DemarchagePatchBody,
  DemarchageQueueMeta,
  DemarchageTask,
  DemAudit,
  DemTemplates,
} from "@/components/agent-portal/demarchage/types";
import "@/components/agent-portal/demarchage/dem-skin.css";

const EMPTY_META: DemarchageQueueMeta = { due_today: 0, done_today: 0 };

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

  // « Aujourd'hui » par défaut, mais `firstNonEmptyBucket` (au chargement de
  // la file) bascule sur « Non rappelés » ou « Chauds » dès qu'il y en a :
  // un signal chaud ne doit pas attendre qu'on pense à changer d'onglet.
  const [day, setDay] = useState<DemarchageBucketKey>("today");
  const [filt, setFilt] = useState("all");

  const [company, setCompany] = useState<CompanyBundle | null>(null);
  const [audit, setAudit] = useState<DemAudit>(null);
  const [templates, setTemplates] = useState<DemTemplates | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  /** `preferId === null` force le recalcul : la tâche traitée a quitté la file. */
  const loadQueue = useCallback(async (preferId?: string | null) => {
    setLoadingQueue(true);
    try {
      const res = await authedFetch("/api/agent/tasks");
      if (!res.ok) return;
      const body = (await res.json()) as { tasks: DemarchageTask[]; meta: DemarchageQueueMeta };
      const next = body.tasks ?? [];
      setTasks(next);
      setMeta(body.meta ?? EMPTY_META);
      setSel((current) => {
        const wanted = preferId === undefined ? current : preferId;
        if (wanted && next.some((t) => t.id === wanted)) return wanted;
        return firstNonEmptyBucket(bucketTasks(next))?.id ?? null;
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

  // La bibliothèque de modèles ne dépend pas du prospect : une seule fois.
  useEffect(() => {
    let active = true;
    void authedFetch("/api/agent/demarchage/templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (active && b) setTemplates(b as DemTemplates);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);

  // Le jour affiché suit la tâche sélectionnée : cliquer une relance de demain
  // dans la file ne doit pas laisser l'onglet sur « aujourd'hui ».
  const task = useMemo(() => tasks.find((t) => t.id === sel) ?? null, [tasks, sel]);
  useEffect(() => {
    if (!task) return;
    for (const k of ["missed", "hot", "overdue", "today", "tomorrow", "week", "later"] as DemarchageBucketKey[]) {
      if (buckets[k].some((t) => t.id === task.id)) {
        setDay(k);
        return;
      }
    }
  }, [task, buckets]);

  const shown = useMemo(() => {
    const list = buckets[day];
    return list.filter((t) =>
      filt === "all"
        ? true
        : filt === "call"
          ? t.kind === "call"
          : filt === "msg"
            ? t.kind === "whatsapp" || t.kind === "linkedin"
            : t.kind === "wait",
    );
  }, [buckets, day, filt]);

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
      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, ...body }),
        });
        if (!res.ok) throw new Error();
        toast.success("Issue enregistrée.");
        setHistoryKey((k) => k + 1);
        await loadQueue(null);
      } catch {
        toast.error("Action impossible.");
      } finally {
        setBusy(false);
      }
    },
    [task, loadQueue],
  );

  const onLogged = useCallback(() => setHistoryKey((k) => k + 1), []);
  const onReplied = useCallback(() => void loadQueue(null), [loadQueue]);

  const companyName = company?.entreprise.name ?? "";

  return (
    <div className="dm-skin" style={{ flex: 1, minHeight: 0 }}>
      <div className="dm">
        <DemRail
          buckets={buckets}
          day={day}
          setDay={setDay}
          filt={filt}
          setFilt={setFilt}
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
                templates={templates}
                busy={busy}
                onPatch={handlePatch}
                onLogged={onLogged}
                onNext={task.kind === "wait" ? onReplied : goNext}
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
