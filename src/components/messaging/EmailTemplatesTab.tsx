"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Search, Pencil, Copy, Trash2, Lock, Loader2, Mail, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import "../../components/automations/automations-skin.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TemplateType =
  | "premier_contact"
  | "relance"
  | "lead_magnet"
  | "suivi"
  | "presentation"
  | "autre";

export interface EmailTemplate {
  id: string;
  user_id: string | null;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<TemplateType, { label: string; pill: string; dotColor: string }> = {
  premier_contact: { label: "Premier contact", pill: "info",   dotColor: "var(--info)" },
  relance:         { label: "Relance",          pill: "warn",   dotColor: "var(--warn)" },
  lead_magnet:     { label: "Lead Magnet",      pill: "ok",     dotColor: "var(--ok)" },
  suivi:           { label: "Suivi",            pill: "magic",  dotColor: "var(--magic)" },
  presentation:    { label: "Présentation",     pill: "danger", dotColor: "var(--danger)" },
  autre:           { label: "Autre",            pill: "",       dotColor: "var(--text-3)" },
};

const TYPE_FILTERS: Array<{ key: TemplateType | "all"; label: string }> = [
  { key: "all",             label: "Tous" },
  { key: "premier_contact", label: "Prem. contact" },
  { key: "relance",         label: "Relance" },
  { key: "lead_magnet",     label: "Lead Magnet" },
  { key: "suivi",           label: "Suivi" },
  { key: "presentation",    label: "Présentation" },
  { key: "autre",           label: "Autre" },
];

const VARIABLES = [
  { key: "{{company_name}}",   label: "{{company}}" },
  { key: "{{contact_name}}",   label: "{{contact}}" },
  { key: "{{lead_magnet_url}}", label: "{{lm_url}}" },
];

const PREVIEW_VARS: Record<string, string> = {
  "{{company_name}}":    "ACME Corp",
  "{{contact_name}}":   "Jean Dupont",
  "{{lead_magnet_url}}": "https://sama.fr/audit/demo",
};

const BLANK_FORM = {
  name: "",
  type: "premier_contact" as TemplateType,
  subject: "",
  body: "",
};

type FormData = typeof BLANK_FORM;
type EditorState =
  | { mode: "idle" }
  | { mode: "new" }
  | { mode: "edit"; template: EmailTemplate }
  | { mode: "view"; template: EmailTemplate };

// ── Helpers ───────────────────────────────────────────────────────────────────

function interpolatePreview(text: string): string {
  return text.replace(/\{\{(\w+(?:_\w+)*)\}\}/g, (m) => PREVIEW_VARS[m] ?? m);
}

// ── TypePill ─────────────────────────────────────────────────────────────────

function TypePill({ type }: { type: TemplateType }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.autre;
  return (
    <span className={`pill${cfg.pill ? ` ${cfg.pill}` : ""}`} style={{ fontSize: 10.5 }}>
      {cfg.label}
    </span>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────────

interface SideProps {
  templates: EmailTemplate[];
  loading: boolean;
  selected: EmailTemplate | null;
  filter: TemplateType | "all";
  search: string;
  onFilter: (f: TemplateType | "all") => void;
  onSearch: (v: string) => void;
  onSelect: (t: EmailTemplate) => void;
  onNew: () => void;
}

function TemplateSide({
  templates, loading, selected, filter, search,
  onFilter, onSearch, onSelect, onNew,
}: SideProps) {
  const counts = { all: templates.length } as Record<string, number>;
  for (const t of templates) counts[t.type] = (counts[t.type] ?? 0) + 1;

  const filtered = templates.filter((t) => {
    const matchType   = filter === "all" || t.type === filter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="msg-side">
      {/* Header */}
      <div className="pros-side-hd">
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 20, letterSpacing: "-.01em", margin: "0 0 6px" }}>
          Templates
        </h2>
        <div className="subline" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          <b style={{ color: "var(--text)" }}>{templates.filter((t) => !t.is_default).length}</b> perso
          &nbsp;·&nbsp;
          <b style={{ color: "var(--text)" }}>{templates.filter((t) => t.is_default).length}</b> défaut
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <Search
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              width: 13, height: 13, color: "var(--text-3)",
            }}
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              width: "100%", height: 28,
              paddingLeft: 28, paddingRight: search ? 28 : 8,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12, color: "var(--text)", outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                color: "var(--text-3)", display: "flex", alignItems: "center",
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="pros-side-tabs" style={{ flexWrap: "wrap" }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="pros-side-tab"
            aria-selected={filter === f.key}
            onClick={() => onFilter(f.key as TemplateType | "all")}
          >
            {f.label}
            <span className="num">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="pros-list">
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 32, color: "var(--text-3)", fontSize: 13 }}>
            <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
            Chargement…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-3)" }}>
            <Mail style={{ width: 28, height: 28, margin: "0 auto 10px", opacity: .2 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)" }}>Aucun template</div>
          </div>
        )}
        {!loading && filtered.map((t) => {
          const cfg = TYPE_CONFIG[t.type] ?? TYPE_CONFIG.autre;
          return (
            <div
              key={t.id}
              className="pros-task-row"
              aria-selected={selected?.id === t.id}
              onClick={() => onSelect(t)}
              style={{ gridTemplateColumns: "auto 1fr auto" }}
            >
              {/* Dot */}
              <span
                className="kind-chip"
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: `color-mix(in srgb, ${cfg.dotColor} 12%, transparent)`,
                  color: cfg.dotColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Mail style={{ width: 11, height: 11 }} />
              </span>

              <div style={{ minWidth: 0 }}>
                <div className="name" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {t.name}
                  {t.is_default && (
                    <Lock style={{ width: 9, height: 9, color: "var(--text-4)", flexShrink: 0 }} />
                  )}
                </div>
                <div className="sub">{t.subject || "—"}</div>
              </div>

              <TypePill type={t.type} />
            </div>
          );
        })}
      </div>

      {/* New button */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button className="btn ok" type="button" onClick={onNew} style={{ width: "100%", justifyContent: "center" }}>
          <Plus style={{ width: 13, height: 13 }} />
          Nouveau template
        </button>
      </div>
    </div>
  );
}

