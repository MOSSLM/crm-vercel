"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Zap,
  GitBranch,
  Mail,
  Star,
  CheckCircle,
  Phone,
  FileText,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import type { CrmWorkflow, WorkflowAction, WorkflowTriggerType, WorkflowActionType } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

// ─── Metadata maps ────────────────────────────────────────────────────────────

const TRIGGER_META: Record<
  WorkflowTriggerType,
  {
    label: string;
    description: string;
    Icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  stage_changed: {
    label: "Étape changée",
    description:
      "Se déclenche quand une opportunité change d’étape dans le pipeline",
    Icon: GitBranch,
    color: "text-blue-500",
  },
  email_sent: {
    label: "Email envoyé",
    description: "Se déclenche quand un email est envoyé à un prospect",
    Icon: Mail,
    color: "text-purple-500",
  },
  opportunite_created: {
    label: "Opportunité créée",
    description: "Se déclenche à la création d’une nouvelle opportunité",
    Icon: Star,
    color: "text-green-500",
  },
  offre_accepted: {
    label: "Offre acceptée",
    description: "Se déclenche quand une offre passe en statut Acceptée",
    Icon: CheckCircle,
    color: "text-orange-500",
  },
};

const ACTION_META: Record<
  WorkflowActionType,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  create_task: { label: "Créer une tâche", Icon: Phone },
  add_note: { label: "Ajouter une note", Icon: FileText },
  send_email: { label: "Envoyer un email", Icon: Mail },
  update_field: { label: "Mettre à jour un champ", Icon: Zap },
};

