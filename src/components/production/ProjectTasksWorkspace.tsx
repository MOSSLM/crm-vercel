"use client";

import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";

type ProjectScope = "internal" | "client";
type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type Subtask = {
  id: string;
  title: string;
  status: ItemStatus;
  dueDate: string | null;
  priority: Priority;
  progress: number;
};

type Task = {
  id: string;
  title: string;
  status: ItemStatus;
  dueDate: string | null;
  priority: Priority;
  progress: number;
  subtasks: Subtask[];
};

type Project = {
  id: string;
  name: string;
  scope: ProjectScope;
  status: ItemStatus;
  dueDate: string | null;
  priority: Priority;
  progress: number;
  companyName: string | null;
  offerName: string | null;
  tasks: Task[];
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

const statusOptions: ItemStatus[] = ["a_faire", "en_cours", "termine"];
const priorityOptions: Priority[] = ["haute", "moyenne", "basse"];

const getStatusTone = (status: ItemStatus): string => {
  if (status === "termine") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "en_cours") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

const getPriorityTone = (priority: Priority): string => {
  if (priority === "haute") return "bg-rose-100 text-rose-700 border-rose-200";
  if (priority === "moyenne") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
};

const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`;
};

const computeTaskProgress = (task: Task): number => {
  if (task.subtasks.length === 0) return task.progress;
  return Math.round(
    task.subtasks.reduce((total, subtask) => total + subtask.progress, 0) / task.subtasks.length
  );
};

const computeProjectProgress = (project: Project): number => {
  if (project.tasks.length === 0) return project.progress;
  return Math.round(
    project.tasks.reduce((total, task) => total + computeTaskProgress(task), 0) / project.tasks.length
  );
};

const initialProjects: Project[] = [
  {
    id: uid(),
    name: "Onboarding CRM",
    scope: "internal",
    status: "en_cours",
    dueDate: null,
    priority: "moyenne",
    progress: 35,
    companyName: null,
    offerName: null,
    tasks: [
      {
        id: uid(),
        title: "Définir les templates",
        status: "en_cours",
        dueDate: null,
        priority: "moyenne",
        progress: 40,
        subtasks: [
          { id: uid(), title: "Template email", status: "termine", dueDate: null, priority: "moyenne", progress: 100 },
          { id: uid(), title: "Template devis", status: "en_cours", dueDate: null, priority: "moyenne", progress: 50 },
        ],
      },
    ],
  },
  {
    id: uid(),
    name: "Refonte site PrimaVita",
    scope: "client",
    status: "a_faire",
    dueDate: null,
    priority: "haute",
    progress: 15,
    companyName: "PrimaVita",
    offerName: "Site vitrine premium",
    tasks: [],
  },
];

type ProjectTasksWorkspaceProps = {
  title: string;
  description: string;
  scope: ProjectScope;
};

export function ProjectTasksWorkspace({ title, description, scope }: ProjectTasksWorkspaceProps) {
  const [projects, setProjects] = useState<Project[]>(() => initialProjects.filter((project) => project.scope === scope));
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [projectForm, setProjectForm] = useState({
    name: "",
    status: "a_faire" as ItemStatus,
    dueDate: "",
    priority: "moyenne" as Priority,
    progress: 0,
    companyName: "",
    offerName: "",
  });

  const [taskForms, setTaskForms] = useState<Record<string, { title: string; dueDate: string; priority: Priority; status: ItemStatus; progress: number }>>({});
  const [subtaskForms, setSubtaskForms] = useState<Record<string, { title: string; dueDate: string; priority: Priority; status: ItemStatus; progress: number }>>({});

  const allTasksByDate = useMemo(() => {
    const entries: Array<{ kind: "task" | "subtask"; projectName: string; parentTaskName?: string; title: string; dueDate: string; status: ItemStatus; priority: Priority; progress: number }> = [];
    projects.forEach((project) => {
      project.tasks.forEach((task) => {
        if (task.dueDate) {
          entries.push({
            kind: "task",
            projectName: project.name,
            title: task.title,
            dueDate: task.dueDate,
            status: task.status,
            priority: task.priority,
            progress: computeTaskProgress(task),
          });
        }
        task.subtasks.forEach((subtask) => {
          if (subtask.dueDate) {
            entries.push({
              kind: "subtask",
              projectName: project.name,
              parentTaskName: task.title,
              title: subtask.title,
              dueDate: subtask.dueDate,
              status: subtask.status,
              priority: subtask.priority,
              progress: subtask.progress,
            });
          }
        });
      });
    });
    return entries.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [projects]);

  const dateItems = useMemo(
    () =>
      allTasksByDate.filter((item) => {
        const parsed = parseISO(item.dueDate);
        return isSameDay(parsed, selectedDate);
      }),
    [allTasksByDate, selectedDate]
  );

  const kanbanColumns = useMemo(
    () =>
      statusOptions.map((status) => ({
        status,
        tasks: projects.flatMap((project) =>
          project.tasks
            .filter((task) => task.status === status)
            .map((task) => ({
              projectName: project.name,
              task,
            }))
        ),
      })),
    [projects]
  );

  const addProject = () => {
    if (!projectForm.name.trim()) return;

    const project: Project = {
      id: uid(),
      name: projectForm.name.trim(),
      scope,
      status: projectForm.status,
      dueDate: projectForm.dueDate || null,
      priority: projectForm.priority,
      progress: projectForm.progress,
      companyName: scope === "client" ? (projectForm.companyName.trim() || null) : null,
      offerName: projectForm.offerName.trim() || null,
      tasks: [],
    };

    setProjects((prev) => [project, ...prev]);
    setProjectForm({
      name: "",
      status: "a_faire",
      dueDate: "",
      priority: "moyenne",
      progress: 0,
      companyName: "",
      offerName: "",
    });
  };

  const addTask = (projectId: string) => {
    const form = taskForms[projectId];
    if (!form?.title.trim()) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const newTask: Task = {
          id: uid(),
          title: form.title.trim(),
          dueDate: form.dueDate || null,
          priority: form.priority,
          status: form.status,
          progress: form.progress,
          subtasks: [],
        };
        return { ...project, tasks: [...project.tasks, newTask] };
      })
    );

    setTaskForms((prev) => ({
      ...prev,
      [projectId]: { title: "", dueDate: "", priority: "moyenne", status: "a_faire", progress: 0 },
    }));
  };

  const addSubtask = (projectId: string, taskId: string) => {
    const form = subtaskForms[taskId];
    if (!form?.title.trim()) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          tasks: project.tasks.map((task) => {
            if (task.id !== taskId) return task;
            const subtask: Subtask = {
              id: uid(),
              title: form.title.trim(),
              dueDate: form.dueDate || null,
              priority: form.priority,
              status: form.status,
              progress: form.progress,
            };
            return { ...task, subtasks: [...task.subtasks, subtask] };
          }),
        };
      })
    );

    setSubtaskForms((prev) => ({
      ...prev,
      [taskId]: { title: "", dueDate: "", priority: "moyenne", status: "a_faire", progress: 0 },
    }));
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label>Nom du projet</Label>
              <Input value={projectForm.name} onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ex: Migration CRM" />
            </div>
            {scope === "client" ? (
              <div className="space-y-2">
                <Label>Entreprise liée</Label>
                <Input value={projectForm.companyName} onChange={(e) => setProjectForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Entreprise (optionnel)" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Offre liée</Label>
              <Input value={projectForm.offerName} onChange={(e) => setProjectForm((prev) => ({ ...prev, offerName: e.target.value }))} placeholder="Offre (optionnel)" />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={projectForm.status}
                onChange={(e) => setProjectForm((prev) => ({ ...prev, status: e.target.value as ItemStatus }))}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={projectForm.priority}
                onChange={(e) => setProjectForm((prev) => ({ ...prev, priority: e.target.value as Priority }))}
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabel[priority]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Date d&apos;échéance</Label>
              <Input type="date" value={projectForm.dueDate} onChange={(e) => setProjectForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Progression (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={projectForm.progress}
                onChange={(e) => setProjectForm((prev) => ({ ...prev, progress: Number(e.target.value || 0) }))}
              />
            </div>
          </div>
          <Button onClick={addProject}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter un projet
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="liste" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="tableau">Tableau</TabsTrigger>
          <TabsTrigger value="agenda">Par date</TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="space-y-4">
          {projects.map((project) => {
            const open = expandedProjects[project.id] ?? true;
            const projectProgress = computeProjectProgress(project);
            return (
              <Card key={project.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => setExpandedProjects((prev) => ({ ...prev, [project.id]: !open }))}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={cn("border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
                      <Badge className={cn("border", getPriorityTone(project.priority))}>{priorityLabel[project.priority]}</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {project.companyName ? `Entreprise: ${project.companyName} • ` : ""}
                    {project.offerName ? `Offre: ${project.offerName} • ` : ""}
                    {project.dueDate ? `Échéance: ${project.dueDate}` : "Pas d'échéance"}
                  </CardDescription>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progression projet</span>
                      <span>{projectProgress}%</span>
                    </div>
                    <Progress value={projectProgress} />
                  </div>
                </CardHeader>
                {open ? (
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
                      <Input
                        placeholder="Nouvelle tâche"
                        value={taskForms[project.id]?.title ?? ""}
                        onChange={(e) =>
                          setTaskForms((prev) => ({
                            ...prev,
                            [project.id]: {
                              title: e.target.value,
                              dueDate: prev[project.id]?.dueDate ?? "",
                              priority: prev[project.id]?.priority ?? "moyenne",
                              status: prev[project.id]?.status ?? "a_faire",
                              progress: prev[project.id]?.progress ?? 0,
                            },
                          }))
                        }
                      />
                      <Input
                        type="date"
                        value={taskForms[project.id]?.dueDate ?? ""}
                        onChange={(e) =>
                          setTaskForms((prev) => ({
                            ...prev,
                            [project.id]: {
                              title: prev[project.id]?.title ?? "",
                              dueDate: e.target.value,
                              priority: prev[project.id]?.priority ?? "moyenne",
                              status: prev[project.id]?.status ?? "a_faire",
                              progress: prev[project.id]?.progress ?? 0,
                            },
                          }))
                        }
                      />
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={taskForms[project.id]?.status ?? "a_faire"}
                        onChange={(e) =>
                          setTaskForms((prev) => ({
                            ...prev,
                            [project.id]: {
                              title: prev[project.id]?.title ?? "",
                              dueDate: prev[project.id]?.dueDate ?? "",
                              priority: prev[project.id]?.priority ?? "moyenne",
                              status: e.target.value as ItemStatus,
                              progress: prev[project.id]?.progress ?? 0,
                            },
                          }))
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel[status]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={taskForms[project.id]?.priority ?? "moyenne"}
                        onChange={(e) =>
                          setTaskForms((prev) => ({
                            ...prev,
                            [project.id]: {
                              title: prev[project.id]?.title ?? "",
                              dueDate: prev[project.id]?.dueDate ?? "",
                              priority: e.target.value as Priority,
                              status: prev[project.id]?.status ?? "a_faire",
                              progress: prev[project.id]?.progress ?? 0,
                            },
                          }))
                        }
                      >
                        {priorityOptions.map((priority) => (
                          <option key={priority} value={priority}>
                            {priorityLabel[priority]}
                          </option>
                        ))}
                      </select>
                      <Button onClick={() => addTask(project.id)}>Ajouter tâche</Button>
                    </div>

                    <div className="space-y-3">
                      {project.tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune tâche pour ce projet pour le moment.</p>
                      ) : null}
                      {project.tasks.map((task) => {
                        const taskOpen = expandedTasks[task.id] ?? true;
                        const taskProgress = computeTaskProgress(task);
                        return (
                          <div key={task.id} className="rounded-md border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                className="flex items-center gap-2 text-left"
                                onClick={() => setExpandedTasks((prev) => ({ ...prev, [task.id]: !taskOpen }))}
                              >
                                {taskOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                <p className="font-medium">{task.title}</p>
                              </button>
                              <div className="flex flex-wrap gap-2">
                                <Badge className={cn("border", getStatusTone(task.status))}>{statusLabel[task.status]}</Badge>
                                <Badge className={cn("border", getPriorityTone(task.priority))}>{priorityLabel[task.priority]}</Badge>
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.dueDate ? `Échéance: ${task.dueDate}` : "Pas d'échéance"}
                            </p>
                            <div className="mt-2 space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Progression tâche</span>
                                <span>{taskProgress}%</span>
                              </div>
                              <Progress value={taskProgress} />
                            </div>

                            {taskOpen ? (
                              <div className="mt-3 space-y-2">
                                <div className="grid gap-2 rounded-md bg-muted/20 p-2 md:grid-cols-5">
                                  <Input
                                    placeholder="Nouvelle sous-tâche"
                                    value={subtaskForms[task.id]?.title ?? ""}
                                    onChange={(e) =>
                                      setSubtaskForms((prev) => ({
                                        ...prev,
                                        [task.id]: {
                                          title: e.target.value,
                                          dueDate: prev[task.id]?.dueDate ?? "",
                                          priority: prev[task.id]?.priority ?? "moyenne",
                                          status: prev[task.id]?.status ?? "a_faire",
                                          progress: prev[task.id]?.progress ?? 0,
                                        },
                                      }))
                                    }
                                  />
                                  <Input
                                    type="date"
                                    value={subtaskForms[task.id]?.dueDate ?? ""}
                                    onChange={(e) =>
                                      setSubtaskForms((prev) => ({
                                        ...prev,
                                        [task.id]: {
                                          title: prev[task.id]?.title ?? "",
                                          dueDate: e.target.value,
                                          priority: prev[task.id]?.priority ?? "moyenne",
                                          status: prev[task.id]?.status ?? "a_faire",
                                          progress: prev[task.id]?.progress ?? 0,
                                        },
                                      }))
                                    }
                                  />
                                  <select
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    value={subtaskForms[task.id]?.status ?? "a_faire"}
                                    onChange={(e) =>
                                      setSubtaskForms((prev) => ({
                                        ...prev,
                                        [task.id]: {
                                          title: prev[task.id]?.title ?? "",
                                          dueDate: prev[task.id]?.dueDate ?? "",
                                          priority: prev[task.id]?.priority ?? "moyenne",
                                          status: e.target.value as ItemStatus,
                                          progress: prev[task.id]?.progress ?? 0,
                                        },
                                      }))
                                    }
                                  >
                                    {statusOptions.map((status) => (
                                      <option key={status} value={status}>
                                        {statusLabel[status]}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    value={subtaskForms[task.id]?.priority ?? "moyenne"}
                                    onChange={(e) =>
                                      setSubtaskForms((prev) => ({
                                        ...prev,
                                        [task.id]: {
                                          title: prev[task.id]?.title ?? "",
                                          dueDate: prev[task.id]?.dueDate ?? "",
                                          priority: e.target.value as Priority,
                                          status: prev[task.id]?.status ?? "a_faire",
                                          progress: prev[task.id]?.progress ?? 0,
                                        },
                                      }))
                                    }
                                  >
                                    {priorityOptions.map((priority) => (
                                      <option key={priority} value={priority}>
                                        {priorityLabel[priority]}
                                      </option>
                                    ))}
                                  </select>
                                  <Button variant="secondary" onClick={() => addSubtask(project.id, task.id)}>
                                    Ajouter sous-tâche
                                  </Button>
                                </div>
                                {task.subtasks.map((subtask) => (
                                  <div key={subtask.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm">
                                    <div>
                                      <p>{subtask.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {subtask.dueDate ? `Échéance: ${subtask.dueDate}` : "Sans échéance"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge className={cn("border", getStatusTone(subtask.status))}>{statusLabel[subtask.status]}</Badge>
                                      <Badge className={cn("border", getPriorityTone(subtask.priority))}>{priorityLabel[subtask.priority]}</Badge>
                                      <span className="text-xs text-muted-foreground">{subtask.progress}%</span>
                                    </div>
                                  </div>
                                ))}
                                {task.subtasks.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Cette tâche n&apos;a pas encore de sous-tâches.</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid gap-4 md:grid-cols-3">
            {kanbanColumns.map((column) => (
              <Card key={column.status}>
                <CardHeader>
                  <CardTitle className="text-base">{statusLabel[column.status]}</CardTitle>
                  <CardDescription>{column.tasks.length} tâche(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {column.tasks.map(({ projectName, task }) => (
                    <div key={task.id} className="rounded-md border p-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{projectName}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.subtasks.length} sous-tâche(s) • {task.dueDate ?? "Sans échéance"}
                      </p>
                    </div>
                  ))}
                  {column.tasks.length === 0 ? <p className="text-sm text-muted-foreground">Aucune tâche.</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tableau">
          <Card>
            <CardHeader>
              <CardTitle>Vue tableau</CardTitle>
              <CardDescription>Projet &gt; Tâches &gt; Sous-tâches avec statut, priorité et échéance.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Niveau</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Progression</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.flatMap((project) =>
                    project.tasks.flatMap((task) => [
                      <TableRow key={task.id}>
                        <TableCell>Tâche</TableCell>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>{statusLabel[task.status]}</TableCell>
                        <TableCell>{priorityLabel[task.priority]}</TableCell>
                        <TableCell>{task.dueDate ?? "-"}</TableCell>
                        <TableCell className="text-right">{computeTaskProgress(task)}%</TableCell>
                      </TableRow>,
                      ...task.subtasks.map((subtask) => (
                        <TableRow key={subtask.id}>
                          <TableCell>Sous-tâche</TableCell>
                          <TableCell className="pl-6">↳ {subtask.title}</TableCell>
                          <TableCell>{project.name}</TableCell>
                          <TableCell>{statusLabel[subtask.status]}</TableCell>
                          <TableCell>{priorityLabel[subtask.priority]}</TableCell>
                          <TableCell>{subtask.dueDate ?? "-"}</TableCell>
                          <TableCell className="text-right">{subtask.progress}%</TableCell>
                        </TableRow>
                      )),
                    ])
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Vue des tâches par date
              </CardTitle>
              <CardDescription>
                Naviguez entre les jours pour voir ce qui est à faire, en cours ou terminé.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSelectedDate((prev) => addDays(prev, -1))}>Jour précédent</Button>
                <Button variant="outline" onClick={() => setSelectedDate(new Date())}>Aujourd&apos;hui</Button>
                <Button variant="outline" onClick={() => setSelectedDate((prev) => addDays(prev, 1))}>Jour suivant</Button>
              </div>
              <p className="text-sm font-medium">
                {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
              </p>
              <div className="space-y-2">
                {dateItems.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.projectName}
                        {item.parentTaskName ? ` • Tâche: ${item.parentTaskName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.kind === "task" ? "Tâche" : "Sous-tâche"}</Badge>
                      <Badge className={cn("border", getStatusTone(item.status))}>{statusLabel[item.status]}</Badge>
                      <Badge className={cn("border", getPriorityTone(item.priority))}>{priorityLabel[item.priority]}</Badge>
                    </div>
                  </div>
                ))}
                {dateItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune tâche planifiée à cette date.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
