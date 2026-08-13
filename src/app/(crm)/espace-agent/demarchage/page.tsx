"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { DemarchageFrise } from "@/components/agent-portal/demarchage/DemarchageFrise";
import { CompanyHeaderCard } from "@/components/agent-portal/demarchage/CompanyHeaderCard";
import { ContactsPanel } from "@/components/agent-portal/demarchage/ContactsPanel";
import { QuickLinksPanel } from "@/components/agent-portal/demarchage/QuickLinksPanel";
import { StageActionCard } from "@/components/agent-portal/demarchage/StageActionCard";
import { HistoryTimeline } from "@/components/agent-portal/demarchage/HistoryTimeline";
import { bucketTasks, firstNonEmptyBucket } from "@/lib/agent-portal/demarchage-buckets";
import type {
  CompanyBundle,
  DemarchagePatchBody,
  DemarchageQueueMeta,
  DemarchageTask,
} from "@/components/agent-portal/demarchage/types";

const EMPTY_META: DemarchageQueueMeta = { due_today: 0, done_today: 0 };

/**
 * Poste de travail Démarchage, 3 colonnes façon cockpit d'appel :
 * - gauche : la frise des entreprises en séquence (aujourd'hui, demain…) ;
 * - centre : le titre intégré de l'entreprise sélectionnée, sa carte
 *   d'action (adaptée à son étape de séquence, script d'appel inclus), et
 *   son fil d'historique unique en dessous ;
 * - droite : ce qu'on a à disposition pour cette entreprise — contacts,
 *   site démo, audit, RDV.
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
    <div className="grid gap-6 p-4 lg:grid-cols-[320px_1fr_320px] lg:items-start lg:p-6">
      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <DemarchageFrise
          tasks={tasks}
          meta={meta}
          loading={loadingQueue}
          selectedId={selectedTaskId}
          onSelect={(t) => setSelectedTaskId(t.id)}
        />
      </div>

      <div className="min-w-0 space-y-5">
        <div className="flex justify-end">
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
            <CompanyHeaderCard company={company} loading={loadingCompany} task={selectedTask} />
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
              <HistoryTimeline key={`${selectedTask.entreprise_id}-${historyKey}`} entrepriseId={selectedTask.entreprise_id} />
            )}
          </>
        )}
      </div>

      {selectedTask && company && (
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pl-1">
          <ContactsPanel key={`contacts-${company.entreprise.id}`} company={company} />
          <div className="mt-4">
            <QuickLinksPanel key={`links-${company.entreprise.id}`} company={company} opportuniteId={selectedTask.opportunite_id} />
          </div>
        </div>
      )}
    </div>
  );
}
