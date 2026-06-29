"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronDown, Check, Play, Monitor, Smartphone, CopyPlus,
  Minus, Plus, Maximize2, Sparkles, Tags, Variable, Building2,
  Wand2, AlertTriangle, Eye, EyeOff, Rocket, Globe,
} from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import type { SitemapPage } from "@/types";
import type { Tweaks } from "@/lib/site-builder/claude-design/apply-tweaks";
import type { TweakControl, TweaksSchema } from "@/lib/site-builder/claude-design/parse-tweaks-schema";
import { getSimulatedViewportHeight } from "@/lib/site-builder/preview-viewport";
import { InlinePreview, type OverrideEntry } from "./InlinePreview";
import { ClaudeDesignTheme } from "./ClaudeDesignTheme";
import { CLAUDE_DESIGN_VARIABLES } from "./VariablesPanel";

interface PageData {
  slug: string;
  instanceId: string;
  title: string;
  serviceTag: string | null;
  html: string;
  overrides: Record<string, OverrideEntry>;
}
interface BoardData {
  name: string;
  sharedAssets: { css?: string; fonts?: string[] };
  tweaks: Tweaks;
  tweaksSchema: TweaksSchema;
  sitemap: SitemapPage[];
  pages: PageData[];
  isTemplate: boolean;
  enterpriseId: number | null;
  publishedSubdomain: string | null;
}
interface Company { id: number; nom: string; pret_pour_lm?: boolean }

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr";

type LeftTab = "theme" | "tags";
type Viewport = "desktop" | "mobile";
type SaveState = "saved" | "pending";

