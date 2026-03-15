"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, CirclePlus, GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  start_at?: string | null;
  end_at?: string | null;
  position?: number | null;
};

type Task = {
  id: string;
  project_id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  position?: number | null;
  subtasks: Subtask[];
};

type Project = {
  id: string;
  nom: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  color?: string | null;
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

function ProgressCircle({ value, color }: { value: number; color?: string | null }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle cx="24" cy="24" r={radius} stroke="currentColor" strokeWidth="5" className="text-slate-200" fill="none" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke={color ?? "#4f46e5"}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">{safe}%</span>
    </div>
  );
}

export function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskStartAt, setTaskStartAt] = useState("");
  const [taskEndAt, setTaskEndAt] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [showSubtaskForm, setShowSubtaskForm] = useState<Record<string, boolean>>({});
  const [showAllTasks, setShowAllTasks] = useState(true);
  const [showAllSubtasks, setShowAllSubtasks] = useState(true);
  const [subtaskForms, setSubtaskForms] = useState<Record<string, { titre: string; dueDate: string; startAt: string; endAt: string }>>({});
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragSubtask, setDragSubtask] = useState<{ taskId: string; subtaskId: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: projectData } = await supabase
      .from("crm_projects")
      .select("id,nom,status,priority,due_date,color,entreprises(name),offres(nom)")
      .eq("id", projectId)
      .single();

    const { data: taskRows } = await supabase
      .from("crm_tasks")
      .select("id,project_id,titre,status,priority,due_date,start_at,end_at,position")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const taskIds = (taskRows ?? []).map((task) => task.id as string);

    const { data: subtaskRows } = taskIds.length
      ? await supabase
          .from("crm_subtasks")
          .select("id,task_id,titre,status,priority,due_date,start_at,end_at,position")
          .in("task_id", taskIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
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
            color: projectRow.color ?? "#4f46e5",
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
        start_at: taskStartAt || null,
        end_at: taskEndAt || null,
        status: "a_faire",
        priority: "moyenne",
        progress: 0,
        position: (tasks.length + 1) * 100,
      })
      .select("id,project_id,titre,status,priority,due_date,start_at,end_at,position")
      .single();

    if (data) {
      setTasks((prev) => [...prev, { ...(data as Task), subtasks: [] }]);
      setTaskTitle("");
      setTaskDueDate("");
    setTaskStartAt("");
    setTaskEndAt("");
      setShowTaskForm(false);
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
        start_at: form.startAt || null,
        end_at: form.endAt || null,
        status: "a_faire",
        priority: "moyenne",
        progress: 0,
        position: ((tasks.find((task) => task.id === taskId)?.subtasks.length ?? 0) + 1) * 100,
      })
      .select("id,task_id,titre,status,priority,due_date,start_at,end_at,position")
      .single();

    if (data) {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, subtasks: [...task.subtasks, data as Subtask] } : task))
      );
      setSubtaskForms((prev) => ({ ...prev, [taskId]: { titre: "", dueDate: "", startAt: "", endAt: "" } }));
      setShowSubtaskForm((prev) => ({ ...prev, [taskId]: false }));
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


  const persistTaskOrder = async (next: Task[]) => {
    await Promise.all(next.map((task, index) => supabase.from("crm_tasks").update({ position: (index + 1) * 100 }).eq("id", task.id)));
  };

  const persistSubtaskOrder = async (taskId: string, next: Subtask[]) => {
    await Promise.all(next.map((subtask, index) => supabase.from("crm_subtasks").update({ position: (index + 1) * 100 }).eq("id", subtask.id).eq("task_id", taskId)));
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from("crm_tasks").delete().eq("id", taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const deleteSubtask = async (taskId: string, subtaskId: string) => {
    await supabase.from("crm_subtasks").delete().eq("id", subtaskId);
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId) } : task)));
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !(prev[taskId] ?? showAllSubtasks) }));
  };

  const isTaskExpanded = (taskId: string) => {
    if (expandedTaskIds[taskId] !== undefined) return expandedTaskIds[taskId];
    return showAllSubtasks;
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

      <Card style={{ backgroundColor: `${project.color ?? "#4f46e5"}12` }} className="relative overflow-hidden">
        <svg className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 opacity-40" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="project-blob-gradient" x1="0" x2="1" y1="1" y2="0">
              <stop stopColor={project.color ?? "#4f46e5"} stopOpacity="0.35" offset="0%" />
              <stop stopColor={project.color ?? "#4f46e5"} stopOpacity="0.18" offset="100%" />
            </linearGradient>
          </defs>
          <path
            fill="url(#project-blob-gradient)"
            d="M14,-21.5C18,-19.2,21.1,-15.1,24.2,-10.4C27.3,-5.7,30.4,-0.5,32.7,6.8C34.9,14.1,36.2,23.3,32.1,27.5C28,31.7,18.4,30.9,10.2,31.9C2.1,33,-4.7,36,-8.7,33.2C-12.7,30.4,-14,21.8,-17.1,16C-20.3,10.2,-25.4,7.3,-26,3.7C-26.6,0,-22.8,-4.3,-21.6,-11C-20.3,-17.7,-21.6,-26.7,-18.5,-29.4C-15.3,-32,-7.7,-28.3,-1.3,-26.2C5,-24.1,10,-23.7,14,-21.5Z"
            transform="translate(50 50)"
          />
        </svg>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{project.nom}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.entreprises?.name ? `Entreprise: ${project.entreprises.name} • ` : ""}
                {project.offres?.nom ? `Offre: ${project.offres.nom} • ` : ""}
                {project.due_date ? `Échéance: ${project.due_date}` : "Pas d'échéance"}
              </p>
              <Badge className={cn("mt-2 border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
            </div>
            <ProgressCircle value={projectProgress} color={project.color} />
          </div>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={showAllTasks ? "default" : "outline"} size="sm" onClick={() => setShowAllTasks((v) => !v)}>
          {showAllTasks ? "Masquer tâches" : "Étendre aux tâches"}
        </Button>
        <Button variant={showAllSubtasks ? "default" : "outline"} size="sm" onClick={() => setShowAllSubtasks((v) => !v)}>
          {showAllSubtasks ? "Masquer sous-tâches" : "Étendre aux sous-tâches"}
        </Button>
      </div>

      <Tabs defaultValue="cartes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 md:w-auto">
          <TabsTrigger value="cartes">Cartes</TabsTrigger>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="tableau">Tableau</TabsTrigger>
        </TabsList>

        <div>
          <Button variant="outline" onClick={() => setShowTaskForm((v) => !v)}>
            <CirclePlus className="mr-2 h-4 w-4" /> Ajouter une tâche
          </Button>
          {showTaskForm && (
            <Card className="mt-3">
              <CardContent className="grid gap-2 p-4 md:grid-cols-3">
                <Input placeholder="Titre de la tâche" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                <Input type="datetime-local" value={taskStartAt} onChange={(e) => setTaskStartAt(e.target.value)} />
                <Input type="datetime-local" value={taskEndAt} onChange={(e) => setTaskEndAt(e.target.value)} />
                <Button onClick={addTask}>
                  <Plus className="mr-2 h-4 w-4" /> Confirmer
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <TabsContent value="cartes">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => {
              const expanded = isTaskExpanded(task.id);
              return (
                <Card key={task.id} draggable onDragStart={() => setDragTaskId(task.id)} onDragOver={(e) => e.preventDefault()} onDrop={async () => {
                      if (!dragTaskId || dragTaskId === task.id) return;
                      const sourceIndex = tasks.findIndex((entry) => entry.id === dragTaskId);
                      if (sourceIndex < 0) return;
                      const next = [...tasks];
                      const [moved] = next.splice(sourceIndex, 1);
                      const targetIndex = tasks.findIndex((entry) => entry.id === task.id);
                      next.splice(targetIndex, 0, moved);
                      setTasks(next);
                      setDragTaskId(null);
                      await persistTaskOrder(next);
                    }} onDragEnd={() => setDragTaskId(null)}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                        <Checkbox checked={task.status === "termine"} onCheckedChange={(checked) => void toggleTask(task, Boolean(checked))} />
                        <CardTitle className="text-lg">{task.titre}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressCircle value={taskProgress(task)} color={project.color} />
                        <Button variant="ghost" size="icon" onClick={() => void deleteTask(task.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleTaskExpanded(task.id)}>
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded && showAllTasks && (
                    <CardContent className="space-y-3">
                      <Button variant="secondary" size="sm" onClick={() => setShowSubtaskForm((prev) => ({ ...prev, [task.id]: !(prev[task.id] ?? false) }))}>
                        <CirclePlus className="mr-2 h-4 w-4" /> Ajouter sous-tâche
                      </Button>

                      {showSubtaskForm[task.id] && (
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="md:col-span-2">
                            <Label>Nouvelle sous-tâche</Label>
                            <Input
                              placeholder="Titre sous-tâche"
                              value={subtaskForms[task.id]?.titre ?? ""}
                              onChange={(e) =>
                                setSubtaskForms((prev) => ({
                                  ...prev,
                                  [task.id]: { titre: e.target.value, dueDate: prev[task.id]?.dueDate ?? "", startAt: prev[task.id]?.startAt ?? "", endAt: prev[task.id]?.endAt ?? "" },
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
                                  [task.id]: { titre: prev[task.id]?.titre ?? "", dueDate: e.target.value, startAt: prev[task.id]?.startAt ?? "", endAt: prev[task.id]?.endAt ?? "" },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Début</Label>
                            <Input
                              type="datetime-local"
                              value={subtaskForms[task.id]?.startAt ?? ""}
                              onChange={(e) =>
                                setSubtaskForms((prev) => ({
                                  ...prev,
                                  [task.id]: { titre: prev[task.id]?.titre ?? "", dueDate: prev[task.id]?.dueDate ?? "", startAt: e.target.value, endAt: prev[task.id]?.endAt ?? "" },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Fin</Label>
                            <Input
                              type="datetime-local"
                              value={subtaskForms[task.id]?.endAt ?? ""}
                              onChange={(e) =>
                                setSubtaskForms((prev) => ({
                                  ...prev,
                                  [task.id]: { titre: prev[task.id]?.titre ?? "", dueDate: prev[task.id]?.dueDate ?? "", startAt: prev[task.id]?.startAt ?? "", endAt: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Button variant="outline" onClick={() => addSubtask(task.id)}>Créer sous-tâche</Button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {task.subtasks.map((subtask) => (
                          <div key={subtask.id} className="flex items-center justify-between rounded-md border p-2" draggable onDragStart={(e) => { e.stopPropagation(); setDragSubtask({ taskId: task.id, subtaskId: subtask.id }); }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!dragSubtask || dragSubtask.taskId !== task.id || dragSubtask.subtaskId === subtask.id) return;
                              const sourceIndex = task.subtasks.findIndex((entry) => entry.id === dragSubtask.subtaskId);
                              if (sourceIndex < 0) return;
                              const targetIndex = task.subtasks.findIndex((entry) => entry.id === subtask.id);
                              const reordered = [...task.subtasks];
                              const [moved] = reordered.splice(sourceIndex, 1);
                              reordered.splice(targetIndex, 0, moved);
                              setTasks((prev) => prev.map((entry) => (entry.id === task.id ? { ...entry, subtasks: reordered } : entry)));
                              setDragSubtask(null);
                              await persistSubtaskOrder(task.id, reordered);
                            }} onDragEnd={() => setDragSubtask(null)}>
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                              <Checkbox
                                checked={subtask.status === "termine"}
                                onCheckedChange={(checked) => void toggleSubtask(task.id, subtask, Boolean(checked))}
                              />
                              <span>{subtask.titre}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{subtask.due_date ?? "Sans échéance"}</span>
                              <Button variant="ghost" size="icon" onClick={() => void deleteSubtask(task.id, subtask.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {task.subtasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune sous-tâche.</p> : null}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="liste" className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id} draggable onDragStart={() => setDragTaskId(task.id)} onDragOver={(e) => e.preventDefault()} onDrop={async () => {
                      if (!dragTaskId || dragTaskId === task.id) return;
                      const sourceIndex = tasks.findIndex((entry) => entry.id === dragTaskId);
                      if (sourceIndex < 0) return;
                      const next = [...tasks];
                      const [moved] = next.splice(sourceIndex, 1);
                      const targetIndex = tasks.findIndex((entry) => entry.id === task.id);
                      next.splice(targetIndex, 0, moved);
                      setTasks(next);
                      setDragTaskId(null);
                      await persistTaskOrder(next);
                    }} onDragEnd={() => setDragTaskId(null)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={task.status === "termine"} onCheckedChange={(checked) => void toggleTask(task, Boolean(checked))} />
                    <span className="font-medium">{task.titre}</span>
                  </div>
                  <ProgressCircle value={taskProgress(task)} color={project.color} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tableau">
          <Card>
            <CardContent className="p-4 space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded border p-2">
                  <span>{task.titre}</span>
                  <span className="text-xs text-muted-foreground">{task.due_date ?? "-"}</span>
                  <ProgressCircle value={taskProgress(task)} color={project.color} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune tâche pour ce projet.</p> : null}
    </div>
  );
}
