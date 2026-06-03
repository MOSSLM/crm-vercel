"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MessageCircle,
  Mail,
  Linkedin,
  Building2,
  CalendarCheck,
  ThumbsUp,
  Clock,
  X,
} from "lucide-react";
import { one } from "@/components/agent-portal/format";

type Stage = { id: number; nom: string; ordre: number };
type Contact = { first_name: string | null; last_name: string | null; tel: string | null; email: string | null };
type Entreprise = { id: number; name: string | null; ville: string | null; telephone: string | null };
type Task = {
  id: string;
  kind: string | null;
  status: string;
  title: string | null;
  due_at: string | null;
  opportunite_id: string | null;
  contact: Contact | Contact[] | null;
  entreprise: Entreprise | Entreprise[] | null;
};

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  linkedin: Linkedin,
};

export default function AgentDemarchagePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [tasksRes, pipeRes] = await Promise.all([
          authedFetch("/api/agent/tasks"),
          authedFetch("/api/agent/pipeline"),
        ]);
        if (tasksRes.ok) {
          const all = (await tasksRes.json()) as Task[];
          setTasks(all.filter((t) => t.status === "pending"));
        }
        if (pipeRes.ok) {
          const data = await pipeRes.json();
          setStages((data.stages ?? []) as Stage[]);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const stageId = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const s of stages) map[s.nom] = s.id;
    return map;
  }, [stages]);

  const resolve = async (
    task: Task,
    status: string,
    stageName: string | null,
    label: string,
  ) => {
    setBusy(task.id);
    const targetStage = stageName ? stageId[stageName] : undefined;
    try {
      const res = await authedFetch("/api/agent/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          status,
          opportunite_id: task.opportunite_id ?? undefined,
          stage_id: targetStage,
        }),
      });
      if (!res.ok) throw new Error();
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      toast.success(label);
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Démarchage</h1>
        <p className="text-sm text-muted-foreground">
          Ta file du jour. Traite un prospect, puis enregistre l&apos;issue de l&apos;échange.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && tasks.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            File vide 🎉 — aucune tâche de démarchage en attente.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {tasks.map((task) => {
          const contact = one(task.contact);
          const ent = one(task.entreprise);
          const Icon = (task.kind && KIND_ICON[task.kind]) || Phone;
          const contactName = contact
            ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
            : "";
          const disabled = busy === task.id;
          return (
            <Card key={task.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-md text-primary"
                        style={{ background: "var(--accent-tint)" }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {contactName || task.title || "Prospect"}
                    </div>
                    {ent && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {ent.id ? (
                          <Link
                            href={`/espace-agent/entreprises/${ent.id}`}
                            className="hover:underline"
                          >
                            {ent.name}
                          </Link>
                        ) : (
                          ent.name
                        )}
                        {ent.ville ? ` · ${ent.ville}` : ""}
                        {contact?.tel ? ` · ${contact.tel}` : ent.telephone ? ` · ${ent.telephone}` : ""}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => resolve(task, "done", "RDV calé", "RDV calé !")}
                  >
                    <CalendarCheck className="mr-1 h-4 w-4" /> RDV calé
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => resolve(task, "done", "Intéressé", "Marqué intéressé.")}
                  >
                    <ThumbsUp className="mr-1 h-4 w-4" /> Intéressé
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => resolve(task, "snoozed", null, "À rappeler plus tard.")}
                  >
                    <Clock className="mr-1 h-4 w-4" /> À rappeler
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    className="text-destructive"
                    onClick={() => resolve(task, "done", "Perdu", "Marqué perdu.")}
                  >
                    <X className="mr-1 h-4 w-4" /> Pas intéressé
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
