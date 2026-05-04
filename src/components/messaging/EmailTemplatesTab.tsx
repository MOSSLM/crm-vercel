"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Search, Pencil, Copy, Trash2, Lock, Loader2,
  Mail, ChevronDown, X, Sparkles, Tag, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { authedFetch } from "@/utils/authedFetch";

// ── Types ────────────────────────────────────────────────────────────────────

export type TemplateType =
  | "premier_contact"
  | "relance"
  | "lead_magnet"
  | "suivi"
  | "presentation"
  | "autre";

export interface EmailTemplate {
  id:         string;
  user_id:    string | null;
  name:       string;
  type:       TemplateType;
  subject:    string;
  body:       string;
  is_default: boolean;
  created_at: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<TemplateType, { label: string; className: string; dot: string }> = {
  premier_contact: {
    label: "Premier contact",
    className: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  relance: {
    label: "Relance",
    className: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  lead_magnet: {
    label: "Lead Magnet",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  suivi: {
    label: "Suivi",
    className: "bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  presentation: {
    label: "Présentation",
    className: "bg-rose-500/10 text-rose-700 border-rose-200 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  autre: {
    label: "Autre",
    className: "bg-gray-500/10 text-gray-600 border-gray-200 dark:text-gray-400",
    dot: "bg-gray-400",
  },
};

const TYPE_FILTERS: Array<{ key: TemplateType | "all"; label: string }> = [
  { key: "all",            label: "Tous" },
  { key: "premier_contact",label: "Premier contact" },
  { key: "relance",        label: "Relance" },
  { key: "lead_magnet",    label: "Lead Magnet" },
  { key: "suivi",          label: "Suivi" },
  { key: "presentation",   label: "Présentation" },
  { key: "autre",          label: "Autre" },
];

const VARIABLES = ["{{company_name}}", "{{contact_name}}", "{{lead_magnet_url}}"];

const BLANK_FORM = { name: "", type: "premier_contact" as TemplateType, subject: "", body: "" };

// ── Helper ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: TemplateType }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.autre;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial:   typeof BLANK_FORM | null;
  onSave:    (data: typeof BLANK_FORM) => Promise<void>;
  onClose:   () => void;
  saving:    boolean;
  viewOnly?: boolean;
}

function TemplateModal({ initial, onSave, onClose, saving, viewOnly }: ModalProps) {
  const [form, setForm] = useState(initial ?? BLANK_FORM);
  const isEdit = !!initial?.name;

  const set = (field: keyof typeof BLANK_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (!viewOnly) setForm((p) => ({ ...p, [field]: e.target.value }));
    };

  const insertVar = (v: string) => {
    if (!viewOnly) setForm((p) => ({ ...p, body: p.body + v }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">
              {viewOnly ? "Aperçu du template" : (isEdit ? "Modifier le template" : "Nouveau template")}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Read-only notice */}
        {viewOnly && (
          <div className="flex items-center gap-2 border-b bg-amber-50 px-6 py-2.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <Lock className="h-3 w-3 shrink-0" />
            Modèle par défaut — lecture seule. Utilisez &ldquo;Dupliquer&rdquo; pour créer une version personnalisable.
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-6">
            {/* Name + Type row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nom du template</Label>
                <Input
                  value={form.name}
                  onChange={set("name")}
                  readOnly={viewOnly}
                  placeholder="Ex. Premier contact B2B"
                  className={`h-9 text-sm ${viewOnly ? "bg-muted cursor-default" : ""}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Type</Label>
                <div className="relative">
                  <select
                    value={form.type}
                    onChange={set("type")}
                    disabled={viewOnly}
                    className={`h-9 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring ${viewOnly ? "bg-muted cursor-default" : ""}`}
                  >
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Objet</Label>
              <Input
                value={form.subject}
                onChange={set("subject")}
                readOnly={viewOnly}
                placeholder="Ex. Développer la visibilité de {{company_name}}"
                className={`h-9 text-sm ${viewOnly ? "bg-muted cursor-default" : ""}`}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Corps du message</Label>
                {!viewOnly && (
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Variables :</span>
                    {VARIABLES.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVar(v)}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                value={form.body}
                onChange={set("body")}
                readOnly={viewOnly}
                placeholder="Bonjour {{contact_name}},&#10;&#10;…"
                rows={12}
                className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground ${viewOnly ? "bg-muted cursor-default" : ""}`}
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          {viewOnly ? (
            <Button onClick={onClose}>Fermer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
              <Button
                onClick={() => onSave(form)}
                disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
                className="gap-2"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEdit ? "Enregistrer" : "Créer le template"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

interface CardProps {
  template:    EmailTemplate;
  onView:      () => void;
  onEdit:      () => void;
  onDuplicate: () => void;
  onDelete:    () => void;
}

function TemplateCard({ template, onView, onEdit, onDuplicate, onDelete }: CardProps) {
  const preview = template.body.slice(0, 120).replace(/\n/g, " ");

  return (
    <div className="group relative flex flex-col rounded-xl border bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden">
      {/* Top colored bar */}
      <div className={`h-1 w-full ${TYPE_CONFIG[template.type]?.dot ?? "bg-gray-400"}`} />

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <TypeBadge type={template.type} />
          {template.is_default && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="h-2.5 w-2.5" />
              Modèle par défaut
            </span>
          )}
        </div>

        {/* Name */}
        <div>
          <h3 className="font-semibold text-sm leading-tight">{template.name}</h3>
          {template.subject && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              📧 {template.subject}
            </p>
          )}
        </div>

        {/* Body preview */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
          {preview}{template.body.length > 120 ? "…" : ""}
        </p>

        <Separator />

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {template.is_default ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={onView}
            >
              <Eye className="h-3 w-3" />
              Voir
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3" />
              Modifier
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={onDuplicate}
          >
            <Copy className="h-3 w-3" />
            Dupliquer
          </Button>
          {!template.is_default && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Supprimer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal state type ──────────────────────────────────────────────────────────

type ModalState = "create" | { template: EmailTemplate; viewOnly: boolean } | null;

// ── Main component ────────────────────────────────────────────────────────────

export function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<TemplateType | "all">("all");
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<ModalState>(null);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/email/templates");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Impossible de charger les templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: typeof BLANK_FORM) => {
    setSaving(true);
    try {
      if (modal === "create") {
        const res = await authedFetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Création échouée");
        toast.success("Template créé !");
      } else if (modal && modal !== "create" && !modal.viewOnly) {
        const res = await authedFetch(`/api/email/templates/${modal.template.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Mise à jour échouée");
        toast.success("Template mis à jour !");
      }
      setModal(null);
      await load();
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (t: EmailTemplate) => {
    try {
      const res = await authedFetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:    `${t.name} (copie)`,
          type:    t.type,
          subject: t.subject,
          body:    t.body,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Template dupliqué !");
      await load();
    } catch {
      toast.error("Erreur lors de la duplication");
    }
  };

  const handleDelete = async (t: EmailTemplate) => {
    if (!confirm(`Supprimer le template « ${t.name} » ?`)) return;
    try {
      const res = await authedFetch(`/api/email/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Template supprimé");
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const filtered = templates.filter((t) => {
    const matchType   = filter === "all" || t.type === filter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const defaultCount = filtered.filter((t) => t.is_default).length;
  const customCount  = filtered.filter((t) => !t.is_default).length;

  const modalTemplate = modal && modal !== "create" ? modal.template : null;
  const modalViewOnly = modal && modal !== "create" ? modal.viewOnly : false;
  const modalInitial  = modalTemplate
    ? { name: modalTemplate.name, type: modalTemplate.type, subject: modalTemplate.subject, body: modalTemplate.body }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top toolbar ── */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4 gap-4">
        <div>
          <h2 className="text-sm font-semibold">Templates d&apos;email</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {templates.filter((t) => !t.is_default).length} template{templates.filter((t) => !t.is_default).length !== 1 ? "s" : ""} personnalisé{templates.filter((t) => !t.is_default).length !== 1 ? "s" : ""}
            {" · "}3 modèles par défaut
          </p>
        </div>
        <Button onClick={() => setModal("create")} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nouveau template
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        {/* Search */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 pl-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Type filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as TemplateType | "all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-8 w-8 opacity-20" />
            <p className="text-sm">Aucun template trouvé</p>
            {search && <p className="text-xs">Essayez un autre terme de recherche</p>}
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Default templates section */}
            {defaultCount > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Modèles par défaut
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{defaultCount}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered
                    .filter((t) => t.is_default)
                    .map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onView={() => setModal({ template: t, viewOnly: true })}
                        onEdit={() => setModal({ template: t, viewOnly: false })}
                        onDuplicate={() => handleDuplicate(t)}
                        onDelete={() => handleDelete(t)}
                      />
                    ))}
                </div>
              </section>
            )}

            {/* Custom templates section */}
            {customCount > 0 && (
              <section className="space-y-3">
                {defaultCount > 0 && <Separator />}
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Mes templates
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{customCount}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered
                    .filter((t) => !t.is_default)
                    .map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onView={() => setModal({ template: t, viewOnly: true })}
                        onEdit={() => setModal({ template: t, viewOnly: false })}
                        onDuplicate={() => handleDuplicate(t)}
                        onDelete={() => handleDelete(t)}
                      />
                    ))}
                </div>
              </section>
            )}
          </div>
        )}
      </ScrollArea>

      {/* ── Modal ── */}
      {modal !== null && (
        <TemplateModal
          initial={modalInitial}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          viewOnly={modalViewOnly}
        />
      )}
    </div>
  );
}
