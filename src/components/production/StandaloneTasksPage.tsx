"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCheck, ChevronDown, ChevronRight, Columns2, GripVertical, ListTodo, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/utils/supabase/client";

type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type Subtask = { id: string; task_id: string; titre: string; status: ItemStatus; priority: Priority; start_at: string | null; end_at: string | null; position?: number | null };
type Task = {
  id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  start_at: string | null;
  end_at: string | null;
  due_date: string | null;
  position?: number | null;
  subtasks: Subtask[];
};

const statusOptions: ItemStatus[] = ["a_faire", "en_cours", "termine"];
const priorityOptions: Priority[] = ["haute", "moyenne", "basse"];
const statusLabel: Record<ItemStatus, string> = { a_faire: "À faire", en_cours: "En cours", termine: "Terminé" };
const priorityLabel: Record<Priority, string> = { haute: "Haute", moyenne: "Moyenne", basse: "Basse" };

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString("fr-FR") : "-");

export function StandaloneTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragSubtask, setDragSubtask] = useState<{ taskId: string; subtaskId: string } | null>(null);
  const [showSubtaskForm, setShowSubtaskForm] = useState<Record<string, boolean>>({});
  const [subtaskForms, setSubtaskForms] = useState<Record<string, { titre: string; priority: Priority }>>({});
  const [form, setForm] = useState({ titre: "", status: "a_faire" as ItemStatus, priority: "moyenne" as Priority, startAt: "", endAt: "" });

  const load = async () => {
    setLoading(true);
    const { data: taskRows } = await supabase
      .from("crm_tasks")
      .select("id,titre,status,priority,start_at,end_at,due_date,position")
      .is("project_id", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const taskIds = (taskRows ?? []).map((task) => task.id as string);
    const { data: subtaskRows } = taskIds.length
      ? await supabase
          .from("crm_subtasks")
          .select("id,task_id,titre,status,priority,start_at,end_at,position")
          .in("task_id", taskIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [] };

    const grouped = new Map<string, Subtask[]>();
    ((subtaskRows as Subtask[] | null) ?? []).forEach((subtask) => {
      grouped.set(subtask.task_id, [...(grouped.get(subtask.task_id) ?? []), subtask]);
    });

    setTasks((((taskRows as Omit<Task, "subtasks">[] | null) ?? []).map((task) => ({ ...task, subtasks: grouped.get(task.id) ?? [] }))));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const persistTaskOrder = async (next: Task[]) => {
    await Promise.all(next.map((task, index) => supabase.from("crm_tasks").update({ position: (index + 1) * 100 }).eq("id", task.id)));
  };

  const persistSubtaskOrder = async (taskId: string, subtasks: Subtask[]) => {
    await Promise.all(subtasks.map((subtask, index) => supabase.from("crm_subtasks").update({ position: (index + 1) * 100 }).eq("id", subtask.id).eq("task_id", taskId)));
  };

  const createTask = async () => {
    if (!form.titre.trim()) return;
    const nextPosition = (tasks.length + 1) * 100;
    await supabase.from("crm_tasks").insert({
      titre: form.titre.trim(),
      status: form.status,
      priority: form.priority,
      project_id: null,
      start_at: form.startAt || null,
      end_at: form.endAt || null,
      due_date: form.endAt ? form.endAt.slice(0, 10) : form.startAt ? form.startAt.slice(0, 10) : null,
      position: nextPosition,
    });
    setForm({ titre: "", status: "a_faire", priority: "moyenne", startAt: "", endAt: "" });
    setCreateOpen(false);
    await load();
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
          ? { ...task, subtasks: task.subtasks.map((entry) => (entry.id === subtask.id ? { ...entry, status } : entry)) }
          : task
      )
    );
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from("crm_tasks").delete().eq("id", taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const deleteSubtask = async (taskId: string, subtaskId: string) => {
    await supabase.from("crm_subtasks").delete().eq("id", subtaskId);
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId) } : task)));
  };

  const addSubtask = async (taskId: string) => {
    const draft = subtaskForms[taskId];
    if (!draft?.titre?.trim()) return;

    const currentTask = tasks.find((task) => task.id === taskId);
    const nextPosition = ((currentTask?.subtasks.length ?? 0) + 1) * 100;

    await supabase.from("crm_subtasks").insert({
      task_id: taskId,
      titre: draft.titre.trim(),
      status: "a_faire",
      priority: draft.priority,
      position: nextPosition,
      start_at: null,
      end_at: null,
    });

    setSubtaskForms((prev) => ({ ...prev, [taskId]: { titre: "", priority: "moyenne" } }));
    setShowSubtaskForm((prev) => ({ ...prev, [taskId]: false }));
    await load();
  };

  const moveTaskToStatus = async (taskId: string, status: ItemStatus) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    await supabase.from("crm_tasks").update({ status }).eq("id", taskId);
  };

  const totalSubtasks = useMemo(() => tasks.reduce((acc, task) => acc + task.subtasks.length, 0), [tasks]);
  const doneCount = useMemo(
    () => tasks.filter((task) => task.status === "termine").length + tasks.flatMap((task) => task.subtasks).filter((subtask) => subtask.status === "termine").length,
    [tasks]
  );
  const totalCount = tasks.length + totalSubtasks;

  const renderSubtasks = (task: Task) => {
    const isOpen = expanded[task.id] ?? true;
    const hasSubtasks = task.subtasks.length > 0;
    const formIsOpen = showSubtaskForm[task.id] ?? false;

    return (
      <div className="mt-3 space-y-2 border-l pl-4">
        {hasSubtasks ? (
          <Button variant="ghost" className="h-7 px-1 text-xs" onClick={() => setExpanded((prev) => ({ ...prev, [task.id]: !isOpen }))}>
            {isOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            {isOpen ? "Masquer" : "Voir"} les sous-tâches ({task.subtasks.length})
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Aucune sous-tâche pour le moment.</p>
        )}

        {isOpen
          ? task.subtasks.map((subtask, subtaskIndex) => (
              <div
                key={subtask.id}
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2"
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDragSubtask({ taskId: task.id, subtaskId: subtask.id });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dragSubtask || dragSubtask.taskId !== task.id || dragSubtask.subtaskId === subtask.id) return;
                  const sourceIndex = task.subtasks.findIndex((entry) => entry.id === dragSubtask.subtaskId);
                  if (sourceIndex < 0) return;
                  const reordered = [...task.subtasks];
                  const [moved] = reordered.splice(sourceIndex, 1);
                  reordered.splice(subtaskIndex, 0, moved);
                  setTasks((prev) => prev.map((entry) => (entry.id === task.id ? { ...entry, subtasks: reordered } : entry)));
                  setDragSubtask(null);
                  await persistSubtaskOrder(task.id, reordered);
                }}
                onDragEnd={() => setDragSubtask(null)}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                  <Checkbox checked={subtask.status === "termine"} onCheckedChange={(checked) => void toggleSubtask(task.id, subtask, Boolean(checked))} />
                  <span className="text-sm">{subtask.titre}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{priorityLabel[subtask.priority]}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => void deleteSubtask(task.id, subtask.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          : null}

        <div className="space-y-2">
          <Button variant="secondary" size="sm" onClick={() => setShowSubtaskForm((prev) => ({ ...prev, [task.id]: !formIsOpen }))}>
            <Plus className="mr-2 h-4 w-4" />Ajouter une sous-tâche
          </Button>
          {formIsOpen ? (
            <div className="grid gap-2 rounded-md border bg-background p-3">
              <Input
                placeholder="Titre de la sous-tâche"
                value={subtaskForms[task.id]?.titre ?? ""}
                onChange={(e) => setSubtaskForms((prev) => ({ ...prev, [task.id]: { titre: e.target.value, priority: prev[task.id]?.priority ?? "moyenne" } }))}
              />
              <select
                className="h-9 w-full rounded-md border px-3"
                value={subtaskForms[task.id]?.priority ?? "moyenne"}
                onChange={(e) => setSubtaskForms((prev) => ({ ...prev, [task.id]: { titre: prev[task.id]?.titre ?? "", priority: e.target.value as Priority } }))}
              >
                {priorityOptions.map((item) => (
                  <option key={item} value={item}>{priorityLabel[item]}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => void addSubtask(task.id)}>Créer la sous-tâche</Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const kanbanColumns = useMemo(
    () => statusOptions.map((status) => ({ status, tasks: tasks.filter((task) => task.status === status) })),
    [tasks]
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tâches</CardTitle>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouvelle tâche</Button>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Éléments total</p>
              <p className="text-xl font-semibold">{totalCount}</p>
            </div>
            <ListTodo className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Terminés</p>
              <p className="text-xl font-semibold">{doneCount}</p>
            </div>
            <CheckCheck className="h-5 w-5 text-emerald-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Sous-tâches</p>
              <p className="text-xl font-semibold">{totalSubtasks}</p>
            </div>
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Créer une tâche sans projet</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Titre</Label><Input value={form.titre} onChange={(e) => setForm((p) => ({ ...p, titre: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Début</Label><Input type="datetime-local" value={form.startAt} onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))} /></div>
              <div><Label>Fin</Label><Input type="datetime-local" value={form.endAt} onChange={(e) => setForm((p) => ({ ...p, endAt: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Statut</Label><select className="h-9 w-full rounded-md border px-3" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ItemStatus }))}>{statusOptions.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</select></div>
              <div><Label>Priorité</Label><select className="h-9 w-full rounded-md border px-3" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Priority }))}>{priorityOptions.map((s) => <option key={s} value={s}>{priorityLabel[s]}</option>)}</select></div>
            </div>
          </div>
          <DialogFooter><Button onClick={createTask}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="kanban" className="space-y-3">
        <TabsList>
          <TabsTrigger value="kanban"><Columns2 className="mr-2 h-4 w-4" />Kanban</TabsTrigger>
          <TabsTrigger value="liste"><ListTodo className="mr-2 h-4 w-4" />Liste</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <div className="grid gap-4 md:grid-cols-3">
            {kanbanColumns.map((col) => (
              <Card
                key={col.status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (!dragTaskId) return;
                  await moveTaskToStatus(dragTaskId, col.status);
                  setDragTaskId(null);
                }}
              >
                <CardHeader><CardTitle className="text-base">{statusLabel[col.status]}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {col.tasks.map((task, taskIndex) => (
                    <div
                      key={task.id}
                      className="rounded border p-3"
                      draggable
                      onDragStart={() => setDragTaskId(task.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async () => {
                        if (!dragTaskId || dragTaskId === task.id) return;
                        const scopedTasks = tasks.filter((entry) => entry.status === col.status);
                        const sourceIndex = scopedTasks.findIndex((entry) => entry.id === dragTaskId);
                        if (sourceIndex < 0) return;
                        const reordered = [...scopedTasks];
                        const [moved] = reordered.splice(sourceIndex, 1);
                        reordered.splice(taskIndex, 0, moved);
                        const reorderedIds = reordered.map((entry) => entry.id);
                        const next = [...tasks];
                        const source = next.filter((entry) => entry.status === col.status);
                        let pointer = 0;
                        for (let i = 0; i < next.length; i += 1) {
                          if (next[i].status === col.status) {
                            next[i] = source.find((entry) => entry.id === reorderedIds[pointer]) ?? next[i];
                            pointer += 1;
                          }
                        }
                        setTasks(next);
                        setDragTaskId(null);
                        await persistTaskOrder(next);
                      }}
                      onDragEnd={() => setDragTaskId(null)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{task.titre}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(task.start_at)} → {formatDateTime(task.end_at)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <GripVertical className="mt-0.5 h-4 w-4 cursor-grab text-muted-foreground" />
                          <Button variant="ghost" size="icon" onClick={() => void deleteTask(task.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="outline">{priorityLabel[task.priority]}</Badge>
                        <Badge variant="outline">{task.subtasks.length} sous-tâches</Badge>
                      </div>
                      {renderSubtasks(task)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="liste">
          <Card>
            <CardContent className="space-y-2 p-4">
              {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : null}
              {tasks.map((task, taskIndex) => {
                return (
                  <div
                    key={task.id}
                    className="rounded-md border p-3"
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async () => {
                      if (!dragTaskId || dragTaskId === task.id) return;
                      const sourceIndex = tasks.findIndex((entry) => entry.id === dragTaskId);
                      if (sourceIndex < 0) return;
                      const next = [...tasks];
                      const [moved] = next.splice(sourceIndex, 1);
                      next.splice(taskIndex, 0, moved);
                      setTasks(next);
                      setDragTaskId(null);
                      await persistTaskOrder(next);
                    }}
                    onDragEnd={() => setDragTaskId(null)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 cursor-grab text-muted-foreground" />
                        <Checkbox checked={task.status === "termine"} onCheckedChange={(checked) => void toggleTask(task, Boolean(checked))} />
                        <div className="min-w-0">
                          <p className="font-medium">{task.titre}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(task.start_at)} → {formatDateTime(task.end_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("border")}>{statusLabel[task.status]}</Badge>
                        <Badge variant="outline">{priorityLabel[task.priority]}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => void deleteTask(task.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {renderSubtasks(task)}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
