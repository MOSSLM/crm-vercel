"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarCheck2, CalendarDays, CheckCircle2, Columns2, EllipsisVertical, ListTodo, Plus, RectangleHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/utils/supabase/client";

type ProjectScope = "internal" | "client" | "all";
type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type ProjectRow = {
  id: string;
  nom: string;
  scope: "interne" | "entreprise";
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  background_color?: string | null;
  entreprise_id: number | null;
  offre_id: string | null;
  entreprises?: { id: number; name: string | null } | null;
  offres?: { id: string; nom: string } | null;
  computed_project_progress?: number | null;
  color?: string | null;
  total_tasks?: number;
  completed_tasks?: number;
  remaining_tasks?: number;
};

type ProjectQueryRow = Omit<ProjectRow, "entreprises" | "offres"> & {
  entreprises?: Array<{ id: number; name: string | null }>;
  offres?: Array<{ id: string; nom: string }>;
};

type Company = { id: number; name: string | null };
type Offer = { id: string; nom: string };
type TaskProgressRow = { project_id: string | null; status: ItemStatus | null };

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

type ProjectTasksWorkspaceProps = {
  title: string;
  description: string;
  scope: ProjectScope;
};

export function ProjectTasksWorkspace({ title, description, scope }: ProjectTasksWorkspaceProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [mobileLayout, setMobileLayout] = useState<"two" | "one">("two");
  const [menuOpenProjectId, setMenuOpenProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [editForm, setEditForm] = useState({ nom: "", status: "a_faire" as ItemStatus, priority: "moyenne" as Priority, dueDate: "", startAt: "", endAt: "", color: "#4f46e5", backgroundColor: "#eef2ff" });

  const currentScope: "entreprise" | "interne" = scope === "client" ? "entreprise" : "interne";

  const [projectForm, setProjectForm] = useState({
    nom: "",
    status: "a_faire" as ItemStatus,
    dueDate: "",
    priority: "moyenne" as Priority,
    entrepriseQuery: "",
    entrepriseId: "",
    offreQuery: "",
    offreId: "",
    color: "#4f46e5",
    backgroundColor: "#eef2ff",
    startAt: "",
    endAt: "",
  });


  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
      const [{ data: projectsData }, { data: progressData }, { data: companyData }, { data: offersData }, { data: tasksData }] = await Promise.all([
        (scope === "all"
          ? supabase
              .from("crm_projects")
              .select("id,nom,scope,status,priority,due_date,start_at,end_at,entreprise_id,offre_id,color,background_color,entreprises(id,name),offres(id,nom)")
              .order("created_at", { ascending: false })
          : supabase
              .from("crm_projects")
              .select("id,nom,scope,status,priority,due_date,start_at,end_at,entreprise_id,offre_id,color,background_color,entreprises(id,name),offres(id,nom)")
              .eq("scope", scope === "client" ? "entreprise" : "interne")
              .order("created_at", { ascending: false })),
        supabase.from("v_crm_project_progress").select("project_id,computed_project_progress"),
        supabase.from("entreprises").select("id,name").eq("qualifie", true).is("merged_into_id", null).order("name"),
        supabase
          .from("offres")
          .select("id,nom")
          .eq("visible_in_qualification", true)
          .eq("actif", true)
          .order("qualification_order", { ascending: true }),
        supabase.from("crm_tasks").select("project_id,status").not("project_id", "is", null),
      ]);

      const progressMap = new Map((progressData ?? []).map((row) => [row.project_id as string, Number(row.computed_project_progress ?? 0)]));
      const taskStats = new Map<string, { total: number; completed: number }>();
      for (const task of ((tasksData ?? []) as TaskProgressRow[])) {
        if (!task.project_id) continue;
        const previous = taskStats.get(task.project_id) ?? { total: 0, completed: 0 };
        const next = {
          total: previous.total + 1,
          completed: previous.completed + (task.status === "termine" ? 1 : 0),
        };
        taskStats.set(task.project_id, next);
      }

      const hydrated = ((projectsData ?? []) as ProjectQueryRow[]).map((project) => ({
        id: project.id,
        nom: project.nom,
        scope: project.scope,
        status: project.status,
        priority: project.priority,
        due_date: project.due_date,
        entreprise_id: project.entreprise_id,
        offre_id: project.offre_id,
        entreprises: project.entreprises?.[0] ?? null,
        offres: project.offres?.[0] ?? null,
        computed_project_progress: progressMap.get(project.id) ?? 0,
        color: project.color ?? "#4f46e5",
        background_color: project.background_color ?? "#eef2ff",
        start_at: project.start_at ?? null,
        end_at: project.end_at ?? null,
        total_tasks: taskStats.get(project.id)?.total ?? 0,
        completed_tasks: taskStats.get(project.id)?.completed ?? 0,
        remaining_tasks: Math.max((taskStats.get(project.id)?.total ?? 0) - (taskStats.get(project.id)?.completed ?? 0), 0),
      }));

      setProjects(hydrated);
      setCompanies((companyData as Company[] | null) ?? []);
      setOffers((offersData as Offer[] | null) ?? []);
      } catch (error) {
        console.error("Erreur lors du chargement des projets:", error);
        toast.error("Erreur lors du chargement des projets");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [scope]);

  const filteredCompanies = useMemo(() => {
    const q = projectForm.entrepriseQuery.trim().toLowerCase();
    if (!q) return companies.slice(0, 10);
    return companies.filter((company) => (company.name ?? "").toLowerCase().includes(q)).slice(0, 10);
  }, [companies, projectForm.entrepriseQuery]);

  const filteredOffers = useMemo(() => {
    const q = projectForm.offreQuery.trim().toLowerCase();
    if (!q) return offers.slice(0, 10);
    return offers.filter((offer) => offer.nom.toLowerCase().includes(q)).slice(0, 10);
  }, [offers, projectForm.offreQuery]);

  const visibleProjects = useMemo(() => {
    if (scope === "all") return projects;
    const expectedScope = scope === "client" ? "entreprise" : "interne";
    return projects.filter((project) => project.scope === expectedScope);
  }, [projects, scope]);

  const dueProjects = useMemo(() => visibleProjects.filter((project) => project.due_date), [visibleProjects]);

  const dateItems = useMemo(
    () =>
      dueProjects.filter((item) => {
        if (!item.due_date) return false;
        return isSameDay(parseISO(item.due_date), selectedDate);
      }),
    [dueProjects, selectedDate]
  );

  const kanbanColumns = useMemo(
    () =>
      statusOptions.map((status) => ({
        status,
        projects: visibleProjects.filter((project) => project.status === status),
      })),
    [visibleProjects]
  );

  const createProject = async () => {
    if (!projectForm.nom.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("crm_projects")
        .insert({
          nom: projectForm.nom.trim(),
          scope: currentScope,
          status: projectForm.status,
          priority: projectForm.priority,
          due_date: projectForm.dueDate || null,
          start_at: projectForm.startAt || null,
          end_at: projectForm.endAt || null,
          entreprise_id: projectForm.entrepriseId ? Number(projectForm.entrepriseId) : null,
          offre_id: projectForm.offreId || null,
          color: projectForm.color || "#4f46e5",
          background_color: projectForm.backgroundColor || "#eef2ff",
          progress: 0,
        })
        .select("id,nom,scope,status,priority,due_date,start_at,end_at,entreprise_id,offre_id,color,background_color,entreprises(id,name),offres(id,nom)")
        .single();

      if (error) throw error;

      if (data) {
        const inserted = data as ProjectQueryRow;
        setProjects((prev) => [{
          id: inserted.id,
          nom: inserted.nom,
          scope: inserted.scope,
          status: inserted.status,
          priority: inserted.priority,
          due_date: inserted.due_date,
          entreprise_id: inserted.entreprise_id,
          offre_id: inserted.offre_id,
          entreprises: inserted.entreprises?.[0] ?? null,
          offres: inserted.offres?.[0] ?? null,
          computed_project_progress: 0,
          color: inserted.color ?? "#4f46e5",
          background_color: inserted.background_color ?? "#eef2ff",
          start_at: inserted.start_at ?? null,
          end_at: inserted.end_at ?? null,
          total_tasks: 0,
          completed_tasks: 0,
          remaining_tasks: 0,
        }, ...prev]);
        setIsCreateOpen(false);
        setProjectForm({
          nom: "",
          status: "a_faire",
          dueDate: "",
          priority: "moyenne",
          entrepriseQuery: "",
          entrepriseId: "",
          offreQuery: "",
          offreId: "",
          color: "#4f46e5",
          backgroundColor: "#eef2ff",
          startAt: "",
          endAt: "",
        });
      }
    } catch (error) {
      console.error("Erreur lors de la création du projet:", error);
      toast.error("Erreur lors de la création du projet");
    } finally {
      setSaving(false);
    }
  };

  const startEditProject = (project: ProjectRow) => {
    setEditingProject(project);
    setEditForm({
      nom: project.nom,
      status: project.status,
      priority: project.priority,
      dueDate: project.due_date ?? "",
      startAt: project.start_at ? project.start_at.slice(0,16) : "",
      endAt: project.end_at ? project.end_at.slice(0,16) : "",
      color: project.color ?? "#4f46e5",
      backgroundColor: project.background_color ?? "#eef2ff",
    });
    setMenuOpenProjectId(null);
  };

  const saveProjectEdition = async () => {
    if (!editingProject) return;
    const payload = {
      nom: editForm.nom.trim(),
      status: editForm.status,
      priority: editForm.priority,
      due_date: editForm.dueDate || null,
      start_at: editForm.startAt || null,
      end_at: editForm.endAt || null,
      color: editForm.color,
      background_color: editForm.backgroundColor,
    };
    if (!payload.nom) return;
    const original = projects.find((p) => p.id === editingProject.id);
    setProjects((prev) => prev.map((project) => (project.id === editingProject.id ? { ...project, ...payload } : project)));
    setEditingProject(null);
    try {
      const { error } = await supabase.from("crm_projects").update(payload).eq("id", editingProject.id);
      if (error) throw error;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du projet:", error);
      toast.error("Erreur lors de la sauvegarde du projet");
      if (original) setProjects((prev) => prev.map((project) => (project.id === editingProject.id ? original : project)));
    }
  };

  const updateProjectStatus = async (projectId: string, status: ItemStatus) => {
    const original = projects.find((p) => p.id === projectId);
    setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, status } : project)));
    try {
      const { error } = await supabase.from("crm_projects").update({ status }).eq("id", projectId);
      if (error) throw error;
    } catch (error) {
      console.error("Erreur lors de la mise à jour du statut:", error);
      toast.error("Erreur lors de la mise à jour du statut");
      if (original) setProjects((prev) => prev.map((project) => (project.id === projectId ? original : project)));
    }
  };

  const ProgressCircle = ({ value, color }: { value: number; color?: string | null }) => {
    const safe = Math.max(0, Math.min(100, Math.round(value)));
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const dash = circumference - (safe / 100) * circumference;

    return (
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90 drop-shadow-sm">
          <circle cx="24" cy="24" r={radius} stroke="currentColor" strokeWidth="4.5" className="text-slate-200/80" fill="none" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            stroke={color ?? "#4f46e5"}
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
            className="transition-all"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center rounded-full text-[11px] font-semibold text-slate-800">{safe}%</span>
      </div>
    );
  };

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return "Sans échéance";
    return format(parseISO(dueDate), "d MMM yyyy", { locale: fr });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nouveau projet
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription>
              La progression est calculée automatiquement depuis les tâches et sous-tâches.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Nom du projet</Label>
              <Input value={projectForm.nom} onChange={(e) => setProjectForm((prev) => ({ ...prev, nom: e.target.value }))} placeholder="Ex: Migration CRM" />
            </div>

            {scope === "client" ? (
              <div className="space-y-2">
                <Label>Entreprise qualifiée</Label>
                <Input
                  value={projectForm.entrepriseQuery}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, entrepriseQuery: e.target.value, entrepriseId: "" }))}
                  placeholder="Rechercher une entreprise"
                />
                <div className="max-h-32 overflow-auto rounded-md border">
                  {filteredCompanies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => setProjectForm((prev) => ({ ...prev, entrepriseId: String(company.id), entrepriseQuery: company.name ?? "" }))}
                    >
                      {company.name ?? `Entreprise #${company.id}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Offre</Label>
              <Input
                value={projectForm.offreQuery}
                onChange={(e) => setProjectForm((prev) => ({ ...prev, offreQuery: e.target.value, offreId: "" }))}
                placeholder="Rechercher une offre"
              />
              <div className="max-h-32 overflow-auto rounded-md border">
                {filteredOffers.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setProjectForm((prev) => ({ ...prev, offreId: offer.id, offreQuery: offer.nom }))}
                  >
                    {offer.nom}
                  </button>
                ))}
              </div>
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
              <Label>Début (date + heure)</Label>
              <Input type="datetime-local" value={projectForm.startAt} onChange={(e) => setProjectForm((prev) => ({ ...prev, startAt: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fin (date + heure)</Label>
              <Input type="datetime-local" value={projectForm.endAt} onChange={(e) => setProjectForm((prev) => ({ ...prev, endAt: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Couleur SVG</Label>
              <Input type="color" value={projectForm.color} onChange={(e) => setProjectForm((prev) => ({ ...prev, color: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Couleur de fond</Label>
              <Input type="color" value={projectForm.backgroundColor} onChange={(e) => setProjectForm((prev) => ({ ...prev, backgroundColor: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createProject} disabled={saving}>{saving ? "Création..." : "Créer le projet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingProject)} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le projet</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Nom du projet</Label>
              <Input value={editForm.nom} onChange={(e) => setEditForm((prev) => ({ ...prev, nom: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as ItemStatus }))}>
                {statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={editForm.priority} onChange={(e) => setEditForm((prev) => ({ ...prev, priority: e.target.value as Priority }))}>
                {priorityOptions.map((priority) => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Date d&apos;échéance</Label>
              <Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Début (date + heure)</Label>
              <Input type="datetime-local" value={editForm.startAt} onChange={(e) => setEditForm((prev) => ({ ...prev, startAt: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fin (date + heure)</Label>
              <Input type="datetime-local" value={editForm.endAt} onChange={(e) => setEditForm((prev) => ({ ...prev, endAt: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Couleur SVG</Label>
              <Input type="color" value={editForm.color} onChange={(e) => setEditForm((prev) => ({ ...prev, color: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Couleur de fond</Label>
              <Input type="color" value={editForm.backgroundColor} onChange={(e) => setEditForm((prev) => ({ ...prev, backgroundColor: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveProjectEdition}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="cartes" className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <TabsList className="grid w-full grid-cols-4 md:w-auto">
            <TabsTrigger value="cartes">Cartes</TabsTrigger>
          <TabsTrigger value="kanban">Pipeline</TabsTrigger>
          <TabsTrigger value="tableau">Tableau</TabsTrigger>
          <TabsTrigger value="agenda">Par date</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 self-end md:self-auto">
            <span className="text-xs text-muted-foreground">Vue mobile</span>
            <Button
              variant={mobileLayout === "two" ? "default" : "outline"}
              size="icon"
              onClick={() => setMobileLayout("two")}
              aria-label="Afficher 2 cartes par ligne sur mobile"
              title="2 cartes par ligne (mobile)"
            >
              <Columns2 className="h-4 w-4" />
            </Button>
            <Button
              variant={mobileLayout === "one" ? "default" : "outline"}
              size="icon"
              onClick={() => setMobileLayout("one")}
              aria-label="Afficher 1 carte par ligne sur mobile"
              title="1 carte par ligne (mobile)"
            >
              <RectangleHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="cartes" className="space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : null}
          <div className={cn("grid gap-4", mobileLayout === "one" ? "grid-cols-1" : "grid-cols-2", "xl:grid-cols-4 md:grid-cols-3")}>
            {visibleProjects.map((project) => (
            <Card
              key={project.id}
              className="group relative cursor-pointer overflow-hidden border-white/40"
              onClick={() => router.push(`/production/projets/${project.id}`)}
              style={{
                backgroundColor: project.background_color ?? "#eef2ff",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='sw-gradient' x1='0' x2='1' y1='1' y2='0'%3E%3Cstop stop-color='${encodeURIComponent(project.color ?? "#4f46e5")}' stop-opacity='0.35' offset='0%25'/%3E%3Cstop stop-color='${encodeURIComponent(project.color ?? "#4f46e5")}' stop-opacity='0.18' offset='100%25'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill='url(%23sw-gradient)' d='M14,-21.5C18,-19.2,21.1,-15.1,24.2,-10.4C27.3,-5.7,30.4,-0.5,32.7,6.8C34.9,14.1,36.2,23.3,32.1,27.5C28,31.7,18.4,30.9,10.2,31.9C2.1,33,-4.7,36,-8.7,33.2C-12.7,30.4,-14,21.8,-17.1,16C-20.3,10.2,-25.4,7.3,-26,3.7C-26.6,0,-22.8,-4.3,-21.6,-11C-20.3,-17.7,-21.6,-26.7,-18.5,-29.4C-15.3,-32,-7.7,-28.3,-1.3,-26.2C5,-24.1,10,-23.7,14,-21.5Z' transform='translate(50 50)'/%3E%3C/svg%3E")`,
                backgroundSize: "180px 180px",
                backgroundPosition: "right -40px top -40px",
                backgroundRepeat: "no-repeat",
              }}
            >
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{project.nom}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.entreprises?.name ? `Entreprise: ${project.entreprises.name} • ` : ""}
                      {project.offres?.nom ? `Offre: ${project.offres.nom}` : "Projet interne"}
                    </p>
                  </div>
                  <div className="relative flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenProjectId((prev) => (prev === project.id ? null : project.id));
                      }}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                    {menuOpenProjectId === project.id ? (
                      <div className="absolute right-0 top-9 z-10 w-32 rounded-md border bg-background p-1 shadow">
                        <button
                          type="button"
                          className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditProject(project);
                          }}
                        >
                          Modifier
                        </button>
                      </div>
                    ) : null}
                    <Badge className={cn("border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
                    <Badge className={cn("border", getPriorityTone(project.priority))}>{priorityLabel[project.priority]}</Badge>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <CalendarCheck2 className="h-3.5 w-3.5" /> {formatDueDate(project.due_date)}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {project.completed_tasks ?? 0} tâche(s) complétée(s)
                    </p>
                    <p className="flex items-center gap-1.5">
                      <ListTodo className="h-3.5 w-3.5" /> {project.remaining_tasks ?? 0} restante(s)
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ProgressCircle value={project.computed_project_progress ?? 0} color={project.color} />
                    <p className="text-[11px] font-medium text-muted-foreground">Progression</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            ))}
          </div>
          {!loading && visibleProjects.length === 0 ? <p className="text-sm text-muted-foreground">Aucun projet.</p> : null}
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid gap-4 md:grid-cols-3">
            {kanbanColumns.map((column) => (
              <Card
                key={column.status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (!draggedProjectId) return;
                  await updateProjectStatus(draggedProjectId, column.status);
                  setDraggedProjectId(null);
                }}
              >
                <CardHeader>
                  <CardTitle className="text-base">{statusLabel[column.status]}</CardTitle>
                  <CardDescription>{column.projects.length} projet(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {column.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      draggable
                      onDragStart={() => setDraggedProjectId(project.id)}
                      onClick={() => router.push(`/production/projets/${project.id}`)}
                      className="block w-full rounded-md border p-3 text-left hover:bg-muted"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{project.nom}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge className={cn("border", getPriorityTone(project.priority))}>{priorityLabel[project.priority]}</Badge>
                            <Badge className={cn("border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <ProgressCircle value={project.computed_project_progress ?? 0} color={project.color} />
                          <span className="text-[11px] text-muted-foreground">Progression</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{formatDueDate(project.due_date)}</span>
                        <span>{project.completed_tasks ?? 0}/{project.total_tasks ?? 0} tâches</span>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tableau">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projet</TableHead>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Offre</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Progression</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProjects.map((project) => (
                    <TableRow key={project.id} className="cursor-pointer" onClick={() => router.push(`/production/projets/${project.id}`)}>
                      <TableCell className="font-medium">{project.nom}</TableCell>
                      <TableCell>{project.entreprises?.name ?? "-"}</TableCell>
                      <TableCell>{project.offres?.nom ?? "-"}</TableCell>
                      <TableCell>{statusLabel[project.status]}</TableCell>
                      <TableCell>{priorityLabel[project.priority]}</TableCell>
                      <TableCell>{project.due_date ?? "-"}</TableCell>
                      <TableCell className="flex justify-end"><ProgressCircle value={project.computed_project_progress ?? 0} color={project.color} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Échéances projets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSelectedDate((prev) => addDays(prev, -1))}>Jour précédent</Button>
                <Button variant="outline" onClick={() => setSelectedDate(new Date())}>Aujourd&apos;hui</Button>
                <Button variant="outline" onClick={() => setSelectedDate((prev) => addDays(prev, 1))}>Jour suivant</Button>
              </div>
              <p className="text-sm font-medium">{format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}</p>
              <div className="space-y-2">
                {dateItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => router.push(`/production/projets/${item.id}`)} className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted">
                    <div>
                      <p className="font-medium">{item.nom}</p>
                      <p className="text-xs text-muted-foreground">{item.entreprises?.name ?? "Projet interne"}</p>
                    </div>
                    <Badge className={cn("border", getStatusTone(item.status))}>{statusLabel[item.status]}</Badge>
                  </button>
                ))}
                {dateItems.length === 0 ? <p className="text-sm text-muted-foreground">Aucun projet à cette date.</p> : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
