"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileArchive, Pencil, Plus, LayoutGrid, Layers, Upload } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { authedFetch } from "@/utils/authedFetch";
import { SiteKanban } from "@/components/site-builder/claude-design/SiteKanban";
import { MultiPageImportDialog } from "@/components/site-builder/claude-design/MultiPageImportDialog";
import { ClaudeDesignTheme } from "@/components/site-builder/claude-design/ClaudeDesignTheme";
import { CreateDemoSiteDialog } from "@/components/site-builder/claude-design/CreateDemoSiteDialog";

interface TemplateRef { id: string; name: string; demo_count?: number }

type Tab = "templates" | "projets";

const CARD_ACCENTS = ["#E2552B", "#2A6FDB", "#1F8A5B", "#7A5AE0", "#C8881F"];

export default function ClaudeDesignHubPage() {
  const [tab, setTab] = React.useState<Tab>("templates");
  const [templates, setTemplates] = React.useState<TemplateRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [importOpen, setImportOpen] = React.useState(false);
  const [createFor, setCreateFor] = React.useState<TemplateRef | null>(null);

  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/site-builder/claude/board");
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { templates: TemplateRef[] };
      setTemplates(d.templates ?? []);
    } catch {
      toast.error("Chargement des templates impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadTemplates(); }, [loadTemplates]);

  return (
    <AppLayout>
      <div className="cd-scope" style={{ background: "var(--bg)", minHeight: "100%" }}>
        <ClaudeDesignTheme />
        <div style={{ padding: "30px 40px 60px" }}>
          {/* Hero head */}
          <div className="cd-hub-head">
            <div>
              <div className="cd-hub-kicker">Designs importés depuis Claude</div>
              <h1 className="cd-serif" style={{ fontSize: 42, margin: 0, lineHeight: 1, letterSpacing: "-.01em" }}>
                Vos designs <em style={{ fontStyle: "italic", color: "var(--cd-accent)" }}>importés</em>
              </h1>
              <p style={{ fontSize: 13.5, color: "var(--text-3)", margin: "12px 0 0", maxWidth: 460, lineHeight: 1.55 }}>
                Importez un <code style={{ background: "var(--bg-2)", padding: "1px 6px", borderRadius: 4, fontSize: 11.5, color: "var(--text-2)" }}>.zip</code> généré par Claude,
                liez ses zones à vos variables CRM, et enregistrez autant de templates que de cibles.
              </p>
            </div>
            <button className="cd-import-tile" onClick={() => setImportOpen(true)}>
              <span className="cd-import-tile-ic"><Upload className="ico-lg" /></span>
              <b>Importer un .zip</b><span>Glissez votre export Claude</span>
            </button>
          </div>

          {/* Toolbar: tabs + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 22px" }}>
            <div className="cd-seg" style={{ width: "fit-content" }}>
              {(["templates", "projets"] as Tab[]).map((t) => (
                <button key={t} className={"cd-seg-b" + (tab === t ? " on" : "")} style={{ padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6, height: 28 }} onClick={() => setTab(t)}>
                  {t === "templates" ? <Layers className="ico-sm" /> : <LayoutGrid className="ico-sm" />}
                  {t === "templates" ? "Templates" : "Projets"}
                </button>
              ))}
            </div>
            <div className="cd-grow" />
            <button className="cd-btn outline" onClick={() => setImportOpen(true)}><FileArchive className="ico-sm" />Importer un template (ZIP)</button>
            <Link href="/site-builder"><button className="cd-btn ghost"><ArrowLeft className="ico-sm" />Site Builder</button></Link>
          </div>

          {/* Templates grid */}
          {tab === "templates" ? (
            loading ? (
              <div className="cd-hub-grid">
                {[...Array(3)].map((_, i) => <div key={i} style={{ height: 240, background: "var(--bg-2)", borderRadius: 14 }} />)}
              </div>
            ) : templates.length === 0 ? (
              <div style={{ border: "1.5px dashed var(--border-strong)", borderRadius: 14, padding: 40, textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
                Aucun template. Importez un .zip Claude Design pour commencer.
              </div>
            ) : (
              <div className="cd-hub-grid">
                {templates.map((t, i) => {
                  const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                  return (
                    <div key={t.id} className="cd-design-card">
                      <Link href={`/site-builder/claude/${t.id}`} className="cd-design-thumb-link">
                        <div className="cd-design-thumb" style={{ "--c": accent } as React.CSSProperties}>
                          <div className="cd-thumb-nav"><span className="cd-thumb-logo" style={{ background: accent }} /><span className="cd-thumb-dots"><i /><i /><i /></span></div>
                          <div className="cd-thumb-hero"><div className="cd-thumb-h1" /><div className="cd-thumb-line" /><div className="cd-thumb-line s" /><div className="cd-thumb-btn" style={{ background: accent }} /></div>
                          <div className="cd-thumb-grid"><i /><i /><i /></div>
                          <span className="cd-thumb-kind">Template</span>
                        </div>
                      </Link>
                      <div className="cd-design-meta">
                        <div className="cd-design-name">{t.name}</div>
                        {/* Ce qui sépare le modèle des sites qui en sortent : le
                            compte de démos déjà produites depuis ce template. */}
                        <div className="cd-design-file">
                          <Upload className="ico-xs" />
                          {(t.demo_count ?? 0) > 0
                            ? `${t.demo_count} site${t.demo_count! > 1 ? "s" : ""} démo`
                            : "Aucun site démo"}
                        </div>
                        <div className="cd-design-actions">
                          <Link href={`/site-builder/claude/${t.id}`} style={{ flex: 1 }}>
                            <button className="cd-btn outline"><Pencil className="ico-xs" />Éditeur</button>
                          </Link>
                          <button className="cd-btn accent" onClick={() => setCreateFor(t)}><Plus className="ico-xs" />Créer un site</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Projets board rendered outside .cd-scope to keep its shadcn styling intact */}
      {tab === "projets" ? <div className="p-6"><SiteKanban /></div> : null}

      <MultiPageImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={loadTemplates} />
      <CreateDemoSiteDialog
        template={createFor}
        onClose={() => setCreateFor(null)}
        onCreated={() => { setCreateFor(null); loadTemplates(); setTab("projets"); }}
      />
    </AppLayout>
  );
}
