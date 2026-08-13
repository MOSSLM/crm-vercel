"use client";

import { Phone, MessageCircle, Linkedin, Building2, Layers, Eye, AlertTriangle, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { one } from "@/components/agent-portal/format";
import { bucketTasks, BUCKET_LABEL, type DemarchageBucketKey } from "@/lib/agent-portal/demarchage-buckets";
import type { DemarchageQueueMeta, DemarchageTask } from "./types";

const KIND_ICON: Record<string, LucideIcon> = {
  call: Phone,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
};

const BUCKET_ORDER: DemarchageBucketKey[] = ["missed", "hot", "overdue", "today", "tomorrow", "week", "later"];

/** Durée d'engagement, lisible d'un coup d'œil dans la file. */
function formatDuree(sec: number): string {
  if (sec >= 60) return `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, "0")}`;
  return `${Math.round(sec)}s`;
}

/** « aujourd'hui » / « hier » / « il y a 3 j » à partir d'une date ISO. */
function jourRelatif(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  const jours = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d.getTime()) / 86400000,
  );
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} j`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function DemarchageFrise({
  tasks,
  meta,
  loading,
  selectedId,
  onSelect,
}: {
  tasks: DemarchageTask[];
  meta: DemarchageQueueMeta;
  loading: boolean;
  selectedId: string | null;
  onSelect: (task: DemarchageTask) => void;
}) {
  const buckets = bucketTasks(tasks);
  const pct = meta.due_today > 0 ? Math.round((meta.done_today / meta.due_today) * 100) : 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Aujourd&apos;hui</span>
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{meta.done_today}</span> sur {meta.due_today}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {loading && <div className="px-1 text-sm text-muted-foreground">Chargement…</div>}

      {!loading && tasks.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            File vide 🎉
            <br />
            Aucune entreprise en séquence à traiter.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {BUCKET_ORDER.map((key) => {
          const items = buckets[key];
          if (items.length === 0) return null;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {BUCKET_LABEL[key]}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal">
                  {items.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((task) => {
                  const contact = one(task.contact);
                  const ent = one(task.entreprise);
                  const Icon = KIND_ICON[task.kind] ?? Phone;
                  const name = contact
                    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || ent?.name
                    : ent?.name;
                  const selected = task.id === selectedId;
                  // « Chaud » = les signaux mesurés justifient un appel
                  // aujourd'hui. La file reste triée par le serveur ; ici on
                  // ne fait que le rendre visible sans avoir à cliquer.
                  const hot = task.intent?.callWhen === "maintenant" || task.intent?.callWhen === "aujourdhui";
                  // Distinct du simple « chaud » : ici l'occasion se perd.
                  const missed = task.intent?.missed === true;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelect(task)}
                      className={
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (selected
                          ? "border-primary bg-primary/5"
                          : missed
                            ? "border-red-300 bg-red-50 hover:bg-red-100"
                            : hot
                              ? "border-orange-300 bg-orange-50 hover:bg-orange-100"
                              : "border-transparent bg-muted/40 hover:bg-muted")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary"
                          style={{ background: "var(--accent-tint)" }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {name || "Prospect"}
                          {task.intent?.flame ? (
                            <span className="ml-1 tracking-tighter" title={task.intent.reasons.join(" · ")}>
                              {task.intent.flame}
                            </span>
                          ) : null}
                        </span>
                        {task.due_at && (
                          <span className="shrink-0 text-xs text-muted-foreground">{formatTime(task.due_at)}</span>
                        )}
                      </div>
                      {ent?.name && contact && (
                        <div className="mt-0.5 flex items-center gap-1 truncate pl-8 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {ent.name}
                        </div>
                      )}
                      {task.sequence && (
                        <div className="mt-0.5 flex items-center gap-1 pl-8 text-xs text-muted-foreground">
                          <Layers className="h-3 w-3 shrink-0" />
                          {task.sequence.name ?? "Séquence"}
                          {task.sequence.stepIndex != null &&
                            ` · étape ${task.sequence.stepIndex}/${task.sequence.totalSteps}`}
                        </div>
                      )}
                      {/* La démo a-t-elle été ouverte ? C'est l'information qui
                          décide s'il faut appeler maintenant ou laisser la
                          séquence faire son travail — elle doit être lisible
                          sans ouvrir la fiche. */}
                      {task.intent && task.intent.sessions > 0 && (
                        <div
                          className={
                            "mt-0.5 flex items-center gap-1 pl-8 text-xs " +
                            (missed ? "font-medium text-red-700" : hot ? "text-orange-700" : "text-muted-foreground")
                          }
                        >
                          <Eye className="h-3 w-3 shrink-0" />
                          Démo vue {task.intent.sessions}×
                          {task.intent.engagementSec > 0 && ` · ${formatDuree(task.intent.engagementSec)}`}
                          {task.intent.pageViews > 0 && ` · ${task.intent.pageViews} p.`}
                          {task.intent.lastDay && ` · ${jourRelatif(task.intent.lastDay)}`}
                        </div>
                      )}
                      {missed && task.intent?.daysSinceVisit != null && (
                        <div className="mt-0.5 flex items-center gap-1 pl-8 text-xs font-medium text-red-700">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Chaud depuis {task.intent.daysSinceVisit} j, jamais rappelé
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
