"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/utils/supabase/client";

type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type Subtask = {
  id: string;
  task_id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
};

type Task = {
  id: string;
  project_id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  subtasks: Subtask[];
};

type Project = {
  id: string;
  nom: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  entreprises?: { name: string | null } | null;
  offres?: { nom: string } | null;
};

type ProjectQueryRow = Omit<Project, "entreprises" | "offres"> & {
  entreprises?: Array<{ name: string | null }>;
  offres?: Array<{ nom: string }>;
};

const statusLabel: Record<ItemStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
};

const getStatusTone = (status: ItemStatus): string => {
  if (status === "termine") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "en_cours") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

const taskProgress = (task: Task): number => {
  if (task.subtasks.length === 0) return task.status === "termine" ? 100 : 0;
  const done = task.subtasks.filter((subtask) => subtask.status === "termine").length;
  return Math.round((done / task.subtasks.length) * 100);
};

export function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [subtaskForms, setSubtaskForms] = useState<Record<string, { titre: string; dueDate: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data: projectData } = await supabase
      .from("crm_projects")
      .select("id,nom,status,priority,due_date,entreprises(name),offres(nom)")
      .eq("id", projectId)
      .single();

    const { data: taskRows } = await supabase
      .from("crm_tasks")
      .select("id,project_id,titre,status,priority,due_date")
      .eq("project_id", projectId)
      .order("created_at");

    const taskIds = (taskRows ?? []).map((task) => task.id as string);

    const { data: subtaskRows } = taskIds.length
      ? await supabase
          .from("crm_subtasks")
          .select("id,task_id,titre,status,priority,due_date")
          .in("task_id", taskIds)
          .order("created_at")
      : { data: [] as Subtask[] };

    const groupedSubtasks = new Map<string, Subtask[]>();
    ((subtaskRows as Subtask[] | null) ?? []).forEach((subtask) => {
      const bucket = groupedSubtasks.get(subtask.task_id) ?? [];
      bucket.push(subtask);
      groupedSubtasks.set(subtask.task_id, bucket);
    });

    const fullTasks = ((taskRows as Task[] | null) ?? []).map((task) => ({
      ...task,
      subtasks: groupedSubtasks.get(task.id) ?? [],
    }));

    const projectRow = (projectData as ProjectQueryRow | null) ?? null;
    setProject(
      projectRow
        ? {
            id: projectRow.id,
            nom: projectRow.nom,
            status: projectRow.status,
            priority: projectRow.priority,
            due_date: projectRow.due_date,
            entreprises: projectRow.entreprises?.[0] ?? null,
            offres: projectRow.offres?.[0] ?? null,
          }
        : null
    );
    setTasks(fullTasks);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const projectProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round(tasks.reduce((total, task) => total + taskProgress(task), 0) / tasks.length);
  }, [tasks]);

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    const { data } = await supabase
      .from("crm_tasks")
      .insert({
        project_id: projectId,
        titre: taskTitle.trim(),
        due_date: taskDueDate || null,
        status: "a_faire",
        priority: "moyenne",
        progress: 0,
      })
      .select("id,project_id,titre,status,priority,due_date")
      .single();

    if (data) {
      setTasks((prev) => [...prev, { ...(data as Task), subtasks: [] }]);
      setTaskTitle("");
      setTaskDueDate("");
    }
  };

  const addSubtask = async (taskId: string) => {
    const form = subtaskForms[taskId];
    if (!form?.titre.trim()) return;
    const { data } = await supabase
      .from("crm_subtasks")
      .insert({
        task_id: taskId,
        titre: form.titre.trim(),
        due_date: form.dueDate || null,
        status: "a_faire",
        priority: "moyenne",
        progress: 0,
      })
      .select("id,task_id,titre,status,priority,due_date")
      .single();

    if (data) {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, subtasks: [...task.subtasks, data as Subtask] } : task))
      );
      setSubtaskForms((prev) => ({ ...prev, [taskId]: { titre: "", dueDate: "" } }));
    }
  };

  const toggleTask = async (task: Task, checked: boolean) => {
    const status: ItemStatus = checked ? "termine" : "a_faire";
    await supabase.from("crm_tasks").update({ status, progress: checked ? 100 : 0 }).eq("id", task.id);
    setTasks((prev) => prev.map((entry) => (entry.id === task.id ? { ...entry, status } : entry)));
  };

  const toggleSubtask = async (taskId: string, subtask: Subtask, checked: boolean) => {
    const status: ItemStatus = checked ? "termine" : "a_faire";
    await supabase.from("crm_subtasks").update({ status, progress: checked ? 100 : 0 }).eq("id", subtask.id);
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: task.subtasks.map((entry) => (entry.id === subtask.id ? { ...entry, status } : entry)),
            }
          : task
      )
    );
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Chargement du projet...</div>;
  }

  if (!project) {
    return <div className="p-6 text-sm text-red-600">Projet introuvable.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Retour
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{project.nom}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {project.entreprises?.name ? `Entreprise: ${project.entreprises.name} • ` : ""}
            {project.offres?.nom ? `Offre: ${project.offres.nom} • ` : ""}
            {project.due_date ? `Échéance: ${project.due_date}` : "Pas d'échéance"}
          </p>
          <div className="flex items-center gap-2">
            <Badge className={cn("border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
            <span className="text-sm text-muted-foreground">Progression automatique: {projectProgress}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={projectProgress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter une tâche</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Input placeholder="Titre de la tâche" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
          <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
          <Button onClick={addTask}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter tâche
          </Button>
        </CardContent>
      </Card>

      {tasks.map((task) => (
        <Card key={task.id}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={task.status === "termine"} onCheckedChange={(checked) => void toggleTask(task, Boolean(checked))} />
                <CardTitle className="text-lg">{task.titre}</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">{taskProgress(task)}%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={taskProgress(task)} />

            <div className="grid gap-2 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Nouvelle sous-tâche</Label>
                <Input
                  placeholder="Titre sous-tâche"
                  value={subtaskForms[task.id]?.titre ?? ""}
                  onChange={(e) =>
                    setSubtaskForms((prev) => ({
                      ...prev,
                      [task.id]: {
                        titre: e.target.value,
                        dueDate: prev[task.id]?.dueDate ?? "",
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Échéance</Label>
                <Input
                  type="date"
                  value={subtaskForms[task.id]?.dueDate ?? ""}
                  onChange={(e) =>
                    setSubtaskForms((prev) => ({
                      ...prev,
                      [task.id]: {
                        titre: prev[task.id]?.titre ?? "",
                        dueDate: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
            <Button variant="secondary" onClick={() => addSubtask(task.id)}>Ajouter sous-tâche</Button>

            <div className="space-y-2">
              {task.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={subtask.status === "termine"}
                      onCheckedChange={(checked) => void toggleSubtask(task.id, subtask, Boolean(checked))}
                    />
                    <span>{subtask.titre}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{subtask.due_date ?? "Sans échéance"}</span>
                </div>
              ))}
              {task.subtasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune sous-tâche.</p> : null}
            </div>
          </CardContent>
        </Card>
      ))}
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune tâche pour ce projet.</p> : null}
    </div>
  );
}
