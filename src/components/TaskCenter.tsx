"use client";

import React, { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, ChevronDown, ChevronUp, FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/utils/supabase/client";

type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type StandaloneTask = {
  id: string;
  project_id: string | null;
  titre: string;
  description: string | null;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  note_markdown: string | null;
  created_at: string;
};

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

const statusTone: Record<ItemStatus, string> = {
  a_faire: "bg-muted text-muted-foreground",
  en_cours: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  termine: "bg-green-500/15 text-green-700 dark:text-green-300",
};

const priorityTone: Record<Priority, string> = {
  basse: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  moyenne: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  haute: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const formatDate = (value: string | null) => {
  if (!value) return "Sans échéance";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

export function TaskCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<StandaloneTask[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const [newTask, setNewTask] = useState({
    titre: "",
    description: "",
    note_markdown: "",
    due_date: "",
    priority: "moyenne" as Priority,
    status: "a_faire" as ItemStatus,
  });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("crm_tasks")
        .select("id,project_id,titre,description,status,priority,due_date,note_markdown,created_at")
        .is("project_id", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks((data as StandaloneTask[] | null) ?? []);
    } catch (error) {
      console.error("Erreur lors du chargement des tâches:", error);
      toast.error("Erreur lors du chargement des tâches");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadTasks();
    }
  };

  const visibleTasks = useMemo(() => tasks.filter((task) => task.project_id === null), [tasks]);

  const createTask = async () => {
    if (!newTask.titre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        titre: newTask.titre.trim(),
        description: newTask.description.trim() || null,
        note_markdown: newTask.note_markdown.trim() || null,
        due_date: newTask.due_date || null,
        priority: newTask.priority,
        status: newTask.status,
        project_id: null,
      };

      const { data } = await supabase
        .from("crm_tasks")
        .insert(payload)
        .select("id,project_id,titre,description,status,priority,due_date,note_markdown,created_at")
        .single();

      if (data) {
        setTasks((prev) => [data as StandaloneTask, ...prev]);
      }

      setNewTask({
        titre: "",
        description: "",
        note_markdown: "",
        due_date: "",
        priority: "moyenne",
        status: "a_faire",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const startEditingNote = (task: StandaloneTask) => {
    setEditingId(task.id);
    setNoteDrafts((prev) => ({ ...prev, [task.id]: task.note_markdown ?? "" }));
  };

  const saveNote = async (taskId: string) => {
    const nextValue = noteDrafts[taskId] ?? "";
    setSaving(true);
    try {
      const { error } = await supabase
        .from("crm_tasks")
        .update({ note_markdown: nextValue.trim() || null })
        .eq("id", taskId)
        .is("project_id", null);
      if (error) throw error;
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, note_markdown: nextValue.trim() || null } : task)));
      setEditingId(null);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la note:", error);
      toast.error("Erreur lors de la sauvegarde de la note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9" aria-label="Ouvrir le centre de tâches">
          <CheckSquare className="h-4 w-4" />
          {visibleTasks.length > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {visibleTasks.length > 9 ? "9+" : visibleTasks.length}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4" />
            Centre de tâches
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 px-4 py-4">
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4" />
                Nouvelle tâche volante
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Titre de la tâche"
                  value={newTask.titre}
                  onChange={(event) => setNewTask((prev) => ({ ...prev, titre: event.target.value }))}
                />
                <Input
                  type="date"
                  value={newTask.due_date}
                  onChange={(event) => setNewTask((prev) => ({ ...prev, due_date: event.target.value }))}
                />
              </div>
              <Input
                className="mt-3"
                placeholder="Description rapide (optionnel)"
                value={newTask.description}
                onChange={(event) => setNewTask((prev) => ({ ...prev, description: event.target.value }))}
              />
              <Textarea
                className="mt-3"
                rows={4}
                placeholder="Notes markdown (optionnel)"
                value={newTask.note_markdown}
                onChange={(event) => setNewTask((prev) => ({ ...prev, note_markdown: event.target.value }))}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {(["a_faire", "en_cours", "termine"] as ItemStatus[]).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={newTask.status === status ? "default" : "outline"}
                    onClick={() => setNewTask((prev) => ({ ...prev, status }))}
                  >
                    {statusLabel[status]}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["basse", "moyenne", "haute"] as Priority[]).map((priority) => (
                  <Button
                    key={priority}
                    size="sm"
                    variant={newTask.priority === priority ? "default" : "outline"}
                    onClick={() => setNewTask((prev) => ({ ...prev, priority }))}
                  >
                    {priorityLabel[priority]}
                  </Button>
                ))}
              </div>
              <Button className="mt-3" onClick={() => void createTask()} disabled={saving || !newTask.titre.trim()}>
                {saving ? "Création..." : "Créer la tâche"}
              </Button>
            </section>

            <section className="space-y-3">
              {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p> : null}

              {!loading && visibleTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center">
                  <CheckSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">Aucune tâche volante</p>
                  <p className="text-xs text-muted-foreground">Ajoutez une tâche sans projet pour la voir ici.</p>
                </div>
              ) : null}

              {!loading && visibleTasks.length > 0
                ? visibleTasks.map((task, idx) => {
                    const expanded = Boolean(expandedIds[task.id]);
                    const isEditing = editingId === task.id;

                    return (
                      <React.Fragment key={task.id}>
                        <article className="rounded-xl border bg-card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-semibold">{task.titre}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(task.due_date)}</p>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <Badge className={statusTone[task.status]}>{statusLabel[task.status]}</Badge>
                                <Badge className={priorityTone[task.priority]}>{priorityLabel[task.priority]}</Badge>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpanded(task.id)}>
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>

                          {task.description ? <p className="mt-2 text-xs text-muted-foreground">{task.description}</p> : null}

                          {expanded ? (
                            <div className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3">
                              <div className="flex items-center gap-2 text-xs font-medium">
                                <FileText className="h-3.5 w-3.5" />
                                Notes
                              </div>

                              {isEditing ? (
                                <>
                                  <Textarea
                                    rows={6}
                                    value={noteDrafts[task.id] ?? ""}
                                    onChange={(event) =>
                                      setNoteDrafts((prev) => ({
                                        ...prev,
                                        [task.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => void saveNote(task.id)}>
                                      Enregistrer la note
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                      Annuler
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                                    {task.note_markdown?.trim() || "Aucune note pour le moment."}
                                  </p>
                                  <Button size="sm" variant="outline" onClick={() => startEditingNote(task)}>
                                    {task.note_markdown ? "Modifier la note" : "Ajouter une note"}
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </article>
                        {idx < visibleTasks.length - 1 ? <Separator /> : null}
                      </React.Fragment>
                    );
                  })
                : null}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