// ── Center panel ──────────────────────────────────────────────────────────────

interface EditorPanelProps {
  state: EditorState;
  form: FormData;
  saving: boolean;
  onChange: (f: Partial<FormData>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function EditorPanel({ state, form, saving, onChange, onSave, onCancel, onDuplicate, onDelete }: EditorPanelProps) {
  if (state.mode === "idle") {
    return (
      <div className="msg-main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text-3)" }}>
          <Mail style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: .15 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>
            Sélectionnez un template
          </div>
          <div style={{ fontSize: 12 }}>ou créez-en un nouveau</div>
        </div>
      </div>
    );
  }

  const isView = state.mode === "view";
  const isNew  = state.mode === "new";
  const isEdit = state.mode === "edit";
  const template = (state.mode === "edit" || state.mode === "view") ? state.template : null;

  const insertVar = (v: string) => {
    if (!isView) onChange({ body: form.body + v });
  };

  return (
    <div className="msg-main">
      <div className="msg-main-inner">
        <div className="pros-card">

          {/* Card header */}
          <div className="pros-card-hd" style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h2 className="name" style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400, margin: 0 }}>
                  {isNew ? "Nouveau template" : form.name || "Sans titre"}
                </h2>
                {isView && (
                  <span className="pill warn" style={{ fontSize: 10 }}>
                    <Lock style={{ width: 9, height: 9 }} />
                    Lecture seule
                  </span>
                )}
              </div>
              {!isNew && template && (
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  Créé le {new Date(template.created_at).toLocaleDateString("fr-FR")}
                </div>
              )}
            </div>
            {/* Actions header */}
            <div style={{ display: "flex", gap: 6 }}>
              {template && (
                <button className="btn ghost sm icon" type="button" title="Dupliquer" onClick={onDuplicate}>
                  <Copy style={{ width: 13, height: 13 }} />
                </button>
              )}
              {!isView && template && (
                <button className="btn ghost sm icon" type="button" title="Supprimer" onClick={onDelete}
                  style={{ color: "var(--danger)" }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          </div>

          {/* Read-only notice */}
          {isView && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 20px",
              background: "var(--warn-tint)",
              borderBottom: "1px solid var(--border)",
              fontSize: 12, color: "var(--warn)",
            }}>
              <Lock style={{ width: 12, height: 12, flexShrink: 0 }} />
              Modèle par défaut — lecture seule. Utilisez &ldquo;Dupliquer&rdquo; pour personnaliser.
            </div>
          )}

          {/* Name + Type */}
          <div className="pros-section">
            <h3>
              <Sparkles style={{ width: 12, height: 12 }} />
              Informations
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
                  Nom du template
                </label>
                <input
                  value={form.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  readOnly={isView}
                  placeholder="Ex. Premier contact B2B"
                  style={{
                    width: "100%", height: 32,
                    padding: "0 10px",
                    background: isView ? "var(--bg-2)" : "var(--surface)",
                    border: "1px solid var(--border-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12.5, color: "var(--text)", outline: "none",
                    cursor: isView ? "default" : "text",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
                  Type
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value={form.type}
                    onChange={(e) => onChange({ type: e.target.value as TemplateType })}
                    disabled={isView}
                    style={{
                      width: "100%", height: 32,
                      padding: "0 10px",
                      background: isView ? "var(--bg-2)" : "var(--surface)",
                      border: "1px solid var(--border-2)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 12.5, color: "var(--text)", outline: "none",
                      appearance: "none",
                      cursor: isView ? "default" : "pointer",
                    }}
                  >
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div className="pros-section">
            <h3>
              <Mail style={{ width: 12, height: 12 }} />
              Objet de l&apos;email
            </h3>
            <input
              value={form.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              readOnly={isView}
              placeholder="Ex. Développer la visibilité de {{company_name}}"
              style={{
                width: "100%", height: 32,
                padding: "0 10px",
                background: isView ? "var(--bg-2)" : "var(--surface)",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12.5, color: "var(--text)", outline: "none",
                cursor: isView ? "default" : "text",
              }}
            />
          </div>

          {/* Body */}
          <div className="pros-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", display: "flex", alignItems: "center", gap: 6 }}>
                <Pencil style={{ width: 12, height: 12 }} />
                Corps du message
              </h3>
              {!isView && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>Variables :</span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      style={{
                        background: "var(--accent-tint)",
                        color: "var(--accent-2)",
                        border: "none",
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              value={form.body}
              onChange={(e) => onChange({ body: e.target.value })}
              readOnly={isView}
              placeholder={"Bonjour {{contact_name}},\n\n…"}
              rows={12}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: isView ? "var(--bg-2)" : "var(--surface)",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13, color: "var(--text)",
                lineHeight: 1.6,
                resize: "vertical",
                outline: "none",
                cursor: isView ? "default" : "text",
                fontFamily: "var(--font-ui)",
              }}
            />
          </div>

          {/* CTA bar */}
          <div className="pros-cta-bar">
            <button className="btn outline" type="button" onClick={onCancel} style={{ flex: "0 0 auto" }}>
              {isNew || isEdit ? "Annuler" : "Fermer"}
            </button>
            <div style={{ flex: 1 }} />
            {(isNew || isEdit) && (
              <button
                className="btn ok"
                type="button"
                onClick={onSave}
                disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
              >
                {saving && <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />}
                {isNew ? "Créer le template" : "Enregistrer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right panel (preview) ─────────────────────────────────────────────────────

interface PreviewPanelProps {
  form: FormData;
  template: EmailTemplate | null;
}

function PreviewPanel({ form, template }: PreviewPanelProps) {
  const subject = interpolatePreview(form.subject || template?.subject || "");
  const body    = interpolatePreview(form.body    || template?.body    || "");

  return (
    <div className="msg-aside">
      {/* Header */}
      <div className="pros-aside" style={{ height: "100%", overflowY: "auto", borderLeft: "none" }}>
        <div className="blk">
          <h4>Aperçu</h4>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            Variables remplacées par des valeurs d&apos;exemple.
          </div>
        </div>

        {(subject || body) ? (
          <>
            {/* Subject preview */}
            {subject && (
              <div className="blk">
                <h4>Objet</h4>
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    padding: "8px 10px",
                    fontSize: 12.5,
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {subject}
                </div>
              </div>
            )}

            {/* Body preview */}
            {body && (
              <div className="blk">
                <h4>Corps</h4>
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    overflow: "hidden",
                  }}
                >
                  {/* Fake email header */}
                  <div style={{
                    background: "#0B1D3A",
                    padding: "10px 14px",
                  }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 11, letterSpacing: ".3em", color: "rgba(181,208,240,0.7)", textTransform: "uppercase" }}>
                      SAMA
                    </div>
                    <div style={{ fontSize: 8, letterSpacing: ".15em", textTransform: "uppercase", color: "#3A7BD5", fontWeight: "bold", marginTop: 2 }}>
                      Agence Digitale
                    </div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: "14px 14px 10px", background: "#F4F1EB" }}>
                    {body.split(/\n{2,}/).map((para, i) => (
                      <p key={i} style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.65, color: "rgba(11,29,58,0.8)" }}>
                        {para.split("\n").map((line, j, arr) => (
                          <React.Fragment key={j}>
                            {line}
                            {j < arr.length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </p>
                    ))}
                  </div>
                  {/* Fake footer */}
                  <div style={{ background: "#0B1D3A", padding: "8px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(181,208,240,0.3)" }}>SAMA · Agence Digitale</div>
                  </div>
                </div>
              </div>
            )}

            {/* Meta */}
            <div className="blk">
              <h4>Variables d&apos;exemple</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(PREVIEW_VARS).map(([key, val]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <code style={{ background: "var(--accent-tint)", color: "var(--accent-2)", padding: "1px 5px", borderRadius: 3, fontSize: 10, fontFamily: "var(--font-mono)" }}>
                      {key}
                    </code>
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-3)" }}>
            <div style={{ fontSize: 12 }}>Sélectionnez un template pour voir l&apos;aperçu.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<TemplateType | "all">("all");
  const [search, setSearch]       = useState("");
  const [editor, setEditor]       = useState<EditorState>({ mode: "idle" });
  const [form, setForm]           = useState<FormData>(BLANK_FORM);
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

  // Patch form
  const patchForm = (f: Partial<FormData>) => setForm((p) => ({ ...p, ...f }));

  // Select template
  const handleSelect = (t: EmailTemplate) => {
    if (t.is_default) {
      setEditor({ mode: "view", template: t });
    } else {
      setEditor({ mode: "edit", template: t });
    }
    setForm({ name: t.name, type: t.type, subject: t.subject, body: t.body });
  };

  // New
  const handleNew = () => {
    setEditor({ mode: "new" });
    setForm(BLANK_FORM);
  };

  // Cancel
  const handleCancel = () => {
    setEditor({ mode: "idle" });
    setForm(BLANK_FORM);
  };

  // Save
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editor.mode === "new") {
        const res = await authedFetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Création échouée");
        toast.success("Template créé !");
      } else if (editor.mode === "edit") {
        const res = await authedFetch(`/api/email/templates/${editor.template.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Mise à jour échouée");
        toast.success("Template mis à jour !");
      }
      await load();
      setEditor({ mode: "idle" });
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  // Duplicate
  const handleDuplicate = async () => {
    const t = editor.mode === "edit" || editor.mode === "view" ? editor.template : null;
    const src = t ?? { name: form.name, type: form.type, subject: form.subject, body: form.body };
    try {
      const res = await authedFetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...src, name: `${src.name} (copie)` }),
      });
      if (!res.ok) throw new Error();
      toast.success("Template dupliqué !");
      await load();
    } catch {
      toast.error("Erreur lors de la duplication");
    }
  };

  // Delete
  const handleDelete = async () => {
    if (editor.mode !== "edit") return;
    if (!confirm(`Supprimer le template « ${editor.template.name} » ?`)) return;
    try {
      const res = await authedFetch(`/api/email/templates/${editor.template.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Template supprimé");
      setTemplates((prev) => prev.filter((x) => x.id !== editor.template.id));
      setEditor({ mode: "idle" });
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const selectedTemplate =
    editor.mode === "edit" || editor.mode === "view" ? editor.template : null;

  return (
    <div className="au-skin msg-page" style={{ height: "100%", overflow: "hidden" }}>
      <TemplateSide
        templates={templates}
        loading={loading}
        selected={selectedTemplate}
        filter={filter}
        search={search}
        onFilter={setFilter}
        onSearch={setSearch}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <EditorPanel
        state={editor}
        form={form}
        saving={saving}
        onChange={patchForm}
        onSave={handleSave}
        onCancel={handleCancel}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
      <PreviewPanel
        form={form}
        template={selectedTemplate}
      />
    </div>
  );
}
