"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Columns2, ListTodo, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/utils/supabase/client";

type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type Subtask = { id: string; task_id: string; titre: string; status: ItemStatus; priority: Priority; start_at: string | null; end_at: string | null };
type Task = {
  id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  start_at: string | null;
  end_at: string | null;
  due_date: string | null;
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
  const [form, setForm] = useState({ titre: "", status: "a_faire" as ItemStatus, priority: "moyenne" as Priority, startAt: "", endAt: "" });

  const load = async () => {
    setLoading(true);
    const { data: taskRows } = await supabase
      .from("crm_tasks")
      .select("id,titre,status,priority,start_at,end_at,due_date")
      .is("project_id", null)
      .order("created_at", { ascending: false });

    const taskIds = (taskRows ?? []).map((task) => task.id as string);
    const { data: subtaskRows } = taskIds.length
      ? await supabase.from("crm_subtasks").select("id,task_id,titre,status,priority,start_at,end_at").in("task_id", taskIds).order("created_at")
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

  const createTask = async () => {
    if (!form.titre.trim()) return;
    await supabase.from("crm_tasks").insert({
      titre: form.titre.trim(),
      status: form.status,
      priority: form.priority,
      project_id: null,
      start_at: form.startAt || null,
      end_at: form.endAt || null,
      due_date: form.endAt ? form.endAt.slice(0, 10) : form.startAt ? form.startAt.slice(0, 10) : null,
    });
    setForm({ titre: "", status: "a_faire", priority: "moyenne", startAt: "", endAt: "" });
    setCreateOpen(false);
    await load();
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
              <Card key={col.status}>
                <CardHeader><CardTitle className="text-base">{statusLabel[col.status]}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {col.tasks.map((task) => (
                    <div key={task.id} className="rounded border p-3">
                      <p className="font-medium">{task.titre}</p>
                      <div className="mt-1 flex gap-2">
                        <Badge variant="outline">{priorityLabel[task.priority]}</Badge>
                        <Badge variant="outline">{task.subtasks.length} sous-tâches</Badge>
                      </div>
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
              {tasks.map((task) => {
                const hasSubtasks = task.subtasks.length > 0;
                const isOpen = expanded[task.id] ?? false;
                return (
                  <div key={task.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{task.titre}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(task.start_at)} → {formatDateTime(task.end_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("border")}>{statusLabel[task.status]}</Badge>
                        <Badge variant="outline">{priorityLabel[task.priority]}</Badge>
                        {hasSubtasks ? (
                          <Button variant="ghost" size="icon" onClick={() => setExpanded((p) => ({ ...p, [task.id]: !isOpen }))}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {hasSubtasks && isOpen ? (
                      <div className="mt-2 space-y-1 border-l pl-4">
                        {task.subtasks.map((subtask) => (
                          <div key={subtask.id} className="text-sm">• {subtask.titre} ({statusLabel[subtask.status]})</div>
                        ))}
                      </div>
                    ) : null}
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
