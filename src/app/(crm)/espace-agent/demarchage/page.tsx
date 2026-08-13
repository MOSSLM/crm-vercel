"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { DemarchageFrise } from "@/components/agent-portal/demarchage/DemarchageFrise";
import { CompanyHeaderCard } from "@/components/agent-portal/demarchage/CompanyHeaderCard";
import { QuickLinksPanel } from "@/components/agent-portal/demarchage/QuickLinksPanel";
import { StageActionCard } from "@/components/agent-portal/demarchage/StageActionCard";
import { HistoryFeed } from "@/components/agent-portal/demarchage/HistoryFeed";
import { bucketTasks, firstNonEmptyBucket } from "@/lib/agent-portal/demarchage-buckets";
import type {
  CompanyBundle,
  DemarchagePatchBody,
  DemarchageQueueMeta,
  DemarchageTask,
} from "@/components/agent-portal/demarchage/types";

const EMPTY_META: DemarchageQueueMeta = { due_today: 0, done_today: 0 };

/**
 * Poste de travail Démarchage : à gauche la frise des entreprises en
 * séquence (aujourd'hui, demain, cette semaine…), au centre une seule
 * entreprise à la fois — sa fiche, ses raccourcis (démo/audit/RDV), la carte
 * d'action adaptée à son étape de séquence, et tout son historique.
 */
export default function AgentDemarchagePage() {
  const [tasks, setTasks] = useState<DemarchageTask[]>([]);
  const [meta, setMeta] = useState<DemarchageQueueMeta>(EMPTY_META);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyBundle | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // `preferId` : la tâche à privilégier si elle existe encore dans la
  // nouvelle file (ex. après un simple rafraîchissement). `null` explicite
  // force le recalcul du premier panier non vide — c'est le cas après une
  // issue enregistrée, où la tâche traitée vient de sortir de la file.
  const loadQueue = useCallback(async (preferId?: string | null) => {
    setLoadingQueue(true);
    try {
      const res = await authedFetch("/api/agent/tasks");
      if (!res.ok) return;
      const body = (await res.json()) as { tasks: DemarchageTask[]; meta: DemarchageQueueMeta };
      const nextTasks = body.tasks ?? [];
      setTasks(nextTasks);
      setMeta(body.meta ?? EMPTY_META);

      setSelectedTaskId((current) => {
        const wanted = preferId === undefined ? current : preferId;
        if (wanted && nextTasks.some((t) => t.id === wanted)) return wanted;
        return firstNonEmptyBucket(bucketTasks(nextTasks))?.id ?? null;
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

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const siblingCount = useMemo(() => {
    if (!selectedTask) return 0;
    return tasks.filter((t) => t.id !== selectedTask.id && t.entreprise_id === selectedTask.entreprise_id).length;
  }, [tasks, selectedTask]);

  useEffect(() => {
    const entrepriseId = selectedTask?.entreprise_id;
    if (!entrepriseId) {
      setCompany(null);
      return;
    }
    let active = true;
    setLoadingCompany(true);
    (async () => {
      try {
        const res = await authedFetch(`/api/agent/demarchage/company?entreprise_id=${entrepriseId}`);
        if (!res.ok) {
          if (active) setCompany(null);
          return;
        }
        const body = (await res.json()) as CompanyBundle;
        if (active) setCompany(body);
      } finally {
        if (active) setLoadingCompany(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedTask?.entreprise_id]);

  const handlePatch = useCallback(
    async (body: Omit<DemarchagePatchBody, "id">) => {
      if (!selectedTask) return;
      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedTask.id, ...body }),
        });
        if (!res.ok) throw new Error();
        toast.success("Issue enregistrée.");
        setHistoryKey((k) => k + 1);
        // La tâche traitée vient de sortir de la file (statut done ou
        // replanifié) : on laisse `loadQueue` choisir la suivante.
        await loadQueue(null);
      } catch {
        toast.error("Action impossible.");
      } finally {
        setBusy(false);
      }
    },
    [selectedTask, loadQueue],
  );

  const handleMessageLogged = useCallback(() => setHistoryKey((k) => k + 1), []);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[320px_1fr] lg:items-start lg:p-6">
      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <DemarchageFrise
          tasks={tasks}
          meta={meta}
          loading={loadingQueue}
          selectedId={selectedTaskId}
          onSelect={(t) => setSelectedTaskId(t.id)}
        />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Démarchage</h1>
            <p className="text-sm text-muted-foreground">
              Un prospect à la fois — la carte s&apos;adapte à son étape de séquence.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/espace-agent/argumentaire">
              <BookOpen className="mr-1 h-4 w-4" /> Brief commercial
            </Link>
          </Button>
        </div>

        {!loadingQueue && !selectedTask && (
          <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
            File vide 🎉 — aucune entreprise en séquence à traiter pour l&apos;instant.
          </div>
        )}

        {selectedTask && (
          <>
            <CompanyHeaderCard company={company} loading={loadingCompany} />
            {company && <QuickLinksPanel company={company} opportuniteId={selectedTask.opportunite_id} />}
            <StageActionCard
              key={selectedTask.id}
              task={selectedTask}
              company={company}
              busy={busy}
              siblingCount={siblingCount}
              onPatch={handlePatch}
              onMessageLogged={handleMessageLogged}
            />
            {selectedTask.entreprise_id != null && (
              <HistoryFeed key={`${selectedTask.entreprise_id}-${historyKey}`} entrepriseId={selectedTask.entreprise_id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
