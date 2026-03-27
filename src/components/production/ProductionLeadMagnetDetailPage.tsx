"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/utils/supabase/client";

type LeadMagnetStatus = "a_faire" | "en_cours" | "pret";

type LeadMagnetDetail = {
  id: string;
  nom: string | null;
  statut: LeadMagnetStatus;
  lien_livraison: string | null;
  notes: string | null;
  opportunites?: { id: string; name: string | null; priorite: string | null; entreprises?: { name: string | null }[] }[];
  production_templates?: { id: string; nom: string | null }[];
};

type Todo = {
  id: string;
  titre: string;
  description: string | null;
  is_done: boolean;
  position: number;
};

const statusLabels: Record<LeadMagnetStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  pret: "Prêt",
};

export function ProductionLeadMagnetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadMagnetId = params.id;

  const [detail, setDetail] = useState<LeadMagnetDetail | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lmRow }, { data: todoRows }] = await Promise.all([
      supabase
        .from("production_lead_magnets")
        .select("id,nom,statut,lien_livraison,notes,opportunites(id,name,priorite,entreprises(name)),production_templates(id,nom)")
        .eq("id", leadMagnetId)
        .single(),
      supabase
        .from("production_lead_magnet_todos")
        .select("id,titre,description,is_done,position")
        .eq("lead_magnet_id", leadMagnetId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    setDetail((lmRow ?? null) as LeadMagnetDetail | null);
    setTodos((todoRows ?? []) as Todo[]);
    setLoading(false);
  }, [leadMagnetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => {
    if (todos.length === 0) return 0;
    return Math.round((todos.filter((todo) => todo.is_done).length / todos.length) * 100);
  }, [todos]);

  const saveHeader = async (updates: Partial<LeadMagnetDetail>) => {
    await supabase.from("production_lead_magnets").update(updates).eq("id", leadMagnetId);
    setDetail((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const toggleTodo = async (todo: Todo, checked: boolean) => {
    await supabase.from("production_lead_magnet_todos").update({ is_done: checked }).eq("id", todo.id);
    setTodos((prev) => prev.map((entry) => (entry.id === todo.id ? { ...entry, is_done: checked } : entry)));
  };

  const updateTodo = async (todoId: string, updates: Partial<Todo>) => {
    await supabase.from("production_lead_magnet_todos").update(updates).eq("id", todoId);
    setTodos((prev) => prev.map((entry) => (entry.id === todoId ? { ...entry, ...updates } : entry)));
  };

  const addCustomTodo = async () => {
    if (!newTodoTitle.trim()) return;
    const { data } = await supabase
      .from("production_lead_magnet_todos")
      .insert({
        lead_magnet_id: leadMagnetId,
        titre: newTodoTitle.trim(),
        position: (todos.length + 1) * 100,
      })
      .select("id,titre,description,is_done,position")
      .single();

    if (data) {
      setTodos((prev) => [...prev, data as Todo]);
      setNewTodoTitle("");
    }
  };

  const deleteTodo = async (todoId: string) => {
    await supabase.from("production_lead_magnet_todos").delete().eq("id", todoId);
    setTodos((prev) => prev.filter((todo) => todo.id !== todoId));
  };

  if (loading) {
    return <div className="p-4 md:p-6 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!detail) {
    return (
      <div className="p-4 md:p-6 space-y-2">
        <p className="text-sm text-muted-foreground">Lead magnet introuvable.</p>
        <Button variant="outline" onClick={() => router.push("/production/lead-magnets")}>Retour</Button>
      </div>
    );
  }

  const opp = detail.opportunites?.[0];
  const template = detail.production_templates?.[0];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" onClick={() => router.push("/production/lead-magnets")}> 
        <ArrowLeft className="h-4 w-4 mr-2" /> Retour lead magnets
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{detail.nom || opp?.name || opp?.entreprises?.[0]?.name || "Production lead magnet"}</CardTitle>
          <CardDescription>Lié à l'opportunité {opp?.name || opp?.entreprises?.[0]?.name || opp?.id} • Template {template?.nom || template?.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nom interne</Label>
              <Input value={detail.nom || ""} onChange={(e) => setDetail((p) => (p ? { ...p, nom: e.target.value } : p))} onBlur={() => void saveHeader({ nom: detail.nom || null })} />
            </div>
            <div className="space-y-1">
              <Label>Statut</Label>
              <Select value={detail.statut} onValueChange={(value: LeadMagnetStatus) => {
                setDetail((p) => (p ? { ...p, statut: value } : p));
                void saveHeader({ statut: value });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_faire">À faire</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="pret">Prêt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Lien de livraison client</Label>
            <Input
              placeholder="https://..."
              value={detail.lien_livraison || ""}
              onChange={(e) => setDetail((p) => (p ? { ...p, lien_livraison: e.target.value } : p))}
              onBlur={() => void saveHeader({ lien_livraison: detail.lien_livraison || null })}
            />
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={detail.notes || ""}
              onChange={(e) => setDetail((p) => (p ? { ...p, notes: e.target.value } : p))}
              onBlur={() => void saveHeader({ notes: detail.notes || null })}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={detail.statut === "pret" ? "default" : "secondary"}>{statusLabels[detail.statut]}</Badge>
            <span>Progression checklist: {progress}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist de production</CardTitle>
          <CardDescription>Checklist auto-générée depuis le template, éditable pour cette opportunité.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-[1fr,auto] gap-2">
            <Input placeholder="Ajouter une todo personnalisée" value={newTodoTitle} onChange={(e) => setNewTodoTitle(e.target.value)} />
            <Button onClick={addCustomTodo}><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
          </div>

          <div className="space-y-2">
            {todos.map((todo) => (
              <div key={todo.id} className="grid md:grid-cols-[auto,1fr,1fr,auto] gap-2 items-center border rounded-md p-2">
                <Checkbox checked={todo.is_done} onCheckedChange={(checked) => void toggleTodo(todo, !!checked)} />
                <Input value={todo.titre} onChange={(e) => updateTodo(todo.id, { titre: e.target.value })} />
                <Input
                  placeholder="Description"
                  value={todo.description ?? ""}
                  onChange={(e) => updateTodo(todo.id, { description: e.target.value || null })}
                />
                <Button variant="ghost" size="icon" onClick={() => deleteTodo(todo.id)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