/* ── small helpers ─────────────────────────────────────────────── */
const DOT_COLORS = ["#E2552B", "#2A6FDB", "#1F8A5B", "#7A5AE0", "#C8881F", "#B5322F"];
function companyColor(id: number) { return DOT_COLORS[Math.abs(id) % DOT_COLORS.length]; }
function companyInitials(nom: string) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export function ClaudeDesignBuilder({ siteId }: { siteId: string }) {
  const [data, setData] = React.useState<BoardData | null>(null);
  const [activeSlug, setActiveSlug] = React.useState("/");
  const [leftTab, setLeftTab] = React.useState<LeftTab>("theme");
  const [viewport, setViewport] = React.useState<Viewport>("desktop");
  const [save, setSave] = React.useState<SaveState>("saved");
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [company, setCompany] = React.useState<Company | null>(null);
  const [companyVars, setCompanyVars] = React.useState<Record<string, string> | null>(null);
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = React.useCallback(async () => {
    const res = await authedFetch(`/api/site-builder/claude/${siteId}/pages`);
    if (!res.ok) { toast.error("Chargement impossible"); return; }
    const d = (await res.json()) as BoardData;
    setData(d);
    setActiveSlug((prev) => (d.pages.some((p) => p.slug === prev) ? prev : d.pages[0]?.slug ?? "/"));
  }, [siteId]);

  React.useEffect(() => { load(); }, [load]);

  // Lazy-load companies the first time the picker is opened.
  const ensureCompanies = React.useCallback(() => {
    if (companies.length > 0) return;
    authedFetch("/api/site-builder/entreprises")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => toast.error("Liste des entreprises indisponible"));
  }, [companies.length]);

  const selectCompany = async (c: Company | null) => {
    setCompany(c);
    if (!c) { setCompanyVars(null); return; }
    try {
      const res = await authedFetch(`/api/site-builder/variables?enterprise=${c.id}&site=${siteId}`);
      setCompanyVars(res.ok ? ((await res.json()) as Record<string, string>) : null);
    } catch { setCompanyVars(null); }
  };

  const debounce = (key: string, fn: () => Promise<void>, ms = 600) => {
    setSave("pending");
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => { await fn(); setSave("saved"); }, ms);
  };

  const active = data?.pages.find((p) => p.slug === activeSlug) ?? null;

  const handleEdit = (key: string, entry: OverrideEntry) => {
    if (!data || !active) return;
    const overrides = { ...active.overrides, [key]: entry };
    setData({ ...data, pages: data.pages.map((p) => p.slug === active.slug ? { ...p, overrides } : p) });
    debounce(`ov-${active.instanceId}`, async () => {
      await authedFetch(`/api/site-builder/claude/${siteId}/pages`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: active.instanceId, overrides }),
      });
    });
  };

  const handleTweak = (k: string, v: string) => {
    if (!data) return;
    const tweaks = { ...data.tweaks, [k]: v };
    setData({ ...data, tweaks });
    debounce("tweaks", async () => {
      await authedFetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tweaks }),
      });
    });
  };

  const handleTag = (slug: string, serviceTag: string | null) => {
    if (!data) return;
    const sitemap = data.sitemap.map((p) => p.slug === slug ? { ...p, service_tag: serviceTag } : p);
    const pages = data.pages.map((p) => p.slug === slug ? { ...p, serviceTag } : p);
    setData({ ...data, sitemap, pages });
    debounce("sitemap", async () => {
      await authedFetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sitemap }),
      });
    });
  };

  // "Créer template" snapshots the current tweaks/edits into a new reusable variation.
  const handleCreateTemplate = async () => {
    const t = toast.loading("Création du template…");
    try {
      const res = await authedFetch(`/api/site-builder/claude/${siteId}/duplicate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      toast.success(`Template créé : ${body.name}`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible", { id: t });
    }
  };

  // "Publier" deploys a demo/project site on an auto-derived subdomain (same
  // path as the kanban "Déployer"); re-publishing keeps the existing subdomain.
  const [publishing, setPublishing] = React.useState(false);
  const handlePublish = async () => {
    setPublishing(true);
    const already = !!data?.publishedSubdomain;
    const t = toast.loading(already ? "Republication…" : "Publication…");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/deploy`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      setData((prev) => (prev ? { ...prev, publishedSubdomain: body.subdomain ?? prev.publishedSubdomain } : prev));
      toast.success(`En ligne : ${body.url}`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publication impossible", { id: t });
    } finally {
      setPublishing(false);
    }
  };

  if (!data) {
    return (
      <div className="cd-scope" style={{ height: "100%", background: "var(--bg)" }}>
        <ClaudeDesignTheme />
        <div style={{ padding: 24, fontSize: 13, color: "var(--text-3)" }}>Chargement…</div>
      </div>
    );
  }

  const previewVars = company ? companyVars : null;
  const themeControls: TweakControl[] = [
    ...(data.tweaksSchema?.theme ?? []),
    ...(data.tweaksSchema?.pageExtras?.[activeSlug] ?? []),
  ];

  return (
    <div className="cd-scope cd-editor" style={{ background: "var(--bg)" }}>
      <ClaudeDesignTheme />

      {/* ── TOPBAR ───────────────────────────────────────────── */}
      <div className="cd-topbar">
        <Link href="/site-builder/claude" title="Retour aux designs">
          <button className="cd-back"><ChevronLeft className="ico-sm" />Designs</button>
        </Link>
        <div className="cd-crumbs"><span className="cur">{data.name}</span></div>
        <span className={"cd-saved" + (save === "pending" ? " dirty" : "")}>
          <i />{save === "pending" ? "Enregistrement…" : "Enregistré"}
        </span>
        <div className="cd-grow" />
        <CompanyPicker
          company={company}
          companies={companies}
          onOpen={ensureCompanies}
          onPick={selectCompany}
        />
        <div className="cd-vp-pick">
          <button className={"cd-vp" + (viewport === "desktop" ? " on" : "")} onClick={() => setViewport("desktop")} title="Bureau"><Monitor className="ico-sm" /></button>
          <button className={"cd-vp" + (viewport === "mobile" ? " on" : "")} onClick={() => setViewport("mobile")} title="Mobile"><Smartphone className="ico-sm" /></button>
        </div>
        <div className="cd-save-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!data.isTemplate && data.publishedSubdomain ? (
            <a
              href={`https://${data.publishedSubdomain}.${SITE_DOMAIN}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--info)" }}
            >
              <Globe className="ico-xs" />{data.publishedSubdomain}.{SITE_DOMAIN}
            </a>
          ) : null}
          {data.isTemplate ? (
            <button className="cd-btn accent" onClick={handleCreateTemplate}><CopyPlus className="ico-sm" />Créer un template</button>
          ) : (
            <button className="cd-btn accent" onClick={handlePublish} disabled={publishing}>
              <Rocket className="ico-sm" />{data.publishedSubdomain ? "Republier" : "Publier"}
            </button>
          )}
        </div>
      </div>

      {/* ── PAGES BAR ────────────────────────────────────────── */}
      <div className="cd-tpl-bar">
        <span className="cd-tpl-lab"><Sparkles className="ico-xs" />Pages</span>
        {data.pages.map((p) => (
          <button key={p.slug} className={"cd-tpl" + (activeSlug === p.slug ? " on" : "")} onClick={() => setActiveSlug(p.slug)}>
            <span className="cd-tpl-dot" style={{ background: p.serviceTag ? "var(--info)" : "var(--text-4)" }} />
            {p.title || p.slug}
            {p.serviceTag ? <span className="cd-tpl-meta">{p.serviceTag}</span> : null}
          </button>
        ))}
        <div className="cd-grow" />
        <span className="cd-tpl-hint"><Sparkles className="ico-xs" />Clique un texte pour l’éditer, une image pour changer son URL</span>
      </div>

      {/* ── BODY ─────────────────────────────────────────────── */}
      <div className="cd-body">
        {/* LEFT */}
        <aside className="cd-pane cd-left">
          <div className="cd-left-tabs">
            <button className={"cd-left-tab" + (leftTab === "theme" ? " on" : "")} onClick={() => setLeftTab("theme")}><Sparkles className="ico-sm" />Thème</button>
            <button className={"cd-left-tab" + (leftTab === "tags" ? " on" : "")} onClick={() => setLeftTab("tags")}><Tags className="ico-sm" />Tags</button>
          </div>
          <div className="cd-left-body">
            {leftTab === "theme"
              ? <DesignTweaks controls={themeControls} tweaks={data.tweaks} onChange={handleTweak} />
              : <PageTags sitemap={data.sitemap} company={company} companyVars={companyVars} onChange={handleTag} />}
          </div>
        </aside>

        {/* CENTER */}
        {active && (
          <CanvasStage
            key={active.slug + (previewVars ? `:${company?.id}` : "")}
            viewport={viewport}
            company={company}
          >
            <InlinePreview
              html={active.html}
              sharedCss={data.sharedAssets.css ?? ""}
              fontLinks={data.sharedAssets.fonts ?? []}
              tweaks={data.tweaks}
              overrides={active.overrides}
              onEdit={handleEdit}
              variables={previewVars}
              simViewportHeight={getSimulatedViewportHeight(viewport)}
              onNavigate={(slug) => { if (data.pages.some((p) => p.slug === slug)) setActiveSlug(slug); }}
            />
          </CanvasStage>
        )}

        {/* RIGHT */}
        <aside className="cd-pane cd-inspector">
          <VariableBrowser siteId={siteId} company={company} companyVars={companyVars} onRetokenised={load} />
        </aside>
      </div>
    </div>
  );
}

/* ════════════════ Company picker ════════════════ */
function CompanyPicker({ company, companies, onOpen, onPick }: {
  company: Company | null;
  companies: Company[];
  onOpen: () => void;
  onPick: (c: Company | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = () => { setOpen((o) => { const n = !o; if (n) onOpen(); return n; }); };
  return (
    <div className="cd-pick-wrap">
      <button className={"cd-company-btn" + (company ? " active" : "")} onClick={toggle}>
        <Play className="ico-sm" />
        <span className="cd-company-lab">Tester :</span>
        {company ? (
          <span className="cd-company-cur"><span className="cd-company-dot" style={{ background: companyColor(company.id) }}>{companyInitials(company.nom)}</span>{company.nom}</span>
        ) : (
          <span className="cd-company-cur muted">Données d’exemple</span>
        )}
        <ChevronDown className="ico-xs" />
      </button>
      {open ? (
        <>
          <div className="cd-pop-backdrop" onClick={() => setOpen(false)} />
          <div className="cd-pop cd-company-pop">
            <div className="cd-pop-hd">Entreprises qualifiées · CRM</div>
            <button className={"cd-company-row" + (!company ? " sel" : "")} onClick={() => { onPick(null); setOpen(false); }}>
              <span className="cd-company-dot ghost" />
              <div className="cd-grow"><b>Données d’exemple</b><span>Affiche les contenus d’origine</span></div>
              {!company ? <Check className="ico-sm" /> : null}
            </button>
            {companies.length === 0 ? (
              <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-3)" }}>Chargement…</div>
            ) : companies.map((c) => (
              <button key={c.id} className={"cd-company-row" + (company?.id === c.id ? " sel" : "")} onClick={() => { onPick(c); setOpen(false); }}>
                <span className="cd-company-dot" style={{ background: companyColor(c.id) }}>{companyInitials(c.nom)}</span>
                <div className="cd-grow"><b>{c.nom}</b><span>{c.pret_pour_lm ? "Prêt pour Lead Magnet" : "Qualifiée"}</span></div>
                {company?.id === c.id ? <Check className="ico-sm" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ════════════════ Canvas stage (device frame + zoom) ════════════════ */
function CanvasStage({ viewport, company, children }: {
  viewport: Viewport;
  company: Company | null;
  children: React.ReactElement<{ onHeight?: (h: number) => void; className?: string }>;
}) {
  const siteW = viewport === "mobile" ? 390 : 1080;
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(0.7);
  const [frameH, setFrameH] = React.useState(1400);

  const fit = React.useCallback(() => {
    const area = areaRef.current; if (!area) return;
    const f = Math.min(1, (area.clientWidth - 72) / siteW);
    setZoom(viewport === "mobile" ? Math.min(1, f * 1.4) : f);
  }, [siteW, viewport]);

  React.useLayoutEffect(() => { fit(); }, [fit]);

  const framed = React.cloneElement(children, {
    onHeight: (h: number) => setFrameH(Math.max(600, h)),
    className: "cd-frame-iframe",
  });

  return (
    <main className="cd-canvas-host">
      <div className="cd-canvas-area grid-dots" ref={areaRef}>
        <div className="cd-frame-sizer" style={{ width: siteW * zoom, height: frameH * zoom }}>
          <div
            className={"cd-frame" + (viewport === "mobile" ? " mobile" : "")}
            style={{ width: siteW, height: frameH, transform: `scale(${zoom})` }}
          >
            {framed}
          </div>
        </div>
      </div>

      <div className="cd-canvas-tools">
        <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}><Minus className="ico-sm" /></button>
        <span className="cd-zoom-val">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}><Plus className="ico-sm" /></button>
        <span className="cd-tools-sep" />
        <button onClick={fit}><Maximize2 className="ico-sm" />Ajuster</button>
      </div>

      {company ? (
        <div className="cd-testing-badge">
          <span className="cd-company-dot" style={{ background: companyColor(company.id) }}>{companyInitials(company.nom)}</span>
          Aperçu : <b>{company.nom}</b>
        </div>
      ) : (
        <div className="cd-testing-badge muted"><AlertTriangle className="ico-xs" />Données d’exemple — choisis une entreprise pour tester</div>
      )}
    </main>
  );
}

/* ════════════════ Design tweaks (left · Thème) ════════════════ */
function DesignTweaks({ controls, tweaks, onChange }: {
  controls: TweakControl[];
  tweaks: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const val = (k: string, d = "") => (typeof tweaks[k] === "string" ? (tweaks[k] as string) : d);
  if (controls.length === 0) {
    return <div className="cd-dtweaks"><div className="cd-dtweaks-note"><Sparkles className="ico-sm" />Aucun réglage de thème détecté pour ce design.</div></div>;
  }
  return (
    <div className="cd-dtweaks">
      <div className="cd-dtweaks-note">
        <Sparkles className="ico-sm" />
        Tweaks détectés dans le design Claude — réglables ici, figés au déploiement.
      </div>
      {controls.map((c) => {
        const current = val(c.key, c.options[0] ?? "");
        return (
          <div className="cd-dtweak" key={c.key}>
            <div className="cd-dtweak-lab">{c.label}</div>
            {c.type === "color" ? (
              <div className="cd-swatches">
                {c.options.map((hex) => (
                  <button key={hex} title={hex} className={"cd-swatch" + (current.toLowerCase() === hex.toLowerCase() ? " sel" : "")} style={{ background: hex }} onClick={() => onChange(c.key, hex)} />
                ))}
              </div>
            ) : (
              <div className="cd-seg">
                {c.options.map((o) => (
                  <button key={o} className={"cd-seg-b" + (current === o ? " on" : "")} onClick={() => onChange(c.key, o)}>{o}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════ Per-page tags (left · Tags) ════════════════ */
function PageTags({ sitemap, company, companyVars, onChange }: {
  sitemap: SitemapPage[];
  company: Company | null;
  companyVars: Record<string, string> | null;
  onChange: (slug: string, serviceTag: string | null) => void;
}) {
  const companyTags = React.useMemo<string[]>(() => {
    try { const t = JSON.parse(companyVars?.["__service_tags"] ?? "[]"); return Array.isArray(t) ? t.map(String) : []; }
    catch { return []; }
  }, [companyVars]);

  return (
    <div className="cd-dtweaks">
      <div className="cd-dtweaks-note" style={{ color: "var(--info)", background: "var(--info-tint)", borderColor: "rgba(42,111,219,.2)" }}>
        <Tags className="ico-sm" />
        Une page avec un tag de service ne s’affiche que pour les entreprises ayant ce service.
      </div>
      {sitemap.map((p) => {
        const tag = p.service_tag ?? "";
        const state = tag && company ? (companyTags.includes(tag) ? "on" : "off") : null;
        return (
          <div className="cd-dtweak" key={p.slug}>
            <div className="cd-dtweak-lab">{p.title || p.slug}</div>
            <input
              className="cd-select"
              style={{ width: "100%" }}
              placeholder="Aucun tag (toujours visible)"
              defaultValue={tag}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== tag) onChange(p.slug, v || null); }}
            />
            {state ? (
              <div className={"cd-cond-state " + state} style={{ marginTop: 6 }}>
                {state === "on"
                  ? <><Eye className="ico-xs" />Visible pour {company?.nom}</>
                  : <><EyeOff className="ico-xs" />Masquée — {company?.nom} n’a pas ce service</>}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════ Variable browser (right · inspector) ════════════════ */
const VAR_GROUP_ICON = Building2;
function VariableBrowser({ siteId, company, companyVars, onRetokenised }: {
  siteId: string;
  company: Company | null;
  companyVars: Record<string, string> | null;
  onRetokenised: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const retokenise = async () => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/tokenize`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      const { mapping } = (await res.json()) as { mapping?: unknown[] };
      toast.success(`${mapping?.length ?? 0} variable(s) détectée(s)`);
      onRetokenised();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Détection impossible");
    } finally { setBusy(false); }
  };

  const services = React.useMemo<string[]>(() => {
    try { const t = JSON.parse(companyVars?.["__service_tags"] ?? "[]"); return Array.isArray(t) ? t.map(String) : []; }
    catch { return []; }
  }, [companyVars]);

  return (
    <div className="cd-varbrowser">
      {company && companyVars ? (
        <div className="cd-company-card">
          <div className="cd-company-card-hd">
            <span className="cd-company-dot" style={{ background: companyColor(company.id) }}>{companyInitials(company.nom)}</span>
            <div className="cd-grow">
              <b>{companyVars["entreprise.nom"] || company.nom}</b>
              <span>{[companyVars["entreprise.ville"], companyVars["entreprise.telephone"]].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          {services.length > 0 ? <div className="cd-company-card-tags">{services.map((s) => <span key={s} className="cd-tag-chip">{s}</span>)}</div> : null}
        </div>
      ) : (
        <div className="cd-vb-empty">
          <span className="cd-vb-ic"><Variable className="ico-lg" /></span>
          <p>Choisis une entreprise dans la barre du haut pour prévisualiser le design avec ses vraies données.</p>
        </div>
      )}

      <div className="cd-vb-actions">
        <button className="cd-btn outline" onClick={retokenise} disabled={busy}><Wand2 className="ico-sm" />{busy ? "Détection…" : "Re-détecter (IA)"}</button>
      </div>

      <div className="cd-vb-hd">Variables disponibles</div>
      <div className="cd-vb-group">
        <div className="cd-vb-group-hd">
          <VAR_GROUP_ICON className="ico-sm" style={{ color: "var(--cd-accent)" }} />
          <span>Entreprise</span><code>entreprises</code><span className="cd-vb-count">{CLAUDE_DESIGN_VARIABLES.length}</span>
        </div>
        <div className="cd-vb-vars">
          {CLAUDE_DESIGN_VARIABLES.map((v) => {
            const key = v.token.replace(/\{\{\s*|\s*\}\}/g, "");
            const resolved = company ? companyVars?.[key] : undefined;
            return (
              <div className="cd-vb-var" key={v.token} title={v.token}>
                <span className="cd-var-dot" style={{ background: "var(--cd-accent)" }} />
                <span className="cd-vb-var-lab">{v.label}</span>
                <span className="cd-vb-var-kind">{resolved || v.sample || "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ClaudeDesignBuilder;
