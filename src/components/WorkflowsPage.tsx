"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus,
  Zap,
  Mail,
  GitBranch,
  Star,
  CheckCircle,
  Pencil,
  Trash2,
  Phone,
  FileText,
} from "lucide-react";
import type { CrmWorkflow } from "@/types";

const TRIGGER_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  stage_changed: {
    label: "Étape changée",
    Icon: GitBranch,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
  email_sent: {
    label: "Email envoyé",
    Icon: Mail,
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
  },
  opportunite_created: {
    label: "Opportunité créée",
    Icon: Star,
    color: "bg-green-500/10 text-green-600 border-green-200",
  },
  offre_accepted: {
    label: "Offre acceptée",
    Icon: CheckCircle,
    color: "bg-orange-500/10 text-orange-600 border-orange-200",
  },
};

const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  create_task: Phone,
  add_note: FileText,
  send_email: Mail,
  update_field: Zap,
};

const ACTION_LABEL: Record<string, string> = {
  create_task: "Tâche",
  add_note: "Note",
  send_email: "Email",
  update_field: "Champ",
};

async function getToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<CrmWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/workflows", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setWorkflows(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleActive = async (wf: CrmWorkflow) => {
    const token = await getToken();
    if (!token) return;
    const next = !wf.active;
    setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? { ...w, active: next } : w)));
    const res = await fetch(`/api/workflows/${wf.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? wf : w)));
      toast.error("Impossible de modifier le workflow");
    } else {
      toast.success(next ? "Workflow activé" : "Workflow désactivé");
    }
  };

  const deleteWorkflow = async (id: string) => {
    const token = await getToken();
    if (!token) return;
    if (!window.confirm("Supprimer ce workflow ?")) return;
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    const res = await fetch(`/api/workflows/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("Impossible de supprimer le workflow");
      void load();
    } else {
      toast.success("Workflow supprimé");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 px-3 py-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg md:text-xl font-semibold">Automatisation</h1>
          <p className="text-sm text-muted-foreground">
            Automatisez vos actions CRM en fonction d’événements
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/workflows/new">
            <Plus className="h-4 w-4 mr-1" />
            Nouveau
          </Link>
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucun workflow</p>
          <p className="text-sm text-muted-foreground mt-1">
            Créez votre premier workflow pour automatiser vos relances
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/workflows/new">
              <Plus className="h-4 w-4 mr-1" /> Créer un workflow
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => {
            const meta = TRIGGER_META[wf.trigger_type];
            return (
              <Card
                key={wf.id}
                className={`transition-opacity ${wf.active ? "" : "opacity-55"}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{wf.name}</CardTitle>
                      {wf.description && (
                        <CardDescription className="text-xs mt-0.5 line-clamp-2">
                          {wf.description}
                        </CardDescription>
                      )}
                    </div>
                    <Switch
                      checked={wf.active}
                      onCheckedChange={() => void toggleActive(wf)}
                      className="shrink-0"
                    />
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Trigger badge */}
                  {meta && (
                    <Badge variant="outline" className={`text-xs gap-1.5 ${meta.color}`}>
                      <meta.Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  )}

                  {/* Actions chips */}
                  <div className="flex flex-wrap gap-1">
                    {wf.actions.map((action, i) => {
                      const Icon = ACTION_ICON[action.type] ?? Zap;
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-md px-2 py-0.5"
                        >
                          <Icon className="h-3 w-3" />
                          {ACTION_LABEL[action.type] ?? action.type}
                          {(action.delay_days ?? 0) > 0 && (
                            <span className="text-muted-foreground/60">J+{action.delay_days}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Card footer */}
                  <div className="flex items-center justify-end gap-1 pt-1 border-t">
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/workflows/${wf.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => void deleteWorkflow(wf.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