function makeDefaultAction(type: WorkflowActionType): WorkflowAction {
  const base = { type, delay_days: 0 };
  switch (type) {
    case "create_task":
      return { ...base, params: { titre: "Nouvelle tâche", type: "relance", description: "" } };
    case "add_note":
      return { ...base, params: { content: "" } };
    case "send_email":
      return { ...base, params: { subject: "", body: "" } };
    case "update_field":
      return { ...base, params: { field: "", value: "" } };
  }
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await createClient().auth.getSession();
  return session?.access_token ?? null;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Selected = { kind: "trigger" } | { kind: "action"; index: number };

export function WorkflowEditor({ workflowId }: { workflowId?: string }) {
  const router = useRouter();
  const isNew = !workflowId;

  const [name, setName] = useState("Nouveau workflow");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("stage_changed");
  const [triggerConditions, setTriggerConditions] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [active, setActive] = useState(true);

  const [selected, setSelected] = useState<Selected>({ kind: "trigger" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [addingAction, setAddingAction] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await authedFetch(`/api/workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const wf: CrmWorkflow = await res.json();
        setName(wf.name);
        setDescription(wf.description ?? "");
        setTriggerType(wf.trigger_type);
        setTriggerConditions(wf.trigger_conditions ?? {});
        setActions(wf.actions ?? []);
        setActive(wf.active);
      } else {
        toast.error("Workflow introuvable");
        router.push("/workflows");
      }
      setLoading(false);
    })();
  }, [workflowId]);

  const save = async () => {
    const token = await getToken();
    if (!token) return;
    setSaving(true);
    try {
      const body = { name, description: description || null, trigger_type: triggerType, trigger_conditions: triggerConditions, actions, active };
      const res = isNew
        ? await authedFetch("/api/workflows", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await authedFetch(`/api/workflows/${workflowId}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (res.ok) {
        toast.success(isNew ? "Workflow créé" : "Workflow sauvegardé");
        if (isNew) {
          const created: CrmWorkflow = await res.json();
          router.replace(`/workflows/${created.id}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Erreur lors de la sauvegarde");
      }
    } finally {
      setSaving(false);
    }
  };

  const addAction = (type: WorkflowActionType) => {
    const newAction = makeDefaultAction(type);
    const newIndex = actions.length;
    setActions((prev) => [...prev, newAction]);
    setSelected({ kind: "action", index: newIndex });
    setAddingAction(false);
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
    setSelected({ kind: "trigger" });
  };

  const updateAction = (index: number, patch: Partial<WorkflowAction>) => {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const updateActionParam = (index: number, key: string, value: string) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, params: { ...a.params, [key]: value } } : a)),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedAction =
    selected.kind === "action" ? actions[selected.index] : null;

  return (
    <div className="px-3 py-4 md:p-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/workflows">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-sm font-medium border-none shadow-none focus-visible:ring-0 px-1 max-w-xs"
          placeholder="Nom du workflow"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Split layout */}
      <div className="grid md:grid-cols-[1fr_300px] gap-4 items-start">
        {/* Left: flow canvas */}
        <div className="space-y-0">
          {/* Trigger block */}
          <FlowBlock
            label="Déclencheur"
            title={TRIGGER_META[triggerType].label}
            Icon={TRIGGER_META[triggerType].Icon}
            iconColor={TRIGGER_META[triggerType].color}
            isSelected={selected.kind === "trigger"}
            onClick={() => setSelected({ kind: "trigger" })}
          />

          {/* Action blocks */}
          {actions.map((action, i) => {
            const meta = ACTION_META[action.type];
            const subtitle =
              action.type === "create_task"
                ? action.params.titre
                : action.type === "add_note"
                  ? action.params.content?.slice(0, 40)
                  : undefined;
            return (
              <div key={i}>
                <Connector />
                <FlowBlock
                  label={`Action ${i + 1}`}
                  title={meta.label}
                  subtitle={subtitle}
                  delay={action.delay_days}
                  Icon={meta.Icon}
                  iconColor="text-foreground"
                  isSelected={selected.kind === "action" && selected.index === i}
                  onClick={() => setSelected({ kind: "action", index: i })}
                />
              </div>
            );
          })}

          {/* Add action */}
          <Connector />
          {addingAction ? (
            <div className="rounded-xl border bg-background shadow-sm p-2 space-y-1">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-xs font-medium text-muted-foreground">Choisir une action</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setAddingAction(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {(Object.entries(ACTION_META) as [WorkflowActionType, (typeof ACTION_META)[WorkflowActionType]][]).map(
                ([type, { label, Icon }]) => (
                  <button
                    key={type}
                    onClick={() => addAction(type)}
                    className="flex items-center gap-2.5 w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                  </button>
                ),
              )}
            </div>
          ) : (
            <button
              onClick={() => setAddingAction(true)}
              className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-dashed py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter une action
            </button>
          )}
        </div>

        {/* Right: config panel */}
        <div className="rounded-xl border bg-background p-4 space-y-4 sticky top-4">
          {selected.kind === "trigger" ? (
            <TriggerConfig
              triggerType={triggerType}
              conditions={triggerConditions}
              onTypeChange={(t) => { setTriggerType(t); setTriggerConditions({}); }}
              onConditionsChange={setTriggerConditions}
            />
          ) : selectedAction ? (
            <ActionConfig
              action={selectedAction}
              onUpdate={(patch) => updateAction(selected.index, patch)}
              onUpdateParam={(k, v) => updateActionParam(selected.index, k, v)}
              onDelete={() => removeAction(selected.index)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FlowBlock({
  label,
  title,
  subtitle,
  delay,
  Icon,
  iconColor,
  isSelected,
  onClick,
}: {
  label: string;
  title: string;
  subtitle?: string;
  delay?: number;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3.5 transition-all ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-background shadow-sm"
          : "border-border bg-background hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
            {delay !== undefined && delay > 0 && (
              <span className="ml-1.5 text-primary">J+{delay}</span>
            )}
          </p>
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </button>
  );
}

function Connector() {
  return (
    <div className="flex justify-start pl-[22px] py-0.5">
      <div className="w-px h-5 bg-border" />
    </div>
  );
}

function TriggerConfig({
  triggerType,
  conditions,
  onTypeChange,
  onConditionsChange,
}: {
  triggerType: WorkflowTriggerType;
  conditions: Record<string, string>;
  onTypeChange: (t: WorkflowTriggerType) => void;
  onConditionsChange: (c: Record<string, string>) => void;
}) {
  const meta = TRIGGER_META[triggerType];
  const Icon = meta.Icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
          <Icon className={`h-4 w-4 ${meta.color}`} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Déclencheur
          </p>
          <p className="text-sm font-semibold">{meta.label}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Type de déclencheur</Label>
        <Select
          value={triggerType}
          onValueChange={(v) => onTypeChange(v as WorkflowTriggerType)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(TRIGGER_META) as [WorkflowTriggerType, typeof TRIGGER_META[WorkflowTriggerType]][]).map(
              ([type, { label }]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      {triggerType === "stage_changed" && (
        <div className="space-y-2">
          <Label className="text-xs">Étape cible (optionnel)</Label>
          <Input
            className="h-8 text-sm"
            placeholder="Ex : Signé, PDF Envoyé…"
            value={conditions.to_stage_name ?? ""}
            onChange={(e) =>
              onConditionsChange({ ...conditions, to_stage_name: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Laisser vide pour tout changement d’étape
          </p>
        </div>
      )}

      {triggerType === "email_sent" && (
        <div className="space-y-2">
          <Label className="text-xs">Type d’email (optionnel)</Label>
          <Select
            value={conditions.email_type ?? ""}
            onValueChange={(v) =>
              onConditionsChange({ ...conditions, email_type: v === "_all" ? "" : v })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Tous les emails" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tous les emails</SelectItem>
              <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
              <SelectItem value="relance">Relance</SelectItem>
              <SelectItem value="premier_contact">Premier contact</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function ActionConfig({
  action,
  onUpdate,
  onUpdateParam,
  onDelete,
}: {
  action: WorkflowAction;
  onUpdate: (patch: Partial<WorkflowAction>) => void;
  onUpdateParam: (key: string, value: string) => void;
  onDelete: () => void;
}) {
  const meta = ACTION_META[action.type];
  const Icon = meta.Icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Action</p>
          <p className="text-sm font-semibold">{meta.label}</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Type d’action</Label>
        <Select
          value={action.type}
          onValueChange={(v) =>
            onUpdate({ type: v as WorkflowActionType, params: makeDefaultAction(v as WorkflowActionType).params })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(ACTION_META) as [WorkflowActionType, typeof ACTION_META[WorkflowActionType]][]).map(
              ([type, { label }]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Délai (jours)</Label>
        <Input
          type="number"
          min={0}
          max={365}
          className="h-8 text-sm"
          value={action.delay_days ?? 0}
          onChange={(e) => onUpdate({ delay_days: parseInt(e.target.value) || 0 })}
        />
        <p className="text-xs text-muted-foreground">
          0 = immédiatement · 3 = 3 jours après le déclencheur
        </p>
      </div>

      <Separator />

      {action.type === "create_task" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Titre</Label>
            <Input
              className="h-8 text-sm"
              value={action.params.titre ?? ""}
              onChange={(e) => onUpdateParam("titre", e.target.value)}
              placeholder="Ex : Appel de relance"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Type de tâche</Label>
            <Select
              value={action.params.type ?? "relance"}
              onValueChange={(v) => onUpdateParam("type", v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relance">Relance</SelectItem>
                <SelectItem value="appel">Appel</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="rdv">RDV</SelectItem>
                <SelectItem value="autre">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              className="text-sm resize-none"
              rows={3}
              value={action.params.description ?? ""}
              onChange={(e) => onUpdateParam("description", e.target.value)}
              placeholder="Instructions pour cette tâche…"
            />
          </div>
        </div>
      )}

      {action.type === "add_note" && (
        <div className="space-y-2">
          <Label className="text-xs">Contenu de la note</Label>
          <Textarea
            className="text-sm resize-none"
            rows={4}
            value={action.params.content ?? ""}
            onChange={(e) => onUpdateParam("content", e.target.value)}
            placeholder="Texte de la note automatique…"
          />
        </div>
      )}

      {action.type === "send_email" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Sujet</Label>
            <Input
              className="h-8 text-sm"
              value={action.params.subject ?? ""}
              onChange={(e) => onUpdateParam("subject", e.target.value)}
              placeholder="Sujet de l’email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Corps</Label>
            <Textarea
              className="text-sm resize-none"
              rows={4}
              value={action.params.body ?? ""}
              onChange={(e) => onUpdateParam("body", e.target.value)}
              placeholder="Contenu de l’email…"
            />
          </div>
        </div>
      )}

      {action.type === "update_field" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Champ</Label>
            <Input
              className="h-8 text-sm"
              value={action.params.field ?? ""}
              onChange={(e) => onUpdateParam("field", e.target.value)}
              placeholder="Ex : priorite"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Valeur</Label>
            <Input
              className="h-8 text-sm"
              value={action.params.value ?? ""}
              onChange={(e) => onUpdateParam("value", e.target.value)}
              placeholder="Nouvelle valeur"
            />
          </div>
        </div>
      )}

      <Separator />

      <Button
        variant="outline"
        size="sm"
        className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Supprimer cette action
      </Button>
    </div>
  );
}
