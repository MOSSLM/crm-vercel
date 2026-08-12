"use client";

import { useEffect, useState } from "react";
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
  BookOpen,
  CalendarCheck,
  ThumbsUp,
  Clock,
  X,
} from "lucide-react";
import { one } from "@/components/agent-portal/format";
import type { StageRole } from "@/lib/opportunites/stage-roles";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const tasksRes = await authedFetch("/api/agent/tasks");
        if (tasksRes.ok) {
          const all = (await tasksRes.json()) as Task[];
          setTasks(all.filter((t) => t.status === "pending"));
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  /**
   * L'issue de l'appel est envoyée comme INTENTION (`outcome`), pas comme
   * `stage_id`.
   *
   * L'ancienne version résolvait l'étape côté client en cherchant le libellé
   * (« RDV calé », « Intéressé », « Perdu ») dans les étapes renvoyées par
   * /api/agent/pipeline. Ces noms n'existant que dans « Agent SAMA », l'id
   * trouvé était toujours une étape d'Agent SAMA : l'appliquer à une affaire
   * vivant dans « Streak Mars/Avril » déclenchait
   * `trg_sync_opportunity_pipeline_from_stage` et aspirait l'affaire dans le
   * pipeline agent au premier clic. Le serveur résout maintenant l'étape dans le
   * pipeline de l'affaire concernée.
   */
  const resolve = async (
    task: Task,
    status: string,
    outcome: StageRole | null,
    label: string,
  ) => {
    setBusy(task.id);
    try {
      const res = await authedFetch("/api/agent/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          status,
          opportunite_id: task.opportunite_id ?? undefined,
          outcome: outcome ?? undefined,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Démarchage</h1>
          <p className="text-sm text-muted-foreground">
            Ta file du jour. Traite un prospect, puis enregistre l&apos;issue de l&apos;échange.
          </p>
        </div>
        {/* Le discours est à un clic de la file d'appels — c'est le seul endroit
            où on le rouvre vraiment. */}
        <Button asChild variant="outline" size="sm">
          <Link href="/espace-agent/argumentaire">
            <BookOpen className="mr-1 h-4 w-4" /> Brief commercial
          </Link>
        </Button>
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
                    onClick={() => resolve(task, "done", "rdv", "RDV calé !")}
                  >
                    <CalendarCheck className="mr-1 h-4 w-4" /> RDV calé
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => resolve(task, "done", "interesse", "Marqué intéressé.")}
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
                    onClick={() => resolve(task, "done", "perdu", "Marqué perdu.")}
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
