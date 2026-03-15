"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/utils/supabase/client";

type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type Subtask = {
  id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  start_at: string | null;
  end_at: string | null;
};

type Task = {
  id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
};

const priorityLabel: Record<Priority, string> = { haute: "Haute", moyenne: "Moyenne", basse: "Basse" };

const formatDate = (value: string | null) => {
  if (!value) return "Sans date";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
};

export function TaskUniquePage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;

    const load = async () => {
      setLoading(true);

      const [{ data: taskRow }, { data: subtasksRows }] = await Promise.all([
        supabase.from("crm_tasks").select("id,titre,status,priority,due_date,start_at,end_at").eq("id", taskId).maybeSingle(),
        supabase
          .from("crm_subtasks")
          .select("id,titre,status,priority,start_at,end_at")
          .eq("task_id", taskId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      setTask((taskRow as Task | null) ?? null);
      setSubtasks((subtasksRows as Subtask[] | null) ?? []);
      setLoading(false);
    };

    void load();
  }, [taskId]);

  const progress = useMemo(() => {
    if (!task) return 0;
    if (subtasks.length === 0) return task.status === "termine" ? 100 : task.status === "en_cours" ? 50 : 0;
    const done = subtasks.filter((subtask) => subtask.status === "termine").length;
    return Math.round((done / subtasks.length) * 100);
  }, [subtasks, task]);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement de la tâche...</p>;

  if (!task) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">Tâche introuvable.</p>
          <Button asChild variant="outline">
            <Link href="/production/taches">Retour aux tâches</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/production/taches" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux tâches
          </Link>
        </Button>
        <Badge variant="outline">Tâche unique</Badge>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">{task.titre}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Vue détaillée avec toutes les sous-tâches.</p>
            </div>
            <Badge>{priorityLabel[task.priority]}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Sous-tâches</p>
              <p className="text-2xl font-bold">{subtasks.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Échéance</p>
              <p className="text-base font-semibold">{formatDate(task.due_date ?? task.end_at ?? task.start_at)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Avancement</p>
              <p className="text-2xl font-bold">{progress}%</p>
            </div>
          </div>

          <Progress value={progress} className="h-2" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ListChecks className="h-4 w-4" />Sous-tâches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subtasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune sous-tâche pour cette tâche.</p> : null}

          {subtasks.map((subtask) => (
            <div key={subtask.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {subtask.status === "termine" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">{subtask.titre}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(subtask.end_at ?? subtask.start_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{priorityLabel[subtask.priority]}</Badge>
                <Badge variant="secondary" className="capitalize">{subtask.status.replace("_", " ")}</Badge>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
