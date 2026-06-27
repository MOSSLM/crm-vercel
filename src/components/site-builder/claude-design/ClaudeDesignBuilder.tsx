"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CopyPlus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";
import type { SitemapPage } from "@/types";
import type { Tweaks } from "@/lib/site-builder/claude-design/apply-tweaks";
import type { TweaksSchema } from "@/lib/site-builder/claude-design/parse-tweaks-schema";
import { InlinePreview, type OverrideEntry } from "./InlinePreview";
import { TweaksPanel } from "./TweaksPanel";
import { VariablesPanel } from "./VariablesPanel";
import { TagToggles } from "./TagToggles";

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
}
interface Company { id: number; nom: string; pret_pour_lm?: boolean }

type TopTab = "pages" | "entreprises";
type RightTab = "tweaks" | "variables" | "tags";

export function ClaudeDesignBuilder({ siteId }: { siteId: string }) {
  const [data, setData] = React.useState<BoardData | null>(null);
  const [activeSlug, setActiveSlug] = React.useState("/");
  const [topTab, setTopTab] = React.useState<TopTab>("pages");
  const [rightTab, setRightTab] = React.useState<RightTab>("tweaks");
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [companyId, setCompanyId] = React.useState<number | null>(null);
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

  // Lazy-load the company list the first time the Entreprises tab opens.
  React.useEffect(() => {
    if (topTab !== "entreprises" || companies.length > 0) return;
    authedFetch("/api/site-builder/entreprises")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => toast.error("Liste des entreprises indisponible"));
  }, [topTab, companies.length]);

  const selectCompany = async (id: number | null) => {
    setCompanyId(id);
    if (!id) { setCompanyVars(null); return; }
    try {
      const res = await authedFetch(`/api/site-builder/variables?enterprise=${id}&site=${siteId}`);
      setCompanyVars(res.ok ? ((await res.json()) as Record<string, string>) : null);
    } catch { setCompanyVars(null); }
  };

  const debounce = (key: string, fn: () => void, ms = 600) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(fn, ms);
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

  // No publishing here — we only prepare templates. "Créer template" snapshots
  // the current tweaks/edits into a new reusable variation.
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

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;

  const previewVars = topTab === "entreprises" ? companyVars : null;
  const taggedOnActive = active ? (active.html.match(/data-service-tag="([^"]+)"/g) ?? []).map((m) => m.replace(/.*"([^"]+)".*/, "$1")) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Topbar */}
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/site-builder/claude" title="Retour au CRM">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <span className="text-sm font-semibold truncate max-w-[240px]">{data.name}</span>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-0.5">
          {(["pages", "entreprises"] as TopTab[]).map((t) => (
            <button key={t} onClick={() => setTopTab(t)}
              className={`rounded px-3 py-1 text-xs ${topTab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {t === "pages" ? "Pages" : "Entreprises"}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-2" onClick={handleCreateTemplate}>
          <CopyPlus className="h-4 w-4" /> Créer template
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-[200px_1fr_320px] overflow-hidden">
        {/* Left: vertical pages list */}
        <nav className="flex flex-col gap-0.5 overflow-y-auto border-r p-2">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Pages</div>
          {data.pages.map((p) => (
            <button key={p.slug} onClick={() => setActiveSlug(p.slug)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${p.slug === activeSlug ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{p.title}</span>
              {p.serviceTag && <span className="ml-auto shrink-0 rounded bg-black/10 px-1 text-[9px]">{p.serviceTag}</span>}
            </button>
          ))}
        </nav>

        {/* Center: preview */}
        <div className="overflow-hidden p-2">
          {active && (
            <InlinePreview
              key={active.slug + (previewVars ? `:${companyId}` : "")}
              html={active.html}
              sharedCss={data.sharedAssets.css ?? ""}
              fontLinks={data.sharedAssets.fonts ?? []}
              tweaks={data.tweaks}
              overrides={active.overrides}
              onEdit={handleEdit}
              variables={previewVars}
              onNavigate={(slug) => { if (data.pages.some((p) => p.slug === slug)) setActiveSlug(slug); }}
            />
          )}
        </div>

        {/* Right: contextual panel */}
        <aside className="flex flex-col gap-3 overflow-y-auto border-l p-3">
          {topTab === "pages" ? (
            <>
              <div className="flex gap-1">
                {(["tweaks", "variables", "tags"] as RightTab[]).map((t) => (
                  <button key={t} onClick={() => setRightTab(t)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs ${rightTab === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>
                    {t === "tweaks" ? "Thème" : t === "variables" ? "Variables" : "Tags"}
                  </button>
                ))}
              </div>
              {rightTab === "tweaks" && (
                <TweaksPanel
                  controls={[...(data.tweaksSchema?.theme ?? []), ...(data.tweaksSchema?.pageExtras?.[activeSlug] ?? [])]}
                  tweaks={data.tweaks}
                  onChange={handleTweak}
                />
              )}
              {rightTab === "variables" && <VariablesPanel siteId={siteId} onRetokenised={load} />}
              {rightTab === "tags" && (
                <>
                  <TagToggles sitemap={data.sitemap} onChange={handleTag} />
                  {taggedOnActive.length > 0 && (
                    <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
                      Sections conditionnées sur cette page : {[...new Set(taggedOnActive)].join(", ")}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="text-xs text-muted-foreground">
                Choisis une entreprise pour prévisualiser le template avec ses vraies données et ses pages/sections filtrées par ses services.
              </div>
              <select className="rounded-md border bg-background px-2 py-1.5 text-sm"
                value={companyId ?? ""} onChange={(e) => selectCompany(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Données d&apos;exemple —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.pret_pour_lm ? " · LM" : ""}</option>)}
              </select>
              {companyVars && (
                <div className="rounded-md border p-2 text-[11px]">
                  <div><b>{companyVars["entreprise.nom"]}</b></div>
                  <div className="text-muted-foreground">{companyVars["entreprise.ville"]} · {companyVars["entreprise.telephone"]}</div>
                  {(() => { try { const t = JSON.parse(companyVars["__service_tags"] ?? "[]"); return Array.isArray(t) && t.length ? <div className="mt-1 text-muted-foreground">Services : {t.join(", ")}</div> : null; } catch { return null; } })()}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      {topTab === "pages" && (
        <p className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">
          Clique un texte pour l&apos;éditer, une image pour changer son URL. Enregistrement automatique.
        </p>
      )}
    </div>
  );
}

export default ClaudeDesignBuilder;
