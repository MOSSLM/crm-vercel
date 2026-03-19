"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bold, CalendarDays, KanbanSquare, LayoutGrid, List, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  note_markdown: string | null;
};

type Task = {
  id: string;
  titre: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  note_markdown: string | null;
  subtasks: Subtask[];
};

type EditorTarget =
  | { kind: "task"; task: Task }
  | { kind: "subtask"; taskId: string; subtask: Subtask };

const statusLabel: Record<ItemStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
};

const priorityLabel: Record<Priority, string> = {
  haute: "Haute",
  moyenne: "Moyenne",
  basse: "Basse",
};

const normalizeDate = (value: string | null) => (value ? value.slice(0, 10) : null);

const dateLabel = (value: string | null) => {
  if (!value) return "Sans date";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

const getProgress = (task: Task) => {
  if (task.subtasks.length === 0) {
    return task.status === "termine" ? 100 : task.status === "en_cours" ? 50 : 0;
  }

  const done = task.subtasks.filter((subtask) => subtask.status === "termine").length;
  return Math.round((done / task.subtasks.length) * 100);
};

const getTaskDate = (task: Task) => normalizeDate(task.due_date ?? task.end_at ?? task.start_at);

function ProgressCircle({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className="grid h-16 w-16 place-items-center rounded-full"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${safeValue * 3.6}deg, hsl(var(--muted)) 0deg)`,
      }}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-background text-xs font-semibold">{safeValue}%</div>
    </div>
  );
}

export function StandaloneTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => normalizeDate(new Date().toISOString()) ?? "");
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() - 3);
    return now;
  });
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [editorForm, setEditorForm] = useState({ titre: "", status: "a_faire" as ItemStatus, priority: "moyenne" as Priority, due_date: "", note_markdown: "" });

  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: taskRows } = await supabase
        .from("crm_tasks")
        .select("id,titre,status,priority,due_date,start_at,end_at,note_markdown")
        .is("project_id", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      const taskIds = (taskRows ?? []).map((task) => task.id as string);
      const { data: subtaskRows } = taskIds.length
        ? await supabase
            .from("crm_subtasks")
            .select("id,task_id,titre,status,priority,due_date,note_markdown")
            .in("task_id", taskIds)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [] };

      const grouped = new Map<string, Subtask[]>();
      ((subtaskRows as Subtask[] | null) ?? []).forEach((subtask) => {
        grouped.set(subtask.task_id, [...(grouped.get(subtask.task_id) ?? []), subtask]);
      });

      const mapped = ((taskRows as Omit<Task, "subtasks">[] | null) ?? []).map((task) => ({
        ...task,
        subtasks: grouped.get(task.id) ?? [],
      }));

      setTasks(mapped);
      setLoading(false);
    };

    void load();
  }, []);

  const timelineDays = useMemo(() => {
    return Array.from({ length: 14 }).map((_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const iso = normalizeDate(date.toISOString()) ?? "";
      return {
        iso,
        day: date.toLocaleDateString("fr-FR", { weekday: "short" }),
        number: date.getDate(),
      };
    });
  }, [startDate]);

  const tasksWithProgress = useMemo(() => tasks.map((task) => ({ ...task, progress: getProgress(task), day: getTaskDate(task) })), [tasks]);
  const orderedTasks = useMemo(() => [...tasksWithProgress].sort((a, b) => a.titre.localeCompare(b.titre, "fr")), [tasksWithProgress]);
  const tasksForSelectedDate = useMemo(() => orderedTasks.filter((task) => task.day === selectedDate), [orderedTasks, selectedDate]);

  const metrics = useMemo(() => {
    const totalTasks = tasksWithProgress.length;
    const highPriority = tasksWithProgress.filter((task) => task.priority === "haute").length;
    const totalSubtasks = tasksWithProgress.reduce((acc, task) => acc + task.subtasks.length, 0);
    const averageProgress = totalTasks ? Math.round(tasksWithProgress.reduce((acc, task) => acc + task.progress, 0) / totalTasks) : 0;

    return [
      { label: "Tâches", value: totalTasks, tone: "bg-blue-500/15 text-blue-700" },
      { label: "Priorité élevée", value: highPriority, tone: "bg-orange-500/15 text-orange-700" },
      { label: "Sous-tâches", value: totalSubtasks, tone: "bg-emerald-500/15 text-emerald-700" },
      { label: "Avancement moyen", value: `${averageProgress}%`, tone: "bg-purple-500/15 text-purple-700" },
    ];
  }, [tasksWithProgress]);

  const groupedByStatus = useMemo(
    () => ({
      a_faire: orderedTasks.filter((task) => task.status === "a_faire"),
      en_cours: orderedTasks.filter((task) => task.status === "en_cours"),
      termine: orderedTasks.filter((task) => task.status === "termine"),
    }),
    [orderedTasks]
  );

  const shiftTimeline = (direction: "prev" | "next") => {
    const next = new Date(startDate);
    next.setDate(next.getDate() + (direction === "next" ? 7 : -7));
    setStartDate(next);
  };

  const openTaskEditor = (task: Task) => {
    setEditorTarget({ kind: "task", task });
    setEditorForm({
      titre: task.titre,
      status: task.status,
      priority: task.priority,
      due_date: normalizeDate(task.due_date) ?? "",
      note_markdown: task.note_markdown ?? "",
    });
  };

  const openSubtaskEditor = (taskId: string, subtask: Subtask) => {
    setEditorTarget({ kind: "subtask", taskId, subtask });
    setEditorForm({
      titre: subtask.titre,
      status: subtask.status,
      priority: subtask.priority,
      due_date: normalizeDate(subtask.due_date) ?? "",
      note_markdown: subtask.note_markdown ?? "",
    });
  };

  const applyMarkdown = (prefix: string, suffix = "") => {
    setEditorForm((prev) => ({ ...prev, note_markdown: `${prev.note_markdown}${prefix}${suffix}` }));
  };

  const saveEditor = async () => {
    if (!editorTarget) return;
    const payload = {
      titre: editorForm.titre.trim() || "Sans titre",
      status: editorForm.status,
      priority: editorForm.priority,
      due_date: editorForm.due_date || null,
      note_markdown: editorForm.note_markdown || null,
    };

    if (editorTarget.kind === "task") {
      await supabase.from("crm_tasks").update(payload).eq("id", editorTarget.task.id);
      setTasks((prev) =>
        prev.map((task) => (task.id === editorTarget.task.id ? { ...task, ...payload } : task))
      );
    } else {
      await supabase.from("crm_subtasks").update(payload).eq("id", editorTarget.subtask.id);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editorTarget.taskId
            ? { ...task, subtasks: task.subtasks.map((st) => (st.id === editorTarget.subtask.id ? { ...st, ...payload } : st)) }
            : task
        )
      );
    }
    setEditorTarget(null);
  };

  const taskCard = (task: (typeof orderedTasks)[number]) => (
    <button key={task.id} type="button" onClick={() => openTaskEditor(task)} className="w-full text-left">
      <Card className="h-full border-2 transition hover:border-primary/60 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="line-clamp-2 font-semibold leading-tight">{task.titre}</p>
              <p className="text-xs text-muted-foreground">Échéance: {dateLabel(task.day)}</p>
              <Badge variant="outline" className="mt-1">{priorityLabel[task.priority]}</Badge>
            </div>
            <ProgressCircle value={task.progress} />
          </div>

          <div className="mt-4 flex items-end justify-between text-xs text-muted-foreground">
            <span>{task.subtasks.length} sous-tâche(s)</span>
            <span>{task.progress}% d&apos;avancée</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );

  return (
    <div className="space-y-6 px-4 pb-6 pt-2 lg:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Tâches</h1>
        <p className="text-sm text-muted-foreground">Survol pour surligner, clic pour modifier paramètres + note markdown.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className={metric.tone}>
            <CardContent className="p-4">
              <p className="text-3xl font-bold">{metric.value}</p>
              <p className="text-sm font-medium">{metric.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="cartes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cartes" className="gap-2"><LayoutGrid className="h-4 w-4" />Cartes</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-2"><KanbanSquare className="h-4 w-4" />Kanban</TabsTrigger>
          <TabsTrigger value="date" className="gap-2"><CalendarDays className="h-4 w-4" />Date</TabsTrigger>
        </TabsList>

        <TabsContent value="cartes">
          {loading ? <p className="text-sm text-muted-foreground">Chargement des tâches...</p> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{orderedTasks.map(taskCard)}</div>
        </TabsContent>

        <TabsContent value="kanban">
          {loading ? <p className="text-sm text-muted-foreground">Chargement des tâches...</p> : null}
          <div className="grid gap-4 lg:grid-cols-3">
            {(["a_faire", "en_cours", "termine"] as ItemStatus[]).map((status) => (
              <Card key={status}>
                <CardContent className="space-y-3 p-4">
                  <p className="flex items-center justify-between text-base font-semibold"><span>{statusLabel[status]}</span><Badge variant="secondary">{groupedByStatus[status].length}</Badge></p>
                  {groupedByStatus[status].map(taskCard)}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="date" className="space-y-4">
          <Card>
            <CardContent className="relative p-4">
              <Button size="icon" variant="outline" onClick={() => shiftTimeline("prev")} className="absolute left-2 top-1/2 z-10 -translate-y-1/2">
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div ref={timelineRef} className="flex gap-3 overflow-x-auto px-10 pb-2">
                {timelineDays.map((day) => {
                  const selected = day.iso === selectedDate;
                  return (
                    <button key={day.iso} type="button" onClick={() => setSelectedDate(day.iso)} className={`min-w-20 rounded-xl border p-3 text-center transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>
                      <p className="text-3xl font-bold leading-none">{day.number}</p>
                      <p className="mt-2 text-xs uppercase">{day.day}</p>
                    </button>
                  );
                })}
              </div>

              <Button size="icon" variant="outline" onClick={() => shiftTimeline("next")} className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {loading ? <p className="text-sm text-muted-foreground">Chargement des tâches...</p> : null}

          <Card>
            <CardContent className="space-y-2 p-2 sm:p-4">
              {!loading && tasksForSelectedDate.length === 0 ? <p className="text-sm text-muted-foreground">Aucune tâche due pour la date sélectionnée.</p> : null}
              {tasksForSelectedDate.map((task) => (
                <button key={task.id} type="button" onClick={() => openTaskEditor(task)} className="flex w-full flex-col gap-3 rounded-xl border p-3 text-left transition hover:border-primary/60 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{task.titre}</p>
                    <p className="text-xs text-muted-foreground">{task.subtasks.length} sous-tâche(s) · {dateLabel(task.day)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{priorityLabel[task.priority]}</Badge>
                    <ProgressCircle value={task.progress} />
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(editorTarget)} onOpenChange={(open) => !open && setEditorTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editorTarget?.kind === "task" ? "Modifier la tâche" : "Modifier la sous-tâche"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <Input className="md:col-span-2" value={editorForm.titre} onChange={(e) => setEditorForm((prev) => ({ ...prev, titre: e.target.value }))} placeholder="Titre" />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={editorForm.status} onChange={(e) => setEditorForm((prev) => ({ ...prev, status: e.target.value as ItemStatus }))}>
              <option value="a_faire">À faire</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={editorForm.priority} onChange={(e) => setEditorForm((prev) => ({ ...prev, priority: e.target.value as Priority }))}>
              <option value="haute">Haute</option>
              <option value="moyenne">Moyenne</option>
              <option value="basse">Basse</option>
            </select>
            <Input type="date" value={editorForm.due_date} onChange={(e) => setEditorForm((prev) => ({ ...prev, due_date: e.target.value }))} />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap gap-2 border-b pb-2">
              <Button variant="outline" size="sm" onClick={() => applyMarkdown("\n- ")}><List className="mr-1 h-4 w-4" />Liste</Button>
              <Button variant="outline" size="sm" onClick={() => applyMarkdown("**", "**")}><Bold className="mr-1 h-4 w-4" />Gras</Button>
              <Button variant="outline" size="sm" onClick={() => applyMarkdown("\n## ")}>Titre</Button>
            </div>
            <Textarea rows={12} value={editorForm.note_markdown} onChange={(e) => setEditorForm((prev) => ({ ...prev, note_markdown: e.target.value }))} placeholder="Note longue en markdown..." />
          </div>

          {editorTarget?.kind === "task" ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Sous-tâches (clique pour modifier)</p>
              <div className="space-y-2">
                {editorTarget.task.subtasks.map((subtask) => (
                  <button key={subtask.id} type="button" onClick={() => openSubtaskEditor(editorTarget.task.id, subtask)} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition hover:border-primary/60 hover:bg-muted/40">
                    <span>{subtask.titre}</span>
                    <span className="text-xs text-muted-foreground">{statusLabel[subtask.status]}</span>
                  </button>
                ))}
                {editorTarget.task.subtasks.length === 0 ? <p className="text-xs text-muted-foreground">Aucune sous-tâche.</p> : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditorTarget(null)}>Annuler</Button>
            <Button onClick={() => void saveEditor()}>Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
