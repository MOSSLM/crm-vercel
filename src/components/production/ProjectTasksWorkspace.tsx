"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/utils/supabase/client";

type ProjectScope = "internal" | "client";
type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type ProjectRow = {
  id: string;
  nom: string;
  scope: "interne" | "entreprise";
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  entreprise_id: number | null;
  offre_id: string | null;
  entreprises?: { id: number; name: string | null } | null;
  offres?: { id: string; nom: string } | null;
  computed_project_progress?: number | null;
};

type ProjectQueryRow = Omit<ProjectRow, "entreprises" | "offres"> & {
  entreprises?: Array<{ id: number; name: string | null }>;
  offres?: Array<{ id: string; nom: string }>;
};

type Company = { id: number; name: string | null };
type Offer = { id: string; nom: string };

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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

  const [projectForm, setProjectForm] = useState({
    nom: "",
    status: "a_faire" as ItemStatus,
    dueDate: "",
    priority: "moyenne" as Priority,
    entrepriseQuery: "",
    entrepriseId: "",
    offreQuery: "",
    offreId: "",
  });

  const currentScope = scope === "client" ? "entreprise" : "interne";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: projectsData }, { data: progressData }, { data: companyData }, { data: offersData }] = await Promise.all([
        supabase
          .from("crm_projects")
          .select("id,nom,scope,status,priority,due_date,entreprise_id,offre_id,entreprises(id,name),offres(id,nom)")
          .eq("scope", currentScope)
          .order("created_at", { ascending: false }),
        supabase.from("v_crm_project_progress").select("project_id,computed_project_progress"),
        supabase.from("entreprises").select("id,name").eq("qualifie", true).is("merged_into_id", null).order("name"),
        supabase
          .from("offres")
          .select("id,nom")
          .eq("visible_in_qualification", true)
          .eq("actif", true)
          .order("qualification_order", { ascending: true }),
      ]);

      const progressMap = new Map((progressData ?? []).map((row) => [row.project_id as string, Number(row.computed_project_progress ?? 0)]));
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
      }));

      setProjects(hydrated);
      setCompanies((companyData as Company[] | null) ?? []);
      setOffers((offersData as Offer[] | null) ?? []);
      setLoading(false);
    };

    void load();
  }, [currentScope]);

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

  const dueProjects = useMemo(() => projects.filter((project) => project.due_date), [projects]);

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
        projects: projects.filter((project) => project.status === status),
      })),
    [projects]
  );

  const createProject = async () => {
    if (!projectForm.nom.trim()) return;

    const { data } = await supabase
      .from("crm_projects")
      .insert({
        nom: projectForm.nom.trim(),
        scope: currentScope,
        status: projectForm.status,
        priority: projectForm.priority,
        due_date: projectForm.dueDate || null,
        entreprise_id: projectForm.entrepriseId ? Number(projectForm.entrepriseId) : null,
        offre_id: projectForm.offreId || null,
        progress: 0,
      })
      .select("id,nom,scope,status,priority,due_date,entreprise_id,offre_id,entreprises(id,name),offres(id,nom)")
      .single();

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
      });
    }
  };

  const updateProjectStatus = async (projectId: string, status: ItemStatus) => {
    await supabase.from("crm_projects").update({ status }).eq("id", projectId);
    setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, status } : project)));
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau projet
          </Button>
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
          </div>
          <DialogFooter>
            <Button onClick={createProject}>Créer le projet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="liste" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="kanban">Pipeline</TabsTrigger>
          <TabsTrigger value="tableau">Tableau</TabsTrigger>
          <TabsTrigger value="agenda">Par date</TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : null}
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer"
              onClick={() => router.push(`/production/projets/${project.id}`)}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{project.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {project.entreprises?.name ? `Entreprise: ${project.entreprises.name} • ` : ""}
                      {project.offres?.nom ? `Offre: ${project.offres.nom} • ` : ""}
                      {project.due_date ? `Échéance: ${project.due_date}` : "Pas d'échéance"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("border", getStatusTone(project.status))}>{statusLabel[project.status]}</Badge>
                    <Badge className={cn("border", getPriorityTone(project.priority))}>{priorityLabel[project.priority]}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progression projet</span>
                    <span>{Math.round(project.computed_project_progress ?? 0)}%</span>
                  </div>
                  <Progress value={project.computed_project_progress ?? 0} />
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && projects.length === 0 ? <p className="text-sm text-muted-foreground">Aucun projet.</p> : null}
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
                      <p className="font-medium">{project.nom}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(project.computed_project_progress ?? 0)}% • {project.due_date ?? "Sans échéance"}</p>
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
                  {projects.map((project) => (
                    <TableRow key={project.id} className="cursor-pointer" onClick={() => router.push(`/production/projets/${project.id}`)}>
                      <TableCell className="font-medium">{project.nom}</TableCell>
                      <TableCell>{project.entreprises?.name ?? "-"}</TableCell>
                      <TableCell>{project.offres?.nom ?? "-"}</TableCell>
                      <TableCell>{statusLabel[project.status]}</TableCell>
                      <TableCell>{priorityLabel[project.priority]}</TableCell>
                      <TableCell>{project.due_date ?? "-"}</TableCell>
                      <TableCell className="text-right">{Math.round(project.computed_project_progress ?? 0)}%</TableCell>
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
